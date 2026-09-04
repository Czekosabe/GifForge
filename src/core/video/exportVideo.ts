import { resolveBitrate } from './bitrate'
import { computeEvenDimensions } from './dimensions'
import { computeFrameTimings, estimateEffectiveFps, totalDurationUs } from './timestamps'
import type { VideoExportOptions, VideoExportResult } from './types'

export class VideoExportCancelledError extends Error {
  constructor() {
    super('Video export was cancelled.')
    this.name = 'VideoExportCancelledError'
  }
}

export interface RenderedVideoFrame {
  rgba: Uint8ClampedArray
  delayMs: number
}

/**
 * Encodes already-rendered frames (the exact same `renderAllFrames` output GIF export
 * consumes — this module never renders or edits anything itself) into a real MP4/WebM file
 * via mediabunny's WebCodecs-backed `VideoSampleSource`. Dynamically imported from
 * `pipeline.worker.ts` only when a video export is actually requested, so mediabunny's code
 * never loads for GIF-only sessions.
 *
 * Backpressure: `VideoSampleSource.add()`'s returned Promise "resolves once the output is
 * ready to receive more samples" per mediabunny's own contract — awaiting it on every frame
 * *is* the backpressure handling (no manual `encodeQueueSize` polling needed on top of that).
 * That same await is also what gives a pending cancellation a chance to be observed each
 * iteration (unlike GIF's fully-synchronous encode loop, this one already yields for real on
 * every frame, so no artificial `yieldToEventLoop` call is needed here).
 */
export async function exportVideo(
  frames: RenderedVideoFrame[],
  width: number,
  height: number,
  options: VideoExportOptions,
  signal: AbortSignal,
  onProgress?: (fraction: number | null, message: string) => void,
): Promise<VideoExportResult> {
  if (frames.length === 0) throw new Error('Cannot export a video with zero frames.')

  const { canEncodeVideo, Quality, Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, VideoSampleSource, VideoSample } = await import(
    'mediabunny'
  )

  const { width: paddedWidth, height: paddedHeight, padded } = computeEvenDimensions(width, height)
  const delaysMs = frames.map((f) => f.delayMs)
  const effectiveFps = estimateEffectiveFps(delaysMs)
  const bitrate = resolveBitrate(options.customBitrate, paddedWidth, paddedHeight, effectiveFps, options.quality)
  const quality = new Quality({ bitrate })

  // Authoritative right before committing to a codec — never assumes an earlier UI-side
  // capability check (which may have run against different dimensions) still holds.
  let codec: 'avc' | 'vp9' | 'vp8'
  if (options.format === 'mp4') {
    const ok = await canEncodeVideo('avc', { width: paddedWidth, height: paddedHeight, quality })
    if (!ok) throw new Error('This browser cannot encode MP4 (H.264/AVC) video.')
    codec = 'avc'
  } else {
    const vp9Ok = await canEncodeVideo('vp9', { width: paddedWidth, height: paddedHeight, quality })
    if (vp9Ok) {
      codec = 'vp9'
    } else {
      const vp8Ok = await canEncodeVideo('vp8', { width: paddedWidth, height: paddedHeight, quality })
      if (!vp8Ok) throw new Error('This browser cannot encode WebM (VP9/VP8) video.')
      codec = 'vp8'
    }
  }

  const output = new Output({
    format: options.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  })
  const videoSource = new VideoSampleSource({ codec, quality })
  output.addVideoTrack(videoSource)
  await output.start()

  const timings = computeFrameTimings(delaysMs)
  const backgroundStyle = `rgb(${options.background.r}, ${options.background.g}, ${options.background.b})`

  // Reused across every frame (never recreated per-iteration): a VideoSample constructed from
  // a CanvasImageSource snapshots the canvas's current pixels immediately, so redrawing onto
  // these same two canvases next iteration is safe once this iteration's sample exists.
  const sourceCanvas = new OffscreenCanvas(width, height)
  const sourceCtx = sourceCanvas.getContext('2d')!
  const targetCanvas = new OffscreenCanvas(paddedWidth, paddedHeight)
  const targetCtx = targetCanvas.getContext('2d')!

  try {
    for (let i = 0; i < frames.length; i++) {
      if (signal.aborted) throw new VideoExportCancelledError()
      const frame = frames[i]!

      // Composite the (possibly transparent) rendered frame against the chosen background —
      // putImageData alone would write the alpha channel raw instead of blending it, so the
      // source goes through drawImage (which does alpha-composite) onto a filled target.
      sourceCtx.putImageData(new ImageData(frame.rgba, width, height), 0, 0)
      targetCtx.fillStyle = backgroundStyle
      targetCtx.fillRect(0, 0, paddedWidth, paddedHeight)
      targetCtx.drawImage(sourceCanvas, 0, 0)

      const timing = timings[i]!
      const sample = new VideoSample(targetCanvas, {
        timestamp: timing.timestampUs / 1e6,
        duration: timing.durationUs / 1e6,
      })
      try {
        await videoSource.add(sample)
      } finally {
        sample.close()
      }
      onProgress?.((i + 1) / frames.length, `Encoding frame ${i + 1} of ${frames.length}…`)
    }

    videoSource.close()
    onProgress?.(null, `Finalizing ${options.format.toUpperCase()} file…`)
    await output.finalize()
  } catch (err) {
    await output.cancel().catch(() => {})
    throw err
  }

  const buffer = output.target.buffer
  if (!buffer) throw new Error('Video export finished with no output data.')

  return {
    bytes: new Uint8Array(buffer),
    width: paddedWidth,
    height: paddedHeight,
    padded,
    durationMs: totalDurationUs(delaysMs) / 1000,
    codec,
  }
}
