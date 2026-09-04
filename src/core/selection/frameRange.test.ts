import { describe, expect, it } from 'vitest'
import { formatFrameRange, isFrameVisible, parseFrameRange } from './frameRange'

describe('parseFrameRange', () => {
  it('parses a simple range', () => {
    expect(parseFrameRange('1-10', 20).frames).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('parses comma-separated singles and ranges', () => {
    expect(parseFrameRange('1,5,8,20', 20).frames).toEqual([1, 5, 8, 20])
    expect(parseFrameRange('1-10,15,20-25,40', 50).frames).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 21, 22, 23, 24, 25, 40,
    ])
  })

  it('handles spaces around tokens', () => {
    expect(parseFrameRange(' 1 - 3 , 5 ', 10).frames).toEqual([1, 2, 3, 5])
  })

  it('de-duplicates overlapping frames', () => {
    expect(parseFrameRange('1-5,3-7', 10).frames).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('normalizes reversed ranges', () => {
    expect(parseFrameRange('10-5', 10).frames).toEqual([5, 6, 7, 8, 9, 10])
  })

  it('warns on and skips out-of-range frames', () => {
    const result = parseFrameRange('1,50', 10)
    expect(result.frames).toEqual([1])
    expect(result.warnings).toHaveLength(1)
  })

  it('warns on and skips invalid tokens', () => {
    const result = parseFrameRange('1,abc,3', 10)
    expect(result.frames).toEqual([1, 3])
    expect(result.warnings).toHaveLength(1)
  })

  it('returns empty for empty spec', () => {
    expect(parseFrameRange('', 10).frames).toEqual([])
  })
})

describe('formatFrameRange', () => {
  it('collapses consecutive runs into ranges', () => {
    expect(formatFrameRange([1, 2, 3, 4, 5, 8, 20, 21, 22])).toBe('1-5,8,20-22')
  })

  it('handles a single frame', () => {
    expect(formatFrameRange([7])).toBe('7')
  })

  it('handles empty input', () => {
    expect(formatFrameRange([])).toBe('')
  })

  it('round-trips through parseFrameRange', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 21, 22, 23, 24, 25, 40]
    const formatted = formatFrameRange(original)
    expect(parseFrameRange(formatted, 50).frames).toEqual(original)
  })
})

describe('isFrameVisible', () => {
  it('treats empty range as always visible', () => {
    expect(isFrameVisible('', 5, 10)).toBe(true)
  })

  it('respects explicit ranges', () => {
    expect(isFrameVisible('1-5,8', 3, 10)).toBe(true)
    expect(isFrameVisible('1-5,8', 6, 10)).toBe(false)
    expect(isFrameVisible('1-5,8', 8, 10)).toBe(true)
  })
})
