import { test, expect, type Page } from '@playwright/test'
import { statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
// gifenc has no proper ESM "exports" map (only "main"/"module" fields) — Node's CJS/ESM
// interop can't statically detect its named exports the way Vite does, so import the whole
// CJS module object as default and destructure from that instead.
import gifencModule from 'gifenc'
const { GIFEncoder, quantize, applyPalette } = gifencModule as unknown as {
  GIFEncoder: () => { writeFrame: (...args: unknown[]) => void; finish: () => void; bytes: () => Uint8Array }
  quantize: (rgba: Uint8ClampedArray, colors: number) => number[][]
  applyPalette: (rgba: Uint8ClampedArray, palette: number[][]) => Uint8Array
}
import {
  LOADING_ICON_GIF,
  OFFSCREEN_CANVAS_UNSUPPORTED_REASON,
  OVERLAY_RED_PNG,
  ROTATING_EARTH_GIF,
  loadVideoMetadata,
  uploadGif,
  videoCenterPixelAt,
} from './helpers'

/** Generates a tiny (10x10, 4-frame), deterministic GIF with genuinely variable per-frame
 * delays (40/80/20/120ms) for the timing-regression test — no committed fixtures have
 * variable delays, and this is far too small to be worth committing as a binary. */
function generateVariableDelayFixture(): { path: string; delaysMs: number[] } {
  const delaysMs = [40, 80, 20, 120]
  const width = 10
  const height = 10
  const enc = GIFEncoder()
  delaysMs.forEach((delay, i) => {
    const rgba = new Uint8ClampedArray(width * height * 4)
    const shade = Math.round((i / delaysMs.length) * 255)
    for (let p = 0; p < width * height; p++) {
      rgba[p * 4] = shade
      rgba[p * 4 + 1] = 0
      rgba[p * 4 + 2] = 255 - shade
      rgba[p * 4 + 3] = 255
    }
    const palette = quantize(rgba, 8)
    const index = applyPalette(rgba, palette)
    enc.writeFrame(index, width, height, { palette, delay, first: i === 0 })
  })
  enc.finish()
  const outPath = path.join(tmpdir(), 'gifforge-variable-delay-fixture.gif')
  writeFileSync(outPath, Buffer.from(enc.bytes()))
  return { path: outPath, delaysMs }
}

async function openExportFormat(page: Page, format: 'MP4' | 'WEBM') {
  await page.locator('button[title="Export"]').click()
  await page.locator(`button:has-text("${format}")`).click()
  await page.waitForTimeout(1200) // let the async capability probe resolve
}

async function isFormatAvailable(page: Page, format: 'mp4' | 'webm'): Promise<boolean> {
  const text = await page
    .locator(`text=/${format.toUpperCase()}:/`)
    .first()
    .textContent()
  return !!text?.includes('Available')
}

test.describe('video export (MP4/WebM)', () => {
  test('capability detection shows a real, non-alarming state for both formats without exporting anything', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await uploadGif(page, LOADING_ICON_GIF)
    await openExportFormat(page, 'MP4')
    const mp4Text = await page.locator('text=/MP4:/').first().textContent()
    expect(mp4Text).toMatch(/Available|cannot encode/)
    // Never a raw codec string as the primary message — that's only shown in Advanced mode.
    expect(mp4Text).not.toMatch(/avc1\.|vp09\./)

    await openExportFormat(page, 'WEBM')
    const webmText = await page.locator('text=/WEBM:/').first().textContent()
    expect(webmText).toMatch(/Available|cannot encode/)

    expect(pageErrors).toEqual([])
  })

  test('a real WebM file exports, downloads, and plays in an actual <video> element', async ({ page }) => {
    test.slow()
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await uploadGif(page, LOADING_ICON_GIF)
    await openExportFormat(page, 'WEBM')
    test.skip(!(await isFormatAvailable(page, 'webm')), 'WebM encoding is unavailable in this browser')

    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export WEBM")').click()
    const download = await downloadPromise
    const filePath = await download.path()
    expect(filePath).toBeTruthy()
    expect(statSync(filePath!).size).toBeGreaterThan(0)
    expect(download.suggestedFilename()).toBe('loading-icon.webm')

    const meta = await loadVideoMetadata(page, filePath!, 'video/webm')
    // Source is 441x291 (odd width) -> padded to 442x291... width odd->442, height 291 odd->292.
    expect(meta.videoWidth).toBe(442)
    expect(meta.videoHeight).toBe(292)
    // 24 frames x 50ms = 1200ms, real per-frame timing, not an assumed frame rate.
    expect(meta.duration).toBeCloseTo(1.2, 1)

    expect(pageErrors).toEqual([])
  })

  test('the exported video genuinely contains the current project edit (overlay), not just correct timing', async ({ page }) => {
    test.slow()
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await uploadGif(page, LOADING_ICON_GIF)
    // Overlays are added centered on the frame by default (OverlayPanel.tsx), so sampling
    // the center pixel reliably hits it without needing any resize interaction.
    await page.locator('button[title="Overlay"]').click()
    await page.locator('input[type=file]').setInputFiles(OVERLAY_RED_PNG)
    await page.waitForTimeout(400)

    await openExportFormat(page, 'WEBM')
    test.skip(!(await isFormatAvailable(page, 'webm')), 'WebM encoding is unavailable in this browser')

    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export WEBM")').click()
    const download = await downloadPromise
    const filePath = await download.path()

    await loadVideoMetadata(page, filePath!, 'video/webm')
    const [r, g, b, a] = await videoCenterPixelAt(page, 0.1)
    // Real overlay red is fully opaque and saturated — allow generous tolerance for
    // video quantization/chroma subsampling, but red must clearly dominate.
    expect(r).toBeGreaterThan(150)
    expect(g).toBeLessThan(100)
    expect(b).toBeLessThan(100)
    expect(a).toBeGreaterThan(200)

    expect(pageErrors).toEqual([])
  })

  test('variable per-frame GIF delays produce the correct total video duration, not an assumed frame rate', async ({ page }) => {
    test.slow()
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    const { path: fixturePath, delaysMs } = generateVariableDelayFixture()
    const expectedDurationS = delaysMs.reduce((sum, d) => sum + d, 0) / 1000 // 260ms

    await uploadGif(page, fixturePath)
    await openExportFormat(page, 'WEBM')
    test.skip(!(await isFormatAvailable(page, 'webm')), 'WebM encoding is unavailable in this browser')

    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export WEBM")').click()
    const download = await downloadPromise
    const filePath = await download.path()

    const meta = await loadVideoMetadata(page, filePath!, 'video/webm')
    expect(meta.duration).toBeCloseTo(expectedDurationS, 1)

    expect(pageErrors).toEqual([])
  })

  test('odd source dimensions are padded to even dimensions, not distorted, and the user is told', async ({ page }) => {
    test.slow()
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await uploadGif(page, LOADING_ICON_GIF) // 441x291 — both odd
    await openExportFormat(page, 'WEBM')
    test.skip(!(await isFormatAvailable(page, 'webm')), 'WebM encoding is unavailable in this browser')

    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export WEBM")').click()
    await downloadPromise
    await expect(page.locator('text=/padded to 442×292/')).toBeVisible({ timeout: 5_000 })

    expect(pageErrors).toEqual([])
  })

  test('a custom background color is genuinely applied, not defaulted to black/white', async ({ page }) => {
    test.slow()
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await uploadGif(page, LOADING_ICON_GIF) // 441x291 -> padded to 442x292
    await openExportFormat(page, 'WEBM')
    test.skip(!(await isFormatAvailable(page, 'webm')), 'WebM encoding is unavailable in this browser')

    await page.locator('button:has-text("Custom")').click()
    await page.locator('input[type=color]').fill('#00ff00') // pure green — unmistakable against black/white

    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export WEBM")').click()
    const download = await downloadPromise
    const filePath = await download.path()

    await loadVideoMetadata(page, filePath!, 'video/webm')
    // Sample the even-padding column (x=441, the extra column added beyond the 441px-wide
    // source) — pure background fill with nothing drawn over it, so it directly proves
    // whether the chosen custom color reached the actual encoded output.
    const [r, g, b] = await videoCenterPixelAt(page, 0.1).then(() =>
      page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(video, 0, 0)
        const d = ctx.getImageData(441, 5, 1, 1).data
        return [d[0], d[1], d[2], d[3]]
      }),
    )
    // Lossy VP9/chroma-subsampled color isn't pixel-exact, but green must clearly dominate —
    // this could not happen if the background silently stayed at the black/white default.
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
    expect(g).toBeGreaterThan(150)

    expect(pageErrors).toEqual([])
  })

  test('cancelling a video export stops cleanly, not as a red error toast, and export remains usable afterward', async ({ page }) => {
    test.slow()
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await uploadGif(page, LOADING_ICON_GIF)
    await openExportFormat(page, 'WEBM')
    test.skip(!(await isFormatAvailable(page, 'webm')), 'WebM encoding is unavailable in this browser')

    await page.locator('button:has-text("Export WEBM")').click()
    await expect(page.locator('button:has-text("Cancel export")')).toBeVisible({ timeout: 3_000 })
    await page.locator('button:has-text("Cancel export")').click()

    await expect(page.locator('.border-red-800')).not.toBeVisible()
    await expect(page.locator('button:has-text("Export WEBM")')).toBeVisible({ timeout: 5_000 })

    // A fresh export afterward must still work — proves the worker's exclusivity guard
    // actually released, not just that the UI stopped showing a spinner.
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export WEBM")').click()
    const download = await downloadPromise
    expect(await download.path()).toBeTruthy()

    expect(pageErrors).toEqual([])
  })

  test('a video export is rejected while Optimize is already running (shared heavy-job exclusivity, not a second lock)', async ({
    page,
    browserName,
  }) => {
    // This test's setup depends on running a real Optimize job, which needs OffscreenCanvas
    // (unavailable in this WebKit build) — skip for that reason, not because video export
    // itself is untestable there (it already is, via the WebM-availability skip elsewhere).
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    test.slow()
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    // Optimize and Export are separate panels with independent local "running" state, so —
    // unlike GIF vs. video within the same ExportPanel, which share one `exporting` boolean
    // and can never race via the UI at all — this is the actually-reachable path to two
    // heavy jobs overlapping: the worker's shared abortController guard is what must catch it.
    await uploadGif(page, ROTATING_EARTH_GIF)
    await page.locator('button[title="Optimize"]').click()
    await page.locator('button:has-text("Target Size")').click()
    await page.getByRole('button', { name: '256KB', exact: true }).click()
    await page.locator('text=Allow FPS reduction').click()
    await page.locator('text=Allow frame dropping').click()
    await page.locator('text=Allow resolution reduction').click()
    await page.locator('text=Keep dimensions').click()
    await page.locator('button:has-text("Run optimization")').click()
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible({ timeout: 5_000 })

    await openExportFormat(page, 'WEBM')
    test.skip(!(await isFormatAvailable(page, 'webm')), 'WebM encoding is unavailable in this browser')
    await page.locator('button:has-text("Export WEBM")').click()
    await expect(page.locator('text=Another export or optimization is already running.').first()).toBeVisible({ timeout: 5_000 })

    // Let the optimize search finish on its own, then confirm video export still works fresh.
    await page.waitForTimeout(10_000)
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export WEBM")').click()
    const download = await downloadPromise
    expect(await download.path()).toBeTruthy()

    expect(pageErrors).toEqual([])
  })

  test('New Project clears video export state and GIF export still works normally afterward', async ({ page, browserName }) => {
    // The final assertion is a real GIF export, which needs OffscreenCanvas (unavailable in
    // this WebKit build) — same reason the rest of this project's GIF-export tests skip there.
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    test.slow()
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await uploadGif(page, LOADING_ICON_GIF)
    await openExportFormat(page, 'WEBM')

    await page.locator('button:has-text("New")').first().click()
    await page.locator('button:has-text("Yes, start new")').click()
    await expect(page.locator('text=Choose a GIF file')).toBeVisible({ timeout: 5_000 })

    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Export"]').click()
    await expect(page.locator('button:has-text("GIF")').first()).toHaveClass(/bg-accent/)
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export GIF")').click()
    const download = await downloadPromise
    expect(await download.path()).toBeTruthy()

    expect(pageErrors).toEqual([])
  })
})
