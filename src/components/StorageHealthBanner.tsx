import { useStorageHealthStore } from '../state/storageHealthStore'

/**
 * Non-blocking, deduplicated notice for when local persistence (autosave / overlay-asset
 * storage) isn't working — e.g. IndexedDB unavailable, quota exhausted, private-browsing
 * restrictions. Opposite corner from `JobStatusBar` so the two never overlap. A storage
 * failure never blocks editing/export — this is purely informational.
 */
export function StorageHealthBanner() {
  const unhealthy = useStorageHealthStore((s) => s.unhealthy)
  const dismissed = useStorageHealthStore((s) => s.dismissed)
  const message = useStorageHealthStore((s) => s.message)
  const dismiss = useStorageHealthStore((s) => s.dismiss)

  if (!unhealthy || dismissed) return null

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50">
      <div
        role="status"
        className="pointer-events-auto flex w-80 items-start gap-2 rounded-lg border border-amber-800 bg-amber-950/90 px-3 py-2 text-xs text-amber-200 shadow-lg"
      >
        <span aria-hidden="true">⚠</span>
        <p className="flex-1">{message}</p>
        <button onClick={dismiss} aria-label="Dismiss autosave warning" className="text-amber-300 hover:text-amber-100">
          ✕
        </button>
      </div>
    </div>
  )
}
