import { describe, expect, it } from 'vitest'
import { applyFrameStep, buildCandidateConfigs, type TargetSizeSearchInput } from './targetSizeSearch'
import type { EncodeFrameInput } from '../gif/encoder'

function baseInput(overrides: Partial<TargetSizeSearchInput> = {}): TargetSizeSearchInput {
  return {
    frames: [],
    width: 100,
    height: 100,
    targetBytes: 1000,
    keepDimensions: true,
    allowFpsReduction: false,
    allowFrameDropping: false,
    allowResolutionReduction: false,
    loopMode: 'forever',
    customLoopCount: 0,
    ...overrides,
  }
}

describe('buildCandidateConfigs', () => {
  it('starts with the least destructive config (full color, no dither loss, no scaling)', () => {
    const configs = buildCandidateConfigs(baseInput())
    expect(configs[0]).toEqual({ maxColors: 256, dither: true, frameStep: 1, scalePercent: 100 })
  })

  it('never introduces frame stepping when both frame-reduction flags are off', () => {
    const configs = buildCandidateConfigs(baseInput())
    expect(configs.every((c) => c.frameStep === 1)).toBe(true)
  })

  it('never introduces scaling when resolution reduction is disallowed', () => {
    const configs = buildCandidateConfigs(baseInput())
    expect(configs.every((c) => c.scalePercent === 100)).toBe(true)
  })

  it('never scales when keepDimensions is true, even if resolution reduction is allowed', () => {
    const configs = buildCandidateConfigs(baseInput({ allowResolutionReduction: true, keepDimensions: true }))
    expect(configs.every((c) => c.scalePercent === 100)).toBe(true)
  })

  it('introduces frame stepping only up to 2 when only FPS reduction is allowed', () => {
    const configs = buildCandidateConfigs(baseInput({ allowFpsReduction: true }))
    expect(Math.max(...configs.map((c) => c.frameStep))).toBe(2)
  })

  it('introduces more aggressive frame stepping when frame dropping is allowed', () => {
    const configs = buildCandidateConfigs(baseInput({ allowFrameDropping: true }))
    expect(Math.max(...configs.map((c) => c.frameStep))).toBe(4)
  })

  it('introduces resolution scaling when allowed and dimensions are not locked', () => {
    const configs = buildCandidateConfigs(baseInput({ allowResolutionReduction: true, keepDimensions: false }))
    expect(Math.min(...configs.map((c) => c.scalePercent))).toBeLessThan(100)
  })

  it('produces every config as strictly less-or-equal palette size than the max', () => {
    const configs = buildCandidateConfigs(baseInput())
    expect(configs.every((c) => c.maxColors <= 256 && c.maxColors >= 2)).toBe(true)
  })

  it('walks one dimension at a time rather than a full cartesian product, so every allowed technique is reached within a small attempt budget', () => {
    // Regression test: a nested-loop cartesian generator would produce
    // 10 colors * 2 dither * 4 frameSteps * 5 scaleSteps = 400 configs, and a
    // default 24-attempt cap would then NEVER reach resolution/frame-rate
    // reduction even though they were explicitly allowed — that's a real bug
    // that was caught live (a target-size search with all reduction flags on
    // still only ever tried color/dither changes at 100% scale/frame rate).
    const configs = buildCandidateConfigs(
      baseInput({ allowFpsReduction: true, allowFrameDropping: true, allowResolutionReduction: true, keepDimensions: false }),
    )
    expect(configs.length).toBeLessThanOrEqual(24)
    expect(configs.some((c) => c.scalePercent < 100)).toBe(true)
    expect(configs.some((c) => c.frameStep > 1)).toBe(true)
    // The single most destructive combination (lowest colors, no dither, most
    // frame-dropping, smallest scale) must actually appear as the last config,
    // proving the walk reaches every dimension's extreme, not just some of them.
    const last = configs[configs.length - 1]!
    expect(last.scalePercent).toBe(40)
    expect(last.frameStep).toBe(4)
    expect(last.dither).toBe(false)
    expect(last.maxColors).toBe(8)
  })

  it('never regresses a dimension once relaxed (each config is monotonically no-better than the last)', () => {
    const configs = buildCandidateConfigs(
      baseInput({ allowFpsReduction: true, allowFrameDropping: true, allowResolutionReduction: true, keepDimensions: false }),
    )
    for (let i = 1; i < configs.length; i++) {
      const prev = configs[i - 1]!
      const cur = configs[i]!
      expect(cur.maxColors).toBeLessThanOrEqual(prev.maxColors)
      expect(cur.frameStep).toBeGreaterThanOrEqual(prev.frameStep)
      expect(cur.scalePercent).toBeLessThanOrEqual(prev.scalePercent)
    }
  })
})

describe('applyFrameStep', () => {
  const frames: EncodeFrameInput[] = [
    { rgba: new Uint8ClampedArray(4), delayMs: 100 },
    { rgba: new Uint8ClampedArray(4), delayMs: 100 },
    { rgba: new Uint8ClampedArray(4), delayMs: 100 },
    { rgba: new Uint8ClampedArray(4), delayMs: 100 },
  ]

  it('is a no-op at step 1', () => {
    expect(applyFrameStep(frames, 1)).toEqual(frames)
  })

  it('drops frames and folds their delay into the kept frame to preserve total duration', () => {
    const result = applyFrameStep(frames, 2)
    expect(result).toHaveLength(2)
    expect(result[0]!.delayMs).toBe(200)
    expect(result[1]!.delayMs).toBe(200)
    const totalBefore = frames.reduce((s, f) => s + f.delayMs, 0)
    const totalAfter = result.reduce((s, f) => s + f.delayMs, 0)
    expect(totalAfter).toBe(totalBefore)
  })
})
