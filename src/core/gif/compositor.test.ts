import { describe, expect, it } from 'vitest'
import { compositeGifFrames, type RawFramePatch } from './compositor'

/** Builds a solid-color RGBA patch of the given size. */
function solidPatch(width: number, height: number, [r, g, b, a]: [number, number, number, number]): Uint8ClampedArray {
  const patch = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    patch[i * 4] = r
    patch[i * 4 + 1] = g
    patch[i * 4 + 2] = b
    patch[i * 4 + 3] = a
  }
  return patch
}

function pixelAt(rgba: Uint8ClampedArray, screenWidth: number, x: number, y: number): [number, number, number, number] {
  const idx = (y * screenWidth + x) * 4
  return [rgba[idx]!, rgba[idx + 1]!, rgba[idx + 2]!, rgba[idx + 3]!]
}

const RED: [number, number, number, number] = [255, 0, 0, 255]
const BLUE: [number, number, number, number] = [0, 0, 255, 255]
const GREEN: [number, number, number, number] = [0, 255, 0, 255]
const TRANSPARENT: [number, number, number, number] = [0, 0, 0, 0]

describe('compositeGifFrames', () => {
  it('draws a single full-canvas frame as-is', () => {
    const frames: RawFramePatch[] = [
      { patch: solidPatch(4, 4, RED), dims: { left: 0, top: 0, width: 4, height: 4 }, disposalType: 1, delay: 10 },
    ]
    const [result] = compositeGifFrames(4, 4, frames)
    expect(pixelAt(result!.rgba, 4, 0, 0)).toEqual(RED)
    expect(pixelAt(result!.rgba, 4, 3, 3)).toEqual(RED)
    expect(result!.delayMs).toBe(10)
  })

  it('disposal 0/1: leaves canvas intact so the next partial patch overlays it', () => {
    const frames: RawFramePatch[] = [
      { patch: solidPatch(4, 4, RED), dims: { left: 0, top: 0, width: 4, height: 4 }, disposalType: 1, delay: 10 },
      // second frame only touches a 2x2 region in the corner
      { patch: solidPatch(2, 2, BLUE), dims: { left: 0, top: 0, width: 2, height: 2 }, disposalType: 1, delay: 10 },
    ]
    const [, second] = compositeGifFrames(4, 4, frames)
    expect(pixelAt(second!.rgba, 4, 0, 0)).toEqual(BLUE) // updated region
    expect(pixelAt(second!.rgba, 4, 3, 3)).toEqual(RED) // untouched region still shows frame 1
  })

  it('transparent pixels within a patch do not overwrite the canvas beneath them', () => {
    const patch = solidPatch(4, 4, TRANSPARENT)
    // paint just the top-left pixel blue, leave the rest transparent
    patch[0] = BLUE[0]; patch[1] = BLUE[1]; patch[2] = BLUE[2]; patch[3] = BLUE[3]
    const frames: RawFramePatch[] = [
      { patch: solidPatch(4, 4, RED), dims: { left: 0, top: 0, width: 4, height: 4 }, disposalType: 1, delay: 10 },
      { patch, dims: { left: 0, top: 0, width: 4, height: 4 }, disposalType: 1, delay: 10 },
    ]
    const [, second] = compositeGifFrames(4, 4, frames)
    expect(pixelAt(second!.rgba, 4, 0, 0)).toEqual(BLUE)
    expect(pixelAt(second!.rgba, 4, 1, 1)).toEqual(RED) // shows through from frame 1
  })

  it('disposal 2: restores the frame region to transparent background for the next frame', () => {
    const frames: RawFramePatch[] = [
      { patch: solidPatch(4, 4, RED), dims: { left: 0, top: 0, width: 4, height: 4 }, disposalType: 1, delay: 10 },
      // draws a 2x2 blue square, disposal=2 means it should be cleared after being shown
      { patch: solidPatch(2, 2, BLUE), dims: { left: 0, top: 0, width: 2, height: 2 }, disposalType: 2, delay: 10 },
      // third frame draws nothing over the top-left region (transparent), relying on disposal from frame 2
      { patch: solidPatch(1, 1, TRANSPARENT), dims: { left: 0, top: 0, width: 1, height: 1 }, disposalType: 1, delay: 10 },
    ]
    const [first, second, third] = compositeGifFrames(4, 4, frames)
    expect(pixelAt(first!.rgba, 4, 0, 0)).toEqual(RED)
    expect(pixelAt(second!.rgba, 4, 0, 0)).toEqual(BLUE)
    // after disposal of frame 2's rect, region should be transparent, not red or blue
    expect(pixelAt(third!.rgba, 4, 0, 0)).toEqual(TRANSPARENT)
    // pixels outside the disposed region are untouched
    expect(pixelAt(third!.rgba, 4, 3, 3)).toEqual(RED)
  })

  it('disposal 3: restores the frame region to what it looked like before this frame was drawn', () => {
    const frames: RawFramePatch[] = [
      { patch: solidPatch(4, 4, RED), dims: { left: 0, top: 0, width: 4, height: 4 }, disposalType: 1, delay: 10 },
      // draws a green square over red, disposal=3 -> after showing, revert back to red (the prior state)
      { patch: solidPatch(2, 2, GREEN), dims: { left: 0, top: 0, width: 2, height: 2 }, disposalType: 3, delay: 10 },
      { patch: solidPatch(1, 1, TRANSPARENT), dims: { left: 0, top: 0, width: 1, height: 1 }, disposalType: 1, delay: 10 },
    ]
    const [, second, third] = compositeGifFrames(4, 4, frames)
    expect(pixelAt(second!.rgba, 4, 0, 0)).toEqual(GREEN)
    // frame 3 shows the pre-frame-2 state (red), not transparent
    expect(pixelAt(third!.rgba, 4, 0, 0)).toEqual(RED)
  })

  it('normalizes zero delay to a sane minimum', () => {
    const frames: RawFramePatch[] = [
      { patch: solidPatch(1, 1, RED), dims: { left: 0, top: 0, width: 1, height: 1 }, disposalType: 1, delay: 0 },
    ]
    const [result] = compositeGifFrames(1, 1, frames)
    expect(result!.delayMs).toBe(100)
  })

  it('preserves an explicit non-zero delay as-is (already milliseconds from gifuct-js)', () => {
    const frames: RawFramePatch[] = [
      { patch: solidPatch(1, 1, RED), dims: { left: 0, top: 0, width: 1, height: 1 }, disposalType: 1, delay: 250 },
    ]
    const [result] = compositeGifFrames(1, 1, frames)
    expect(result!.delayMs).toBe(250)
  })
})
