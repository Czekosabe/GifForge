import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { usePlaybackStore } from '../state/playbackStore'
import { getPipeline } from '../workers/client'

/**
 * Explicit full-quality preview (spec: preview and export quality are separate
 * concepts — Performance Mode / downscaled preview bitmaps must never be mistaken
 * for what export will actually produce). Renders exactly ONE frame through the
 * same full-resolution worker pipeline used for export/optimize, on demand.
 */
export function FullQualityPreviewButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded px-2 py-1 hover:bg-surface-2" title="View this frame at full export quality">
        Full Quality
      </button>
      {open && <FullQualityPreviewOverlay onClose={() => setOpen(false)} />}
    </>
  )
}

function FullQualityPreviewOverlay({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project)
  const currentFrameIndex = usePlaybackStore((s) => s.currentFrameIndex)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!project) return
    let cancelled = false
    let bitmap: ImageBitmap | null = null
    setStatus('loading')

    getPipeline()
      .renderPreviewFrame(project.edits, project.layers, currentFrameIndex)
      .then((bmp) => {
        if (cancelled) {
          bmp.close()
          return
        }
        bitmap = bmp
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = bmp.width
        canvas.height = bmp.height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(bmp, 0, 0)
        setStatus('ready')
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render full-quality preview.')
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
      bitmap?.close()
    }
  }, [project, currentFrameIndex])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 p-8" onClick={onClose}>
      <div className="flex items-center gap-3 text-sm text-slate-300">
        <span>
          Full-quality render — frame {currentFrameIndex + 1}
          {project ? ` of ${project.edits.frameOrder.length}` : ''}
        </span>
        <button onClick={onClose} className="rounded bg-surface-3 px-2 py-1 text-xs text-slate-200 hover:bg-surface-4">
          Close
        </button>
      </div>
      <div
        className="flex max-h-[80vh] max-w-[90vw] items-center justify-center overflow-auto rounded-lg border border-surface-border bg-surface-1 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        {status === 'loading' && (
          <div className="flex h-40 w-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        )}
        {status === 'error' && <p className="p-6 text-sm text-red-400">{error}</p>}
        <canvas ref={canvasRef} className={`max-h-[76vh] max-w-[86vw] ${status === 'ready' ? '' : 'hidden'}`} />
      </div>
    </div>
  )
}
