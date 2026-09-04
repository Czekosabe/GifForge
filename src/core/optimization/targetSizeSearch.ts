import { encodeGif, EncodeCancelledError, type EncodeFrameInput } from '../gif/encoder'
import type { LoopMode } from '../../types/project'

export interface TargetSizeCandidateConfig {
  maxColors: number
  dither: boolean
  frameStep: number
  scalePercent: number
}

export interface TargetSizeSearchInput {
  frames: EncodeFrameInput[]
  width: number
  height: number
  targetBytes: number
  keepDimensions: boolean
  allowFpsReduction: boolean
  allowFrameDropping: boolean
  allowResolutionReduction: boolean
  loopMode: LoopMode
  customLoopCount: number
  maxAttempts?: number
  onProgress?: (fraction: number, message: string) => void
  signal?: AbortSignal
}

export interface TargetSizeSearchResult {
  bytes: Uint8Array
  achievedBytes: number
  achievedTarget: boolean
  attemptsUsed: number
  configUsed: TargetSizeCandidateConfig
  message: string
}

/**
 * Builds an ordered list of candidate encode configs, starting from the least
 * destructive (full quality) and relaxing ONE dimension at a time, in the order
 * palette size -> dithering -> frame rate (if allowed) -> resolution (if allowed) —
 * a genuinely linear/monotonic walk, not a cartesian sweep of every combination.
 *
 * This matters in practice: with a small bounded attempt budget (search stops after
 * `maxAttempts`, each attempt is a real encode), a nested-loop cartesian product
 * exhausts the budget re-trying every color/dither combination at 100% scale before
 * ever reaching frame-rate or resolution reduction — even when the user explicitly
 * allowed them and they're what the target actually needs. Walking one dimension at a
 * time guarantees every *allowed* technique gets tried within a modest attempt count.
 */
export function buildCandidateConfigs(input: TargetSizeSearchInput): TargetSizeCandidateConfig[] {
  const configs: TargetSizeCandidateConfig[] = []
  const colorSteps = [256, 192, 128, 96, 64, 48, 32, 24, 16, 8]
  const frameSteps: number[] = [1]
  if (input.allowFpsReduction) frameSteps.push(2)
  if (input.allowFrameDropping) frameSteps.push(3, 4)
  const scaleSteps: number[] = [100]
  if (input.allowResolutionReduction && !input.keepDimensions) {
    scaleSteps.push(85, 70, 55, 40)
  }

  const current: TargetSizeCandidateConfig = { maxColors: colorSteps[0]!, dither: true, frameStep: 1, scalePercent: 100 }
  configs.push({ ...current })

  // Phase 1: reduce palette size, dithering still on.
  for (const maxColors of colorSteps.slice(1)) {
    current.maxColors = maxColors
    configs.push({ ...current })
  }

  // Phase 2: dithering off, at the smallest palette size reached so far.
  current.dither = false
  configs.push({ ...current })

  // Phase 3: reduce frame rate, if the user allowed it.
  for (const frameStep of frameSteps.slice(1)) {
    current.frameStep = frameStep
    configs.push({ ...current })
  }

  // Phase 4: reduce resolution, if the user allowed it and dimensions aren't locked.
  for (const scalePercent of scaleSteps.slice(1)) {
    current.scalePercent = scalePercent
    configs.push({ ...current })
  }

  return configs
}

export function applyFrameStep(frames: EncodeFrameInput[], step: number): EncodeFrameInput[] {
  if (step <= 1) return frames
  const result: EncodeFrameInput[] = []
  for (let i = 0; i < frames.length; i += step) {
    const group = frames.slice(i, i + step)
    const totalDelay = group.reduce((sum, f) => sum + f.delayMs, 0)
    result.push({ rgba: group[0]!.rgba, delayMs: totalDelay })
  }
  return result
}

function scaleFrame(rgba: Uint8ClampedArray, srcW: number, srcH: number, dstW: number, dstH: number): Uint8ClampedArray {
  const src = new OffscreenCanvas(srcW, srcH)
  const srcCtx = src.getContext('2d')!
  srcCtx.putImageData(new ImageData(rgba, srcW, srcH), 0, 0)

  const dst = new OffscreenCanvas(dstW, dstH)
  const dstCtx = dst.getContext('2d')!
  dstCtx.imageSmoothingEnabled = true
  dstCtx.imageSmoothingQuality = 'high'
  dstCtx.drawImage(src, 0, 0, srcW, srcH, 0, 0, dstW, dstH)
  return dstCtx.getImageData(0, 0, dstW, dstH).data as unknown as Uint8ClampedArray
}

export function runTargetSizeSearch(input: TargetSizeSearchInput): TargetSizeSearchResult {
  const maxAttempts = input.maxAttempts ?? 24
  const candidates = buildCandidateConfigs(input).slice(0, maxAttempts)

  let best: { bytes: Uint8Array; config: TargetSizeCandidateConfig } | null = null

  for (let i = 0; i < candidates.length; i++) {
    if (input.signal?.aborted) throw new EncodeCancelledError()
    const config = candidates[i]!

    input.onProgress?.(
      i / candidates.length,
      `Trying ${config.maxColors} colors, ${config.scalePercent}% scale, 1/${config.frameStep} frames…`,
    )

    const steppedFrames = applyFrameStep(input.frames, config.frameStep)
    const scale = config.scalePercent / 100
    const targetWidth = Math.max(1, Math.round(input.width * scale))
    const targetHeight = Math.max(1, Math.round(input.height * scale))

    const scaledFrames: EncodeFrameInput[] =
      scale === 1
        ? steppedFrames
        : steppedFrames.map((f) => ({
            delayMs: f.delayMs,
            rgba: scaleFrame(f.rgba, input.width, input.height, targetWidth, targetHeight),
          }))

    const bytes = encodeGif(scaledFrames, {
      width: targetWidth,
      height: targetHeight,
      maxColors: config.maxColors,
      dither: config.dither,
      ditherStrength: 1,
      loopMode: input.loopMode,
      customLoopCount: input.customLoopCount,
      signal: input.signal,
    })

    if (!best || bytes.length < best.bytes.length) {
      best = { bytes, config }
    }

    if (bytes.length <= input.targetBytes) {
      input.onProgress?.(1, 'Target size reached.')
      return {
        bytes,
        achievedBytes: bytes.length,
        achievedTarget: true,
        attemptsUsed: i + 1,
        configUsed: config,
        message: `Reached ${formatBytes(bytes.length)} (target was ${formatBytes(input.targetBytes)}).`,
      }
    }
  }

  input.onProgress?.(1, 'Could not reach target size.')
  const fallback = best ?? {
    bytes: encodeGif(input.frames, {
      width: input.width,
      height: input.height,
      maxColors: 256,
      dither: true,
      ditherStrength: 1,
      loopMode: input.loopMode,
      customLoopCount: input.customLoopCount,
    }),
    config: { maxColors: 256, dither: true, frameStep: 1, scalePercent: 100 },
  }

  return {
    bytes: fallback.bytes,
    achievedBytes: fallback.bytes.length,
    achievedTarget: false,
    attemptsUsed: candidates.length,
    configUsed: fallback.config,
    message: `GifForge could not reach ${formatBytes(input.targetBytes)} without significant quality loss. Best result: ${formatBytes(fallback.bytes.length)}.`,
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
