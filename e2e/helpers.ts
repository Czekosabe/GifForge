import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { parseGIF, decompressFrames, type ParsedFrame } from 'gifuct-js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const FIXTURES_DIR = path.resolve(here, '../fixtures')
export const LOADING_ICON_GIF = path.join(FIXTURES_DIR, 'loading-icon.gif') // 441x291, 24 frames, 50ms delay each
export const ROTATING_EARTH_GIF = path.join(FIXTURES_DIR, 'rotating-earth.gif') // 400x400, 44 frames
export const OVERLAY_RED_PNG = path.join(FIXTURES_DIR, 'test-overlay-red.png')
export const OVERLAY_BLUE_PNG = path.join(FIXTURES_DIR, 'test-overlay-blue.png')

/**
 * The WebKit build used by this project's Playwright tests does not implement
 * OffscreenCanvas in any context (verified directly: `typeof OffscreenCanvas` is
 * `undefined` on both the main thread and inside a Worker) — real, current Safari's
 * support was not independently verified. GifForge's worker detects this and fails
 * fast with a clear message (see `assertOffscreenCanvasSupport` in
 * `pipeline.worker.ts`) rather than crashing, but any test that exercises
 * export/optimize/static-frame-export genuinely cannot pass in this environment, so
 * it should skip with a reason instead of failing red for a known, external cause.
 */
export const OFFSCREEN_CANVAS_UNSUPPORTED_REASON =
  'The Playwright WebKit build used for this project has no OffscreenCanvas support (main thread or Worker), which GifForge requires for export/optimize/static-frame-export — see docs/IMPLEMENTATION_STATUS.md.'

export interface DecodedGifFile {
  width: number
  height: number
  frames: ParsedFrame[]
}

/** Decodes a GIF file from disk (or from a Playwright download) for assertions on real output. */
export function decodeGifFile(filePath: string): DecodedGifFile {
  const buf = readFileSync(filePath)
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const gif = parseGIF(arrayBuffer)
  const frames = decompressFrames(gif, true)
  return { width: gif.lsd.width, height: gif.lsd.height, frames }
}

export function centerPixel(frame: ParsedFrame): [number, number, number, number] {
  const { width, height } = frame.dims
  const cx = Math.floor(width / 2)
  const cy = Math.floor(height / 2)
  const idx = (cy * width + cx) * 4
  return [frame.patch[idx]!, frame.patch[idx + 1]!, frame.patch[idx + 2]!, frame.patch[idx + 3]!]
}

/** Uploads a GIF via the visible file input and waits for the editor shell to appear. */
export async function uploadGif(page: Page, filePath: string): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('text=GifForge', { timeout: 15_000 })
  await page.locator('input[type=file]').setInputFiles(filePath)
  await page.waitForSelector('button[title="Crop"]', { timeout: 30_000 })
  await page.waitForTimeout(500) // let preview bitmaps / first frame paint settle
}

export function frameCounterLocator(page: Page) {
  return page.locator('text=/^Frame \\d+ \\/ \\d+$/')
}

/** Reads the RGBA color of the center pixel of the topmost (layers) Konva canvas, for z-order/overlay checks. */
export async function layerCanvasCenterPixel(page: Page): Promise<[number, number, number, number]> {
  return page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'))
    const maxArea = Math.max(...canvases.map((c) => c.width * c.height))
    const layerCanvas = canvases.filter((c) => c.width * c.height === maxArea)[1]
    if (!layerCanvas) throw new Error('Layers canvas not found')
    const ctx = layerCanvas.getContext('2d')!
    const d = ctx.getImageData(Math.floor(layerCanvas.width / 2), Math.floor(layerCanvas.height / 2), 1, 1).data
    return [d[0], d[1], d[2], d[3]] as [number, number, number, number]
  })
}

/** True if the largest on-screen canvas has any non-transparent pixel — catches "silently rendered nothing" bugs. */
export async function stageHasVisibleContent(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'))
    const maxArea = Math.max(...canvases.map((c) => c.width * c.height))
    const stageCanvas = canvases.find((c) => c.width * c.height === maxArea)
    if (!stageCanvas) return false
    const ctx = stageCanvas.getContext('2d')!
    const data = ctx.getImageData(0, 0, stageCanvas.width, stageCanvas.height).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! > 10) return true
    }
    return false
  })
}

export interface DecodedVideoInfo {
  videoWidth: number
  videoHeight: number
  duration: number
}

/**
 * Loads a downloaded video file into a REAL `<video>` element (not just a byte-length check)
 * to prove it's actually decodable/playable in this browser, then reports its real metadata.
 * Reads the file from disk in Node (Playwright's own process) and hands it to the page as a
 * Blob URL, since the download lives outside the page's own origin.
 */
export async function loadVideoMetadata(page: Page, filePath: string, mimeType: string): Promise<DecodedVideoInfo> {
  const bytes = readFileSync(filePath)
  const base64 = bytes.toString('base64')
  return page.evaluate(
    async ({ base64, mimeType }) => {
      const binary = atob(base64)
      const arr = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
      const blob = new Blob([arr], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const video = document.createElement('video')
      video.src = url
      video.muted = true
      document.body.appendChild(video)
      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadedmetadata', () => resolve(), { once: true })
        video.addEventListener('error', () => reject(new Error('video failed to load: ' + video.error?.message)), { once: true })
        setTimeout(() => reject(new Error('timed out waiting for loadedmetadata')), 10_000)
      })
      return { videoWidth: video.videoWidth, videoHeight: video.videoHeight, duration: video.duration }
    },
    { base64, mimeType },
  )
}

/** Seeks a video (already appended to the DOM by `loadVideoMetadata`, found by its blob src)
 * to `timeSeconds` and returns the center-pixel RGBA drawn from that exact frame — for
 * verifying the video's actual decoded content reflects a real project edit. */
export async function videoCenterPixelAt(page: Page, timeSeconds: number): Promise<[number, number, number, number]> {
  return page.evaluate(async (t) => {
    const video = document.querySelector('video') as HTMLVideoElement
    await video.play().catch(() => {})
    video.pause()
    video.currentTime = Math.min(t, video.duration - 0.01)
    await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }))
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)
    const d = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
    return [d[0], d[1], d[2], d[3]] as [number, number, number, number]
  }, timeSeconds)
}
