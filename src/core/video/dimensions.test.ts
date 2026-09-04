import { describe, expect, it } from 'vitest'
import { computeEvenDimensions, computeScaledPaddedDimensions } from './dimensions'

describe('computeEvenDimensions', () => {
  it('leaves already-even dimensions untouched', () => {
    expect(computeEvenDimensions(400, 300)).toEqual({ width: 400, height: 300, padded: false })
  })

  it('pads an odd width by exactly 1px', () => {
    expect(computeEvenDimensions(401, 300)).toEqual({ width: 402, height: 300, padded: true })
  })

  it('pads an odd height by exactly 1px', () => {
    expect(computeEvenDimensions(400, 301)).toEqual({ width: 400, height: 302, padded: true })
  })

  it('pads both dimensions when both are odd (the 401x301 case from the spec)', () => {
    expect(computeEvenDimensions(401, 301)).toEqual({ width: 402, height: 302, padded: true })
  })

  it('never reduces a dimension', () => {
    const { width, height } = computeEvenDimensions(401, 301)
    expect(width).toBeGreaterThanOrEqual(401)
    expect(height).toBeGreaterThanOrEqual(301)
  })
})

describe('computeScaledPaddedDimensions', () => {
  it('at 100% scale, matches computeEvenDimensions directly', () => {
    expect(computeScaledPaddedDimensions(441, 291, 100)).toEqual(computeEvenDimensions(441, 291))
  })

  it('scales down before padding — the actual size a real export would encode at', () => {
    // 4000x3000 at 50% -> 2000x1500 (both already even) -> no padding needed.
    expect(computeScaledPaddedDimensions(4000, 3000, 50)).toEqual({ width: 2000, height: 1500, padded: false })
  })

  it('pads the scaled-down result when the scaled size itself is odd', () => {
    // 401x301 at 50% -> round(200.5)=201 x round(150.5)=151, both odd -> padded to 202x152.
    expect(computeScaledPaddedDimensions(401, 301, 50)).toEqual({ width: 202, height: 152, padded: true })
  })

  it('never scales down to zero, even at an extreme scale-down on a tiny source', () => {
    const { width, height } = computeScaledPaddedDimensions(2, 2, 10)
    expect(width).toBeGreaterThanOrEqual(1)
    expect(height).toBeGreaterThanOrEqual(1)
  })
})
