import { describe, expect, it } from 'vitest'
import { clampCustomBitrate, computeBitrate } from './bitrate'

describe('computeBitrate', () => {
  it('scales with pixel throughput, not a single hard-coded value', () => {
    const small = computeBitrate(200, 200, 10, 'balanced')
    const large = computeBitrate(1000, 1000, 10, 'balanced')
    expect(large).toBeGreaterThan(small)
  })

  it('scales with the quality preset', () => {
    // Large enough that none of the three presets hit the min-bitrate floor, so the
    // comparison actually reflects the preset weighting, not three different clamped values.
    const high = computeBitrate(800, 800, 24, 'high')
    const balanced = computeBitrate(800, 800, 24, 'balanced')
    const small = computeBitrate(800, 800, 24, 'small')
    expect(high).toBeGreaterThan(balanced)
    expect(balanced).toBeGreaterThan(small)
  })

  it('scales with effective frame rate', () => {
    const slow = computeBitrate(400, 400, 5, 'balanced')
    const fast = computeBitrate(400, 400, 30, 'balanced')
    expect(fast).toBeGreaterThan(slow)
  })

  it('clamps to a sane minimum for a tiny/slow source', () => {
    expect(computeBitrate(10, 10, 1, 'small')).toBeGreaterThanOrEqual(200_000)
  })

  it('clamps to a sane maximum for a huge/fast source', () => {
    expect(computeBitrate(4000, 4000, 60, 'high')).toBeLessThanOrEqual(20_000_000)
  })
})

describe('clampCustomBitrate', () => {
  it('clamps below the minimum up to it', () => {
    expect(clampCustomBitrate(1000)).toBe(200_000)
  })

  it('clamps above the maximum down to it', () => {
    expect(clampCustomBitrate(1_000_000_000)).toBe(20_000_000)
  })

  it('passes through a value already in range', () => {
    expect(clampCustomBitrate(2_000_000)).toBe(2_000_000)
  })
})
