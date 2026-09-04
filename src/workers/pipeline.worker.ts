/// <reference lib="webworker" />
import * as Comlink from 'comlink'
import { decodeGif, GifDecodeError } from '../core/gif/decoder'
import { encodeGif, EncodeCancelledError } from '../core/gif/encoder'
import { renderFrame, computeOutputDimensions, canvasToImageData, type CanvasFactory } from '../core/render/compositeFrame'
import { runTargetSizeSearch } from '../core/optimization/targetSizeSearch'
import { applySpeedToDelay } from '../core/edit/frameOrder'
import { isFrameVisible, parseFrameRange } from '../core/selection/frameRange'
import { yieldToEventLoop } from '../core/util/yieldToEventLoop'
import type { CompositedFrame, GifMetadata } from '../types/gif'
import type { EditOperations, ExportSettings, Layer, OptimizationSettings } from '../types/project'

const offscreenCanvasFactory: CanvasFactory = {
  create: (width, height) => new OffscreenCanvas(width, height),
}

// Some browser engines (observed: the WebKit build used for this project's Playwright
// cross-browser tests) don't implement OffscreenCanvas at all, in any context — real
// current Safari's support was not independently verified. Everything that needs
// pixel-level rendering (export, optimize, static-frame export, thumbnails, and
// preview-bitmap downscaling) depends on it, so fail fast with a clear message instead
// of the opaque native "Can't find variable: OffscreenCanvas" ReferenceError.
const OFFSCREEN_CANVAS_SUPPORTED = typeof OffscreenCanvas !== 'undefined'

function assertOffscreenCanvasSupport(): void {
  if (!OFFSCREEN_CANVAS_SUPPORTED) {
    throw new Error(
      'Your browser does not support OffscreenCanvas, which GifForge requires for rendering, exporting, and optimizing GIFs. Please try a recent version of Chrome, Edge, or Firefox.',
    )
  }
}

const MEMORY_HARD_CAP_BYTES = 2 * 1024 * 1024 * 1024 // 2GB decoded RGBA — refuse above this
const MEMORY_WARN_BYTES = 300 * 1024 * 1024 // 300MB decoded RGBA — suggest Performance Mode

export interface LoadGifResult {
  metadata: GifMetadata
  suggestPerformanceMode: boolean
  estimatedMemoryBytes: number
  frameDelaysMs: number[]
}

export interface PreviewFrameBundle {
  frameIndex: number
  bitmap: ImageBitmap
}

export interface CompareDecodeResult {
  width: number
  height: number
  frameCount: number
  durationMs: number
  fileSizeBytes: number
  frameDelaysMs: number[]
  bitmaps: ImageBitmap[]
}

type ProgressCallback = (fraction: number | null, message: string) => void

class GifPipeline {
  private sourceFrames: CompositedFrame[] = []
  private metadata: GifMetadata | null = null
  private assets = new Map<string, ImageBitmap>()
  private abortController: AbortController | null = null

  async loadGif(buffer: ArrayBuffer, fileName: string, onProgress?: ProgressCallback): Promise<LoadGifResult> {
    onProgress?.(null, 'Parsing GIF…')

    let result
    try {
      result = decodeGif(buffer, { fileName })
    } catch (err) {
      if (err instanceof GifDecodeError) throw new Error(err.message)
      throw err
    }

    const estimatedMemoryBytes = result.metadata.width * result.metadata.height * 4 * result.metadata.frameCount
    if (estimatedMemoryBytes > MEMORY_HARD_CAP_BYTES) {
      throw new Error(
        `This GIF would require approximately ${(estimatedMemoryBytes / 1e9).toFixed(1)}GB of memory to decode, which exceeds what a browser tab can safely handle. Try a smaller file.`,
      )
    }

    onProgress?.(0.5, 'Compositing frames…')
    this.sourceFrames = result.frames
    this.metadata = result.metadata
    onProgress?.(1, 'Done')

    return {
      metadata: result.metadata,
      suggestPerformanceMode: estimatedMemoryBytes > MEMORY_WARN_BYTES,
      estimatedMemoryBytes,
      frameDelaysMs: result.frames.map((f) => f.delayMs),
    }
  }

