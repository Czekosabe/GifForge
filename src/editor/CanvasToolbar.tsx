import { useMemo } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useEditorStore } from '../state/editorStore'
import { usePlaybackStore } from '../state/playbackStore'
import { computeOutputDimensions } from '../core/render/compositeFrame'
import { FullQualityPreviewButton } from './FullQualityPreview'

export function CanvasToolbar() {
  const project = useProjectStore((s) => s.project)
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const resetView = useEditorStore((s) => s.resetView)
  const performanceMode = useEditorStore((s) => s.performanceMode)
  const setPerformanceMode = useEditorStore((s) => s.setPerformanceMode)
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const toggle = usePlaybackStore((s) => s.toggle)

  const outputDims = useMemo(() => {
    if (!project) return null
    return computeOutputDimensions(
      project.metadata.sourceWidth,
      project.metadata.sourceHeight,
      project.edits.crop,
      project.edits.resize,
      project.edits.rotate,
    )
  }, [project])

  if (!project || !outputDims) return null

  const isEdited =
    outputDims.width !== project.metadata.sourceWidth || outputDims.height !== project.metadata.sourceHeight

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-surface-border bg-surface-1 px-3 text-xs text-slate-400">
      <div className="flex items-center gap-3">
        <span title={isEdited ? `Original: ${project.metadata.sourceWidth} × ${project.metadata.sourceHeight}` : undefined}>
          {outputDims.width} × {outputDims.height}
          {isEdited && (
            <span className="ml-1 text-slate-600">
              (from {project.metadata.sourceWidth} × {project.metadata.sourceHeight})
            </span>
          )}
        </span>
        <span>{project.edits.frameOrder.length} frames</span>
        {performanceMode && <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-amber-400">Performance Mode</span>}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={toggle} className="rounded px-2 py-1 hover:bg-surface-2" title="Play/Pause (Space)">
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button onClick={() => setZoom(zoom - 0.1)} className="rounded px-2 py-1 hover:bg-surface-2">
          −
        </button>
        <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(zoom + 0.1)} className="rounded px-2 py-1 hover:bg-surface-2">
          +
        </button>
        <button onClick={resetView} className="rounded px-2 py-1 hover:bg-surface-2">
          Fit
        </button>
        <span className="mx-1 h-4 w-px bg-surface-border" />
        <FullQualityPreviewButton />
        <label className="ml-2 flex items-center gap-1">
          <input type="checkbox" checked={performanceMode} onChange={(e) => setPerformanceMode(e.target.checked)} className="accent-accent" />
          Performance Mode
        </label>
      </div>
    </div>
  )
}
