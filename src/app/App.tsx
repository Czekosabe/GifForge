import { lazy, Suspense } from 'react'
import { useProjectStore } from '../state/projectStore'
import { TopBar } from '../components/TopBar'
import { LeftToolbar } from '../components/LeftToolbar'
import { RightInspector } from '../components/RightInspector'
import { Timeline } from '../components/Timeline'
import { JobStatusBar } from '../components/JobStatusBar'
import { StorageHealthBanner } from '../components/StorageHealthBanner'
import { CanvasToolbar } from '../editor/CanvasToolbar'
import { UploadScreen } from './UploadScreen'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useAutosave, useAutosaveRestore } from './useAutosave'
import { useSyncPlaybackFrameCount } from './useSyncPlaybackFrameCount'
import { useGarbageCollectAssets } from './useGarbageCollectAssets'

// react-konva/konva is the single largest dependency in the bundle and is only ever
// needed once a project is actually loaded — split it into its own chunk so the
// upload screen (everything before that) loads fast.
const EditorCanvas = lazy(() => import('../editor/EditorCanvas').then((m) => ({ default: m.EditorCanvas })))

export default function App() {
  // Dev-only hook so the ErrorBoundary's recovery path has a real, reproducible
  // Playwright regression test (e2e/resilience.spec.ts) instead of relying on a
  // temporary throw that gets added and removed by hand each time it's checked.
  // `import.meta.env.DEV` is statically false in production builds, so Vite dead-code
  // -eliminates this branch entirely — it does not exist in the shipped bundle.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('__crashtest')) {
    throw new Error('Intentional crash-test error for verifying the ErrorBoundary (dev-only)')
  }
  const project = useProjectStore((s) => s.project)
  useKeyboardShortcuts()
  useAutosave()
  useSyncPlaybackFrameCount()
  useGarbageCollectAssets()
  const { pending, restoring, restore, discard } = useAutosaveRestore()

  return (
    <div className="flex h-screen w-screen flex-col bg-surface-0">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {project ? (
          <>
            <LeftToolbar />
            <div className="flex min-w-0 flex-1 flex-col">
              <CanvasToolbar />
              <div className="min-h-0 flex-1">
                <Suspense
                  fallback={
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    </div>
                  }
                >
                  <EditorCanvas />
                </Suspense>
              </div>
              <Timeline />
            </div>
            <RightInspector />
          </>
        ) : (
          <UploadScreen />
        )}
      </div>

      {pending && !project && (
        <div className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-[420px] flex-col gap-2 rounded-lg border border-surface-border bg-surface-2 p-4 text-sm shadow-xl">
          <p className="text-slate-200">Restore your previous session — “{pending.project.metadata.name}”?</p>
          <div className="flex gap-2">
            <button
              onClick={restore}
              disabled={restoring}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {restoring ? 'Restoring…' : 'Restore'}
            </button>
            <button onClick={discard} className="rounded bg-surface-3 px-3 py-1.5 text-xs text-slate-300 hover:bg-surface-4">
              Discard
            </button>
          </div>
        </div>
      )}

      <JobStatusBar />
      <StorageHealthBanner />
    </div>
  )
}
