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
  it('re-encodes a decoded real GIF into a valid, non-empty, decodable GIF', async () => {
    const source = decodeGif(loadFixture('loading-icon.gif'), { fileName: 'loading-icon.gif' })

    const bytes = await encodeGif(source.frames, {
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

  it('produces a smaller file with a reduced color count', async () => {
    const source = decodeGif(loadFixture('loading-icon.gif'), { fileName: 'loading-icon.gif' })

    const highQuality = await encodeGif(source.frames, {
      width: source.metadata.width,
      height: source.metadata.height,
      maxColors: 256,
      dither: true,
      ditherStrength: 1,
      loopMode: 'forever',
      customLoopCount: 0,
    })

    const lowQuality = await encodeGif(source.frames, {
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

  it('honors loop mode "none" vs "forever" in the encoded NETSCAPE extension', async () => {
    const source = decodeGif(loadFixture('loading-icon.gif'), { fileName: 'loading-icon.gif' })
    const noLoop = await encodeGif(source.frames, {
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

  it('clamps an out-of-range custom loop count instead of silently wrapping it', async () => {
    const source = decodeGif(loadFixture('loading-icon.gif'), { fileName: 'loading-icon.gif' })
    // The GIF NETSCAPE loop-count field is 16-bit; 65536 wraps to 0 ("loop forever") if written
    // raw and unclamped — the exact opposite of the finite count the user actually requested.
    // The "Repeat count" field (ExportPanel.tsx) has no upper bound of its own, so this must be
    // enforced at the encoder boundary.
    const encoded = await encodeGif(source.frames, {
      width: source.metadata.width,
      height: source.metadata.height,
      maxColors: 64,
      dither: false,
      ditherStrength: 0,
      loopMode: 'custom',
      customLoopCount: 65536,
    })
    const roundTripped = decodeGif(encoded.buffer as ArrayBuffer, { fileName: 'roundtrip.gif' })
    expect(roundTripped.metadata.loopCount).toBe(65535)
  })

  it('rejects encoding beyond the GIF format\'s 16-bit dimension limit instead of silently wrapping it', async () => {
    // Real reproduction: a "wide but short" resize (e.g. 70000x4) stays well within memory
    // limits (so it doesn't hit an out-of-memory error the way a large square resize would),
    // but 70000 overflows the 16-bit width field gifenc writes with no bounds check of its own
    // (70000 wraps to 4464) — this used to download successfully as a silently corrupt file.
    const width = 70000
    const height = 4
    const rgba = new Uint8ClampedArray(width * height * 4).fill(255)
    await expect(
      encodeGif([{ rgba, delayMs: 100 }], {
        width,
        height,
        maxColors: 2,
        dither: false,
        ditherStrength: 0,
        loopMode: 'forever',
        customLoopCount: 0,
      }),
    ).rejects.toThrow(/65535/)
  })

  it('rejects encoding zero frames', async () => {
    await expect(
      encodeGif([], {
        width: 10,
        height: 10,
        maxColors: 64,
        dither: false,
        ditherStrength: 0,
        loopMode: 'forever',
        customLoopCount: 0,
      }),
    ).rejects.toThrow()
  })
})
