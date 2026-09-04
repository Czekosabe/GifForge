import { describe, expect, it } from 'vitest'
import {
  applyAspectRatio,
  centerCrop,
  clampCropToBounds,
  computePercentResize,
  computePixelResize,
  computeRotatedBounds,
} from './transforms'

describe('clampCropToBounds', () => {
  it('leaves an in-bounds crop untouched', () => {
    expect(clampCropToBounds({ x: 10, y: 10, width: 50, height: 50 }, 100, 100)).toEqual({
      x: 10,
      y: 10,
      width: 50,
      height: 50,
    })
  })

  it('clamps width/height that exceed source bounds', () => {
    expect(clampCropToBounds({ x: 0, y: 0, width: 200, height: 200 }, 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
  })

  it('pulls x/y back in bounds when crop would overflow the right/bottom edge', () => {
    expect(clampCropToBounds({ x: 80, y: 80, width: 50, height: 50 }, 100, 100)).toEqual({
      x: 50,
      y: 50,
      width: 50,
      height: 50,
    })
  })

  it('never produces a negative position', () => {
    expect(clampCropToBounds({ x: -20, y: -20, width: 30, height: 30 }, 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 30,
      height: 30,
    })
  })
})

describe('centerCrop', () => {
  it('centers the crop box within the source', () => {
    expect(centerCrop(40, 40, 100, 100)).toEqual({ x: 30, y: 30, width: 40, height: 40 })
  })
})

describe('applyAspectRatio', () => {
  it('applies a square aspect ratio', () => {
    const result = applyAspectRatio({ x: 0, y: 0, width: 80, height: 40 }, 1, 200, 200)
    expect(result.width).toBe(result.height)
  })

  it('shrinks to fit when height would overflow', () => {
    const result = applyAspectRatio({ x: 0, y: 0, width: 100, height: 100 }, 16 / 9, 200, 50)
    expect(result.height).toBeLessThanOrEqual(50)
  })
})

describe('computePixelResize', () => {
  it('keeps free mode dimensions as given', () => {
    expect(computePixelResize({ sourceWidth: 100, sourceHeight: 50, targetWidth: 40, targetHeight: 60, mode: 'free' })).toEqual({
      width: 40,
      height: 60,
    })
  })

  it('locks aspect ratio from width', () => {
    const result = computePixelResize({ sourceWidth: 100, sourceHeight: 50, targetWidth: 50, targetHeight: 999, mode: 'lock' })
    expect(result).toEqual({ width: 50, height: 25 })
  })

  it('fits to max height, deriving width', () => {
    const result = computePixelResize({ sourceWidth: 100, sourceHeight: 50, targetWidth: 999, targetHeight: 25, mode: 'fit-height' })
    expect(result).toEqual({ width: 50, height: 25 })
  })
})

describe('computePercentResize', () => {
  it('scales both dimensions by the given percent', () => {
    expect(computePercentResize(100, 200, 50)).toEqual({ width: 50, height: 100 })
    expect(computePercentResize(100, 200, 150)).toEqual({ width: 150, height: 300 })
  })
})

describe('computeRotatedBounds', () => {
  it('leaves bounds unchanged at 0deg', () => {
    expect(computeRotatedBounds(100, 50, 0)).toEqual({ width: 100, height: 50 })
  })

  it('swaps bounds at 90deg', () => {
    expect(computeRotatedBounds(100, 50, 90)).toEqual({ width: 50, height: 100 })
  })

  it('grows bounds at 45deg', () => {
    const result = computeRotatedBounds(100, 100, 45)
    expect(result.width).toBeGreaterThan(100)
    expect(result.height).toBeGreaterThan(100)
  })
})
