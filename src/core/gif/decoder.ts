import { decompressFrames, parseGIF } from 'gifuct-js'
import { compositeGifFrames } from './compositor'
import type { GifDecodeResult } from '../../types/gif'

const GIF_SIGNATURE = ['GIF87a', 'GIF89a']

export class GifDecodeError extends Error {}

function isValidGifSignature(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 6) return false
  const header = new TextDecoder('ascii').decode(new Uint8Array(buffer, 0, 6))
  return GIF_SIGNATURE.includes(header)
}

export interface DecodeOptions {
  fileName: string
  onProgress?: (fraction: number) => void
}

export function decodeGif(buffer: ArrayBuffer, options: DecodeOptions): GifDecodeResult {
  if (!isValidGifSignature(buffer)) {
    throw new GifDecodeError('This file is not a valid GIF (bad signature).')
  }

  let gif
  try {
    gif = parseGIF(buffer)
  } catch (err) {
    throw new GifDecodeError(`Failed to parse GIF structure: ${(err as Error).message}`)
  }

  if (!gif.lsd || gif.lsd.width <= 0 || gif.lsd.height <= 0) {
    throw new GifDecodeError('GIF has invalid or missing screen dimensions.')
  }

  let rawFrames
  try {
    rawFrames = decompressFrames(gif, true)
  } catch (err) {
    throw new GifDecodeError(`Failed to decode GIF frames: ${(err as Error).message}`)
  }

  if (rawFrames.length === 0) {
    throw new GifDecodeError('GIF contains no frames.')
  }

  const composited = compositeGifFrames(
    gif.lsd.width,
    gif.lsd.height,
    rawFrames.map((f) => ({
      patch: f.patch,
      dims: f.dims,
      disposalType: f.disposalType,
      delay: f.delay,
    })),
  )
  options.onProgress?.(1)

  const durationMs = composited.reduce((sum, f) => sum + f.delayMs, 0)

  // gifuct-js doesn't surface loop count directly; read it from the NETSCAPE2.0 app extension.
  const loopCount = readLoopCount(gif)

  return {
    metadata: {
      width: gif.lsd.width,
      height: gif.lsd.height,
      frameCount: composited.length,
      loopCount,
      durationMs,
      fileSizeBytes: buffer.byteLength,
      fileName: options.fileName,
    },
    frames: composited.map((f) => ({ rgba: f.rgba, delayMs: f.delayMs })),
  }
}

interface GifWithExtensions {
  frames?: Array<{
    application?: { id?: string; blocks?: number[] | Uint8Array }
  }>
}

function readLoopCount(gif: unknown): number {
  const withExt = gif as GifWithExtensions
  const appExt = withExt.frames?.find((f) => f.application?.id === 'NETSCAPE2.0')
  const blocks = appExt?.application?.blocks
  // sub-block layout: [1 (loop sub-block id), loopCountLo, loopCountHi]
  if (blocks && blocks.length >= 3) {
    return blocks[1]! | (blocks[2]! << 8)
  }
  return 0
}
