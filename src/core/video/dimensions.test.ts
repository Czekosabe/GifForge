import { describe, expect, it } from 'vitest'
import { computeEvenDimensions } from './dimensions'

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
