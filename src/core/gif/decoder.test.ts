import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decodeGif, GifDecodeError } from './decoder'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function loadFixture(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(projectRoot, 'fixtures', name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('decodeGif', () => {
  it('decodes a real multi-frame GIF with correct metadata', () => {
    const buffer = loadFixture('rotating-earth.gif')
    const result = decodeGif(buffer, { fileName: 'rotating-earth.gif' })

    expect(result.metadata.width).toBe(400)
    expect(result.metadata.height).toBe(400)
    expect(result.metadata.frameCount).toBe(44)
    expect(result.frames).toHaveLength(44)
    expect(result.metadata.durationMs).toBeGreaterThan(0)
    for (const frame of result.frames) {
      expect(frame.rgba.length).toBe(400 * 400 * 4)
    }
  })

  it('decodes a second real GIF (transparency-heavy spinner)', () => {
    const buffer = loadFixture('loading-icon.gif')
    const result = decodeGif(buffer, { fileName: 'loading-icon.gif' })

    expect(result.metadata.width).toBe(441)
    expect(result.metadata.height).toBe(291)
    expect(result.metadata.frameCount).toBe(24)
    expect(result.frames).toHaveLength(24)
  })

  it('rejects a file with an invalid signature', () => {
    const notAGif = new TextEncoder().encode('this is not a gif file at all').buffer
    expect(() => decodeGif(notAGif as ArrayBuffer, { fileName: 'fake.gif' })).toThrow(GifDecodeError)
  })

  it('rejects a truncated / corrupt buffer', () => {
    const tooShort = new Uint8Array([0x47, 0x49]).buffer
    expect(() => decodeGif(tooShort, { fileName: 'short.gif' })).toThrow(GifDecodeError)
  })
})
