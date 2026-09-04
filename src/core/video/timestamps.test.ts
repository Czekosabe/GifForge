import { describe, expect, it } from 'vitest'
import { computeFrameTimings, delayMsToDurationUs, estimateEffectiveFps, totalDurationUs } from './timestamps'

describe('delayMsToDurationUs', () => {
  it('converts milliseconds to whole microseconds', () => {
    expect(delayMsToDurationUs(40)).toBe(40_000)
    expect(delayMsToDurationUs(80)).toBe(80_000)
  })
})

describe('computeFrameTimings', () => {
  it('accumulates variable delays into timestamps, never assuming constant FPS', () => {
    const timings = computeFrameTimings([40, 80, 20, 120])
    expect(timings).toEqual([
      { timestampUs: 0, durationUs: 40_000 },
      { timestampUs: 40_000, durationUs: 80_000 },
      { timestampUs: 120_000, durationUs: 20_000 },
      { timestampUs: 140_000, durationUs: 120_000 },
    ])
  })

  it('is empty for an empty delay list', () => {
    expect(computeFrameTimings([])).toEqual([])
  })

  it('handles a single frame', () => {
    expect(computeFrameTimings([100])).toEqual([{ timestampUs: 0, durationUs: 100_000 }])
  })
})

describe('totalDurationUs', () => {
  it('matches the real sum of the source delays, not an assumed frame rate', () => {
    expect(totalDurationUs([40, 80, 20, 120])).toBe(260_000)
  })

  it('does not compound rounding drift over many frames', () => {
    // 33.33ms x 30 frames should total very close to 1000ms (30fps-ish source), not drift
    // meaningfully due to per-frame rounding.
    const delays = new Array(30).fill(33.333)
    const total = totalDurationUs(delays)
    expect(total / 1000).toBeCloseTo(1000, 0) // within 0.5ms of 1 second
  })
})

describe('estimateEffectiveFps', () => {
  it('derives fps from real total duration and frame count', () => {
    // 4 frames totaling 260ms -> ~15.38 fps
    expect(estimateEffectiveFps([40, 80, 20, 120])).toBeCloseTo(1000 / (260 / 4), 2)
  })

  it('falls back to a sane default for an empty delay list', () => {
    expect(estimateEffectiveFps([])).toBe(10)
  })

  it('clamps to a sane range for pathological inputs', () => {
    expect(estimateEffectiveFps([0, 0, 0])).toBeLessThanOrEqual(60)
    expect(estimateEffectiveFps([100_000])).toBeGreaterThanOrEqual(1)
  })
})
