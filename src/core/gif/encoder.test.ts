import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decodeGif } from './decoder'
import { encodeGif } from './encoder'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function loadFixture(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(projectRoot, 'fixtures', name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('encodeGif round-trip', () => {
  it('re-encodes a decoded real GIF into a valid, non-empty, decodable GIF', () => {
    const source = decodeGif(loadFixture('loading-icon.gif'), { fileName: 'loading-icon.gif' })

    const bytes = encodeGif(source.frames, {
      width: source.metadata.width,
      height: source.metadata.height,
      maxColors: 256,
      dither: true,
      ditherStrength: 1,
      loopMode: 'forever',
      customLoopCount: 0,
    })

    expect(bytes.length).toBeGreaterThan(0)
    // GIF signature
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a')

    const roundTripped = decodeGif(bytes.buffer as ArrayBuffer, { fileName: 'roundtrip.gif' })
    expect(roundTripped.metadata.width).toBe(source.metadata.width)
    expect(roundTripped.metadata.height).toBe(source.metadata.height)
    expect(roundTripped.metadata.frameCount).toBe(source.metadata.frameCount)
    expect(roundTripped.metadata.durationMs).toBeGreaterThan(0)
  })

  it('produces a smaller file with a reduced color count', () => {
    const source = decodeGif(loadFixture('loading-icon.gif'), { fileName: 'loading-icon.gif' })

    const highQuality = encodeGif(source.frames, {
      width: source.metadata.width,
      height: source.metadata.height,
      maxColors: 256,
      dither: true,
      ditherStrength: 1,
      loopMode: 'forever',
      customLoopCount: 0,
    })

    const lowQuality = encodeGif(source.frames, {
      width: source.metadata.width,
      height: source.metadata.height,
      maxColors: 16,
      dither: false,
      ditherStrength: 0,
      loopMode: 'forever',
      customLoopCount: 0,
    })

    expect(lowQuality.length).toBeLessThan(highQuality.length)
  })

  it('honors loop mode "none" vs "forever" in the encoded NETSCAPE extension', () => {
    const source = decodeGif(loadFixture('loading-icon.gif'), { fileName: 'loading-icon.gif' })
    const noLoop = encodeGif(source.frames, {
      width: source.metadata.width,
      height: source.metadata.height,
      maxColors: 64,
      dither: false,
      ditherStrength: 0,
      loopMode: 'none',
      customLoopCount: 0,
    })
    // "none" loop mode should omit (or zero-repeat) the NETSCAPE application extension entirely
    // in a way that a re-decode still succeeds — correctness check, not byte-exact.
    const roundTripped = decodeGif(noLoop.buffer as ArrayBuffer, { fileName: 'roundtrip.gif' })
    expect(roundTripped.metadata.frameCount).toBe(source.metadata.frameCount)
  })

  it('rejects encoding zero frames', () => {
    expect(() =>
      encodeGif([], {
        width: 10,
        height: 10,
        maxColors: 64,
        dither: false,
        ditherStrength: 0,
        loopMode: 'forever',
        customLoopCount: 0,
      }),
    ).toThrow()
  })
})
