import { GIFEncoder } from 'gifenc'
import { buildGlobalPalette, createNearestColorCache, ditherFrameToPalette, findTransparentIndex } from './quantize'
import type { LoopMode } from '../../types/project'

export interface EncodeFrameInput {
  rgba: Uint8ClampedArray
  delayMs: number
}

export interface EncodeOptions {
  width: number
  height: number
  maxColors: number
  dither: boolean
  ditherStrength: number
  loopMode: LoopMode
  customLoopCount: number
  /** Called after each frame is written, with fraction complete in [0,1]. */
  onProgress?: (fraction: number) => void
  /** Checked periodically; throws CancelledError if aborted. */
  signal?: AbortSignal
}

export class EncodeCancelledError extends Error {
  constructor() {
    super('Encoding was cancelled.')
    this.name = 'EncodeCancelledError'
  }
}

function resolveRepeat(loopMode: LoopMode, customLoopCount: number): number {
  if (loopMode === 'none') return -1
  if (loopMode === 'forever') return 0
  return Math.max(0, customLoopCount)
}

export function encodeGif(frames: EncodeFrameInput[], options: EncodeOptions): Uint8Array {
  if (frames.length === 0) {
    throw new Error('Cannot encode a GIF with zero frames.')
  }

  const clampedColors = Math.max(2, Math.min(256, options.maxColors))
  const { palette, transparent } = buildGlobalPalette(
    frames.map((f) => f.rgba),
    { maxColors: clampedColors },
  )
  const transparentIndex = transparent ? findTransparentIndex(palette) : -1
  const ditherStrength = options.dither ? options.ditherStrength : 0
  const repeat = resolveRepeat(options.loopMode, options.customLoopCount)

  const encoder = GIFEncoder()
  // Shared across every frame: they all quantize against the same global palette, so a
  // color seen in frame 3 doesn't need its nearest-palette-match recomputed in frame 9.
  const colorCache = createNearestColorCache()

  for (let i = 0; i < frames.length; i++) {
    if (options.signal?.aborted) throw new EncodeCancelledError()

    const frame = frames[i]!
    const indices = ditherFrameToPalette(
      frame.rgba,
      options.width,
      options.height,
      palette,
      transparentIndex,
      ditherStrength,
      colorCache,
    )

    encoder.writeFrame(indices, options.width, options.height, {
      palette: i === 0 ? palette : undefined,
      first: i === 0,
      delay: Math.max(20, Math.round(frame.delayMs)),
      transparent,
      transparentIndex: transparent ? transparentIndex : 0,
      repeat,
    })

    options.onProgress?.((i + 1) / frames.length)
  }

  encoder.finish()
  return encoder.bytes()
}