  async getPreviewBitmaps(maxDimension: number): Promise<ImageBitmap[]> {
    this.assertLoaded()
    const { width, height } = this.metadata!
    // Without OffscreenCanvas there's no way to downscale here — fall back to
    // full-resolution preview bitmaps rather than failing outright. Costs more memory
    // for the preview, but keeps upload/decode/playback/timeline usable; only the
    // OffscreenCanvas-dependent export/optimize/thumbnail paths need to hard-fail.
    const scale = OFFSCREEN_CANVAS_SUPPORTED ? Math.min(1, maxDimension / Math.max(width, height)) : 1
    const targetW = Math.max(1, Math.round(width * scale))
    const targetH = Math.max(1, Math.round(height * scale))

    const bitmaps: ImageBitmap[] = []
    for (const frame of this.sourceFrames) {
      if (scale === 1) {
        bitmaps.push(await createImageBitmap(new ImageData(frame.rgba, width, height)))
      } else {
        const src = new OffscreenCanvas(width, height)
        src.getContext('2d')!.putImageData(new ImageData(frame.rgba, width, height), 0, 0)
        const dst = new OffscreenCanvas(targetW, targetH)
        const dstCtx = dst.getContext('2d')!
        dstCtx.imageSmoothingEnabled = true
        dstCtx.imageSmoothingQuality = 'medium'
        dstCtx.drawImage(src, 0, 0, targetW, targetH)
        bitmaps.push(dst.transferToImageBitmap())
      }
    }
    return Comlink.transfer(bitmaps, bitmaps)
  }

  /**
   * Decodes a standalone GIF byte buffer for the visual Before/After comparison viewer —
   * deliberately independent of `this.sourceFrames`/`this.metadata` (the currently-loaded
   * project) so decoding a comparison side never disturbs the live editing session. Used
   * for both the original upload's bytes and the real optimized output's bytes, so the
   * viewer always shows genuine decoded pixels, never a synthetic/filtered approximation.
   * No OffscreenCanvas dependency (createImageBitmap from ImageData works without it), so
   * this works even in engines that can't run export/optimize itself.
   */
  async decodeForCompare(buffer: ArrayBuffer): Promise<CompareDecodeResult> {
    let result
    try {
      result = decodeGif(buffer, { fileName: 'compare' })
    } catch (err) {
      if (err instanceof GifDecodeError) throw new Error(err.message)
      throw err
    }
    const { width, height } = result.metadata
    const bitmaps = await Promise.all(result.frames.map((f) => createImageBitmap(new ImageData(f.rgba, width, height))))
    return {
      width,
      height,
      frameCount: result.metadata.frameCount,
      durationMs: result.metadata.durationMs,
      fileSizeBytes: result.metadata.fileSizeBytes,
      frameDelaysMs: result.frames.map((f) => f.delayMs),
      bitmaps: Comlink.transfer(bitmaps, bitmaps),
    }
  }

  async getThumbnail(frameIndex: number, maxSize: number): Promise<ImageBitmap> {
    this.assertLoaded()
    const frame = this.sourceFrames[frameIndex]
    if (!frame) throw new Error(`Frame ${frameIndex} does not exist.`)
    const { width, height } = this.metadata!

    if (!OFFSCREEN_CANVAS_SUPPORTED) {
      // No downscaling available — a full-resolution thumbnail costs more memory per
      // timeline entry than intended, but still lets the timeline show real content
      // instead of failing every frame's thumbnail request.
      const bitmap = await createImageBitmap(new ImageData(frame.rgba, width, height))
      return Comlink.transfer(bitmap, [bitmap])
    }

    const scale = Math.min(1, maxSize / Math.max(width, height))
    const targetW = Math.max(1, Math.round(width * scale))
    const targetH = Math.max(1, Math.round(height * scale))

    const src = new OffscreenCanvas(width, height)
    src.getContext('2d')!.putImageData(new ImageData(frame.rgba, width, height), 0, 0)
    const dst = new OffscreenCanvas(targetW, targetH)
    const dstCtx = dst.getContext('2d')!
    dstCtx.imageSmoothingEnabled = true
    dstCtx.drawImage(src, 0, 0, targetW, targetH)
    const bitmap = dst.transferToImageBitmap()
    return Comlink.transfer(bitmap, [bitmap])
  }

