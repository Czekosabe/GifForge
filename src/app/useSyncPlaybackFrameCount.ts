import { useEffect } from 'react'
import { useProjectStore } from '../state/projectStore'
import { usePlaybackStore } from '../state/playbackStore'

/**
 * Keeps `playbackStore.frameCount` (and, via its existing clamp, `currentFrameIndex`)
 * in sync with the project's actual current frame count.
 *
 * Without this, deleting/keeping frames, reversing, resetting to original, or
 * undo/redo could all leave `frameCount` stale at whatever it was on load: the
 * playback loop's wraparound (`(currentFrameIndex + 1) % frameCount`) would then
 * use the wrong modulus, and a `currentFrameIndex` left pointing past the new
 * (shorter) frame list would render a blank frame until the user manually scrubbed
 * back into range. Every mutation that changes `frameOrder` goes through
 * `projectStore`, so subscribing here (rather than patching every call site) keeps
 * this correct for every current and future edit that can change frame count.
 */
export function useSyncPlaybackFrameCount() {
  useEffect(() => {
    let lastLength = useProjectStore.getState().project?.edits.frameOrder.length ?? 0
    usePlaybackStore.getState().setFrameCount(lastLength)

    const unsubscribe = useProjectStore.subscribe((state) => {
      const length = state.project?.edits.frameOrder.length ?? 0
      if (length !== lastLength) {
        lastLength = length
        usePlaybackStore.getState().setFrameCount(length)
      }
    })

    return unsubscribe
  }, [])
}
