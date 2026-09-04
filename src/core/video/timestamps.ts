/**
 * Converts GIF-style per-frame delays (milliseconds, already post speed-change/frame-
 * reduction — the same numbers GIF export encodes) into WebCodecs-style integer-microsecond
 * timestamps/durations. Deliberately its own pure module: this is exactly the class of bug
 * that once shipped for real in this project (a 10x GIF playback-speed regression from
 * double-applying a delay conversion) — variable per-frame delays make it easy to get subtly
 * wrong, so the conversion is isolated and unit tested rather than inlined into the encode loop.
 *
 * Each delay is rounded to whole microseconds once, and timestamps accumulate from those
 * already-rounded durations (not by re-deriving `index * averageDelay` or repeatedly summing
 * unrounded floats) — this bounds any rounding error to sub-microsecond-per-frame, with no
 * compounding drift over a long animation.
 */
export interface FrameTiming {
  timestampUs: number
  durationUs: number
}

export function delayMsToDurationUs(delayMs: number): number {
  return Math.round(delayMs * 1000)
}

export function computeFrameTimings(delaysMs: number[]): FrameTiming[] {
  const timings: FrameTiming[] = []
  let cursorUs = 0
  for (const delayMs of delaysMs) {
    const durationUs = delayMsToDurationUs(delayMs)
    timings.push({ timestampUs: cursorUs, durationUs })
    cursorUs += durationUs
  }
  return timings
}

export function totalDurationUs(delaysMs: number[]): number {
  return delaysMs.reduce((sum, delayMs) => sum + delayMsToDurationUs(delayMs), 0)
}

/** Effective average frame rate implied by the real per-frame delays — used for bitrate
 * estimation only (never assumed to be a fixed encoding frame rate). */
export function estimateEffectiveFps(delaysMs: number[]): number {
  if (delaysMs.length === 0) return 10
  const totalMs = delaysMs.reduce((sum, d) => sum + d, 0)
  if (totalMs <= 0) return 10
  return Math.min(60, Math.max(1, (delaysMs.length * 1000) / totalMs))
}