  async registerAsset(assetId: string, bitmap: ImageBitmap): Promise<void> {
    this.assets.set(assetId, bitmap)
  }

  async removeAsset(assetId: string): Promise<void> {
    this.assets.delete(assetId)
  }

  private buildEditedFrameList(edits: EditOperations): { rgba: Uint8ClampedArray; delayMs: number; originalIndex: number }[] {
    return edits.frameOrder.map((originalIndex) => {
      const frame = this.sourceFrames[originalIndex]
      if (!frame) throw new Error(`Frame order references missing frame ${originalIndex}.`)
      return {
        rgba: frame.rgba,
        delayMs: applySpeedToDelay(frame.delayMs, edits.speed.factor),
        originalIndex,
      }
    })
  }

  private renderFullFrame(
    rgba: Uint8ClampedArray,
    edits: EditOperations,
    layers: Layer[],
    frameNumber1Based: number,
    totalFrames: number,
  ): ImageData {
    this.assertLoaded()
    assertOffscreenCanvasSupport()
    const { width, height } = this.metadata!
    // Project.layers is stored top-of-panel-first (index 0 = frontmost, matching the Layers
    // panel and standard design-tool convention), but the draw loop needs bottom-to-top order.
    const visibleLayers = layers
      .filter((l) => isFrameVisible(l.frameRange, frameNumber1Based, totalFrames))
      .reverse()

    const canvas = renderFrame(
      {
        sourceRgba: rgba,
        sourceWidth: width,
        sourceHeight: height,
        crop: edits.crop,
        resize: edits.resize,
        rotate: edits.rotate,
        layers: visibleLayers,
        getAssetBitmap: (id) => this.assets.get(id),
      },
      offscreenCanvasFactory,
    )
    return canvasToImageData(canvas)
  }

  async renderPreviewFrame(edits: EditOperations, layers: Layer[], timelineIndex: number): Promise<ImageBitmap> {
    this.assertLoaded()
    const editedFrames = this.buildEditedFrameList(edits)
    const frame = editedFrames[timelineIndex]
    if (!frame) throw new Error(`Timeline index ${timelineIndex} out of range.`)
    const imageData = this.renderFullFrame(frame.rgba, edits, layers, timelineIndex + 1, editedFrames.length)
    const bitmap = await createImageBitmap(imageData)
    return Comlink.transfer(bitmap, [bitmap])
  }

  async getOutputDimensions(edits: EditOperations): Promise<{ width: number; height: number }> {
    this.assertLoaded()
    const { width, height } = this.metadata!
    return computeOutputDimensions(width, height, edits.crop, edits.resize, edits.rotate)
  }

  private async renderAllFrames(edits: EditOperations, layers: Layer[], onProgress?: ProgressCallback) {
    const editedFrames = this.buildEditedFrameList(edits)
    const dims = computeOutputDimensions(this.metadata!.width, this.metadata!.height, edits.crop, edits.resize, edits.rotate)
    const rendered: { rgba: Uint8ClampedArray; delayMs: number }[] = []

    for (let i = 0; i < editedFrames.length; i++) {
      // See yieldToEventLoop's doc comment: without this, a cancel() called mid-render
      // never gets delivered until the whole synchronous loop finishes on its own.
      if (i > 0 && i % 4 === 0) await yieldToEventLoop()
      if (this.abortController?.signal.aborted) throw new EncodeCancelledError()
      const frame = editedFrames[i]!
      const imageData = this.renderFullFrame(frame.rgba, edits, layers, i + 1, editedFrames.length)
      rendered.push({ rgba: imageData.data as unknown as Uint8ClampedArray, delayMs: frame.delayMs })
      onProgress?.((i + 1) / editedFrames.length, `Rendering frame ${i + 1} of ${editedFrames.length}…`)
    }

    return { rendered, width: dims.width, height: dims.height }
  }

