import { create } from 'zustand'

const DEFAULT_MESSAGE = 'Local autosave is unavailable. You can continue editing, but your project may not survive a page reload.'

/**
 * Tiny, dedicated piece of state for "is local persistence (autosave / overlay-asset
 * storage) currently working" — deliberately separate from `jobStore`. Storage health is a
 * standing condition ("is IndexedDB usable right now"), not an async operation with
 * progress/cancel semantics, so forcing it through the job system would be the wrong shape
 * for both.
 *
 * Deduplication policy: `reportFailure` only transitions out of a *healthy* state — while
 * already `unhealthy`, repeated failures (e.g. every 1.5s autosave retry) are no-ops, so the
 * notice shows once per genuine failure episode, not once per attempt. `reportSuccess` clears
 * `unhealthy` (and un-dismisses) so a later, genuinely new failure can notify again.
 */
interface StorageHealthState {
  unhealthy: boolean
  dismissed: boolean
  message: string
  reportFailure: (message?: string) => void
  reportSuccess: () => void
  dismiss: () => void
}

export const useStorageHealthStore = create<StorageHealthState>((set, get) => ({
  unhealthy: false,
  dismissed: false,
  message: DEFAULT_MESSAGE,

  reportFailure: (message) => {
    if (get().unhealthy) return
    set({ unhealthy: true, dismissed: false, message: message ?? DEFAULT_MESSAGE })
  },

  reportSuccess: () => {
    if (!get().unhealthy) return
    set({ unhealthy: false, dismissed: false, message: DEFAULT_MESSAGE })
  },

  dismiss: () => set({ dismissed: true }),
}))
