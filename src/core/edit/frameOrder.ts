/**
 * Pure helpers for manipulating a project's frame order — the ordered list of
 * ORIGINAL source frame indices (0-based) that make up the current timeline.
 * Deleting, keeping, and reversing frames are all just reorderings of this array;
 * the original decoded source frames are never mutated.
 */

export function createInitialFrameOrder(frameCount: number): number[] {
  return Array.from({ length: frameCount }, (_, i) => i)
}

export function reverseFrameOrder(frameOrder: number[]): number[] {
  return [...frameOrder].reverse()
}

/** `selected1Based` refers to positions in the CURRENT timeline (1-based), not original source indices. */
export function deleteFrames(frameOrder: number[], selected1Based: number[]): number[] {
  const toDelete = new Set(selected1Based)
  return frameOrder.filter((_, i) => !toDelete.has(i + 1))
}

export function keepFrames(frameOrder: number[], selected1Based: number[]): number[] {
  const toKeep = new Set(selected1Based)
  return frameOrder.filter((_, i) => toKeep.has(i + 1))
}

export function applySpeedToDelay(delayMs: number, factor: number): number {
  if (factor <= 0) return delayMs
  // GIF delays are stored in 1/100s units, so anything below ~20ms rounds to "as fast
  // as possible" in most browsers — clamp to a sane floor to avoid runaway playback.
  return Math.max(20, Math.round(delayMs / factor))
}
