import { describe, expect, it } from 'vitest'
import {
  applySpeedToDelay,
  createInitialFrameOrder,
  deleteFrames,
  keepFrames,
  reverseFrameOrder,
} from './frameOrder'

describe('createInitialFrameOrder', () => {
  it('creates a sequential 0-based order', () => {
    expect(createInitialFrameOrder(5)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('reverseFrameOrder', () => {
  it('reverses without mutating the input', () => {
    const original = [0, 1, 2, 3]
    const reversed = reverseFrameOrder(original)
    expect(reversed).toEqual([3, 2, 1, 0])
    expect(original).toEqual([0, 1, 2, 3])
  })
})

describe('deleteFrames', () => {
  it('removes frames at the given 1-based timeline positions', () => {
    const order = [10, 11, 12, 13, 14]
    expect(deleteFrames(order, [2, 4])).toEqual([10, 12, 14])
  })

  it('is a no-op for an empty selection', () => {
    const order = [10, 11, 12]
    expect(deleteFrames(order, [])).toEqual(order)
  })
})

describe('keepFrames', () => {
  it('keeps only the frames at the given 1-based positions, preserving order', () => {
    const order = [10, 11, 12, 13, 14]
    expect(keepFrames(order, [2, 4])).toEqual([11, 13])
  })
})

describe('applySpeedToDelay', () => {
  it('halves delay at 2x speed', () => {
    expect(applySpeedToDelay(100, 2)).toBe(50)
  })

  it('doubles delay at 0.5x speed', () => {
    expect(applySpeedToDelay(100, 0.5)).toBe(200)
  })

  it('clamps to a minimum of 20ms', () => {
    expect(applySpeedToDelay(20, 3)).toBe(20)
  })

  it('leaves delay unchanged at 1x', () => {
    expect(applySpeedToDelay(83, 1)).toBe(83)
  })
})