  async exportGif(
    edits: EditOperations,
    layers: Layer[],
    settings: ExportSettings,
    onProgress?: ProgressCallback,
  ): Promise<Uint8Array> {
    this.assertLoaded()
    // this.abortController doubles as the "an export or optimize is in flight" flag —
    // both operations share this single worker instance, so without this guard a user
    // switching tools mid-export (nothing in the UI prevents it) could start a second
    // heavy operation that overwrites this field out from under the first one, making
    // "Cancel" abort whichever job started most recently instead of the one intended.
    if (this.abortController) {
      throw new Error('Another export or optimization is already running. Cancel it or wait for it to finish first.')
    }
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    try {
      const frameRangeFrames =
        settings.frameRange.trim().length > 0
          ? filterByFrameRange(edits, settings.frameRange)
          : edits

      onProgress?.(0, 'Rendering frames…')
      const { rendered, width, height } = await this.renderAllFrames(frameRangeFrames, layers, (f, m) => onProgress?.((f ?? 0) * 0.7, m))

      const scale = settings.scalePercent / 100
      const scaledWidth = Math.max(1, Math.round(width * scale))
      const scaledHeight = Math.max(1, Math.round(height * scale))
      const scaledFrames =
        scale === 1
          ? rendered
          : rendered.map((f) => ({ delayMs: f.delayMs, rgba: this.scaleRgba(f.rgba, width, height, scaledWidth, scaledHeight) }))

      onProgress?.(0.75, 'Encoding GIF…')
      const bytes = await encodeGif(scaledFrames, {
        width: scaledWidth,
        height: scaledHeight,
        maxColors: settings.maxColors,
        dither: settings.dither,
        ditherStrength: 1,
        loopMode: settings.loopMode,
        customLoopCount: settings.customLoopCount,
        signal,
        onProgress: (f) => onProgress?.(0.75 + f * 0.25, 'Encoding GIF…'),
      })

      onProgress?.(1, 'Done')
      return Comlink.transfer(bytes, [bytes.buffer as ArrayBuffer])
    } finally {
      this.abortController = null
    }
  }

  async optimize(
    edits: EditOperations,
    layers: Layer[],
    settings: OptimizationSettings,
    onProgress?: ProgressCallback,
  ) {
    this.assertLoaded()
    // See the matching guard/comment in exportGif — same shared-worker-instance reasoning.
    if (this.abortController) {
      throw new Error('Another export or optimization is already running. Cancel it or wait for it to finish first.')
    }
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    try {
      onProgress?.(0, 'Rendering frames…')
      const { rendered, width, height } = await this.renderAllFrames(edits, layers, (f, m) => onProgress?.((f ?? 0) * 0.3, m))

      if (settings.preset === 'target-size' && settings.targetSizeBytes) {
        const result = await runTargetSizeSearch({
          frames: rendered,
          width,
          height,
          targetBytes: settings.targetSizeBytes,
          keepDimensions: settings.keepDimensions,
          allowFpsReduction: settings.allowFpsReduction,
          allowFrameDropping: settings.allowFrameDropping,
          allowResolutionReduction: settings.allowResolutionReduction,
          loopMode: 'forever',
          customLoopCount: 0,
          signal,
          onProgress: (f, m) => onProgress?.(0.3 + f * 0.7, m),
        })
        return {
          bytes: Comlink.transfer(result.bytes, [result.bytes.buffer as ArrayBuffer]),
          achievedBytes: result.achievedBytes,
          achievedTarget: result.achievedTarget,
          message: result.message,
          width,
          height,
        }
      }

      const presetSettings = resolvePreset(settings)
      const scale = presetSettings.scalePercent / 100
      const scaledWidth = Math.max(1, Math.round(width * scale))
      const scaledHeight = Math.max(1, Math.round(height * scale))
      const scaledFrames =
        scale === 1
          ? rendered
          : rendered.map((f) => ({ delayMs: f.delayMs, rgba: this.scaleRgba(f.rgba, width, height, scaledWidth, scaledHeight) }))

      onProgress?.(0.5, 'Encoding…')
      const bytes = await encodeGif(scaledFrames, {
        width: scaledWidth,
        height: scaledHeight,
        maxColors: presetSettings.maxColors,
        dither: presetSettings.dither,
        ditherStrength: presetSettings.ditherStrength,
        loopMode: 'forever',
        customLoopCount: 0,
        signal,
        onProgress: (f) => onProgress?.(0.5 + f * 0.5, 'Encoding…'),
      })

      return {
        bytes: Comlink.transfer(bytes, [bytes.buffer as ArrayBuffer]),
        achievedBytes: bytes.length,
        achievedTarget: true,
        message: `Optimized to ${(bytes.length / 1024).toFixed(1)} KB.`,
        width: scaledWidth,
        height: scaledHeight,
      }
    } finally {
      this.abortController = null
    }
  }

