/**
 * Frame-range syntax used throughout the UI, e.g. "1-10,15,20-25,40".
 * UI numbering is 1-based; this module's public functions accept/return 1-based
 * frame numbers except where explicitly documented as 0-based indices.
 */

export interface FrameRangeParseResult {
  /** Sorted, de-duplicated, 1-based frame numbers, clamped to [1, frameCount]. */
  frames: number[]
  /** Human-readable problems found while parsing (out-of-range, invalid tokens). Non-fatal. */
  warnings: string[]
}

export function parseFrameRange(spec: string, frameCount: number): FrameRangeParseResult {
  const warnings: string[] = []
  const result = new Set<number>()

  const tokens = spec
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) {
      let a = Number(rangeMatch[1])
      let b = Number(rangeMatch[2])
      if (a > b) [a, b] = [b, a]
      for (let n = a; n <= b; n++) {
        addFrame(n, frameCount, result, warnings, token)
      }
      continue
    }

    const singleMatch = token.match(/^(\d+)$/)
    if (singleMatch) {
      addFrame(Number(singleMatch[1]), frameCount, result, warnings, token)
      continue
    }

    warnings.push(`Invalid token "${token}" was ignored.`)
  }

  return { frames: [...result].sort((a, b) => a - b), warnings }
}

function addFrame(
  n: number,
  frameCount: number,
  result: Set<number>,
  warnings: string[],
  token: string,
): void {
  if (n < 1 || n > frameCount) {
    warnings.push(`Frame ${n} in "${token}" is out of range (1-${frameCount}) and was skipped.`)
    return
  }
  result.add(n)
}

/** Formats a sorted list of 1-based frame numbers back into compact range syntax. */
export function formatFrameRange(frames: number[]): string {
  if (frames.length === 0) return ''
  const sorted = [...new Set(frames)].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0]!
  let prev = sorted[0]!

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i]
    if (current !== undefined && current === prev + 1) {
      prev = current
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`)
    if (current !== undefined) {
      start = current
      prev = current
    }
  }

  return parts.join(',')
}

export function isFrameVisible(frameRange: FrameRangeSpecLike, frameNumber1Based: number, frameCount: number): boolean {
  if (frameRange.trim().length === 0) return true
  return parseFrameRange(frameRange, frameCount).frames.includes(frameNumber1Based)
}

type FrameRangeSpecLike = string