  async exportStaticFrame(
    edits: EditOperations,
    layers: Layer[],
    timelineIndex: number,
    format: 'png' | 'jpeg',
  ): Promise<Uint8Array> {
    this.assertLoaded()
    const editedFrames = this.buildEditedFrameList(edits)
    const frame = editedFrames[timelineIndex]
    if (!frame) throw new Error(`Timeline index ${timelineIndex} out of range.`)
    const imageData = this.renderFullFrame(frame.rgba, edits, layers, timelineIndex + 1, editedFrames.length)
    const canvas = new OffscreenCanvas(imageData.width, imageData.height)
    canvas.getContext('2d')!.putImageData(imageData, 0, 0)
    const blob = await canvas.convertToBlob({ type: format === 'png' ? 'image/png' : 'image/jpeg', quality: 0.92 })
    const buffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    return Comlink.transfer(bytes, [bytes.buffer as ArrayBuffer])
  }

  cancel(): void {
    this.abortController?.abort()
  }

  private scaleRgba(rgba: Uint8ClampedArray, srcW: number, srcH: number, dstW: number, dstH: number): Uint8ClampedArray {
    const src = new OffscreenCanvas(srcW, srcH)
    src.getContext('2d')!.putImageData(new ImageData(rgba, srcW, srcH), 0, 0)
    const dst = new OffscreenCanvas(dstW, dstH)
    const dstCtx = dst.getContext('2d')!
    dstCtx.imageSmoothingEnabled = true
    dstCtx.imageSmoothingQuality = 'high'
    dstCtx.drawImage(src, 0, 0, dstW, dstH)
    return dstCtx.getImageData(0, 0, dstW, dstH).data as unknown as Uint8ClampedArray
  }

  private assertLoaded(): void {
    if (!this.metadata) throw new Error('No GIF loaded in worker.')
  }
}

function filterByFrameRange(edits: EditOperations, frameRangeSpec: string): EditOperations {
  const { frames } = parseFrameRange(frameRangeSpec, edits.frameOrder.length)
  const selected = new Set(frames)
  return {
    ...edits,
    frameOrder: edits.frameOrder.filter((_, i) => selected.has(i + 1)),
  }
}

function resolvePreset(settings: OptimizationSettings): {
  maxColors: number
  dither: boolean
  ditherStrength: number
  scalePercent: number
} {
  switch (settings.preset) {
    case 'light':
      return { maxColors: 256, dither: true, ditherStrength: 1, scalePercent: 100 }
    case 'balanced':
      return { maxColors: 128, dither: true, ditherStrength: 0.8, scalePercent: 100 }
    case 'aggressive':
      return { maxColors: 64, dither: settings.dither, ditherStrength: 0.5, scalePercent: Math.min(settings.scalePercent, 85) }
    default:
      return {
        maxColors: settings.maxColors,
        dither: settings.dither,
        ditherStrength: settings.ditherStrength,
        scalePercent: settings.scalePercent,
      }
  }
}

const pipeline = new GifPipeline()
Comlink.expose(pipeline)

export type { GifPipeline }
