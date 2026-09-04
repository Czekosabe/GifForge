import { useEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useEditorStore } from '../state/editorStore'
import { usePlaybackStore } from '../state/playbackStore'
import { useFrameCacheStore } from '../state/frameCacheStore'
import { getPipeline } from '../workers/client'
import { formatFrameRange, parseFrameRange } from '../core/selection/frameRange'
import { Button } from './ui/Section'

const CELL_WIDTH = 64
const CELL_HEIGHT = 44
const THUMB_SIZE = 96

export function Timeline() {
  const project = useProjectStore((s) => s.project)
  const deleteFrames = useProjectStore((s) => s.deleteFrames)
  const keepFrames = useProjectStore((s) => s.keepFrames)
  const selectedFrames = useEditorStore((s) => s.selectedFrames)
  const setSelectedFrames = useEditorStore((s) => s.setSelectedFrames)
  const currentFrameIndex = usePlaybackStore((s) => s.currentFrameIndex)
  const setCurrentFrameIndex = usePlaybackStore((s) => s.setCurrentFrameIndex)
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const toggle = usePlaybackStore((s) => s.toggle)
  const restart = usePlaybackStore((s) => s.restart)

  const [rangeText, setRangeText] = useState('')
  const [rangeWarning, setRangeWarning] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [containerWidth, setContainerWidth] = useState(800)

  const frameOrder = project?.edits.frameOrder ?? []
  const frameCount = frameOrder.length

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0]?.contentRect.width ?? 800))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollLeft / CELL_WIDTH) - 4)
    const end = Math.min(frameCount, Math.ceil((scrollLeft + containerWidth) / CELL_WIDTH) + 4)
    return { start, end }
  }, [scrollLeft, containerWidth, frameCount])

  const thumbnails = useFrameCacheStore((s) => s.thumbnails)
  const setThumbnail = useFrameCacheStore((s) => s.setThumbnail)

  useEffect(() => {
    if (!project) return
    let cancelled = false
    const pipeline = getPipeline()
    for (let i = visibleRange.start; i < visibleRange.end; i++) {
      const originalIndex = frameOrder[i]
      if (originalIndex === undefined) continue
      if (thumbnails.has(originalIndex)) continue
      pipeline.getThumbnail(originalIndex, THUMB_SIZE).then((bitmap) => {
        if (!cancelled) setThumbnail(originalIndex, bitmap)
      }).catch(() => {})
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRange.start, visibleRange.end, project])

  if (!project) return null

  function applySelection(text: string) {
    setRangeText(text)
    const result = parseFrameRange(text, frameCount)
    setSelectedFrames(result.frames)
    setRangeWarning(result.warnings[0] ?? null)
  }

  return (
    <div className="flex h-40 shrink-0 flex-col border-t border-surface-border bg-surface-1">
      <div className="flex items-center gap-2 border-b border-surface-border px-3 py-1.5">
        <Button variant="ghost" onClick={restart} title="Restart">
          ⏮
        </Button>
        <Button variant="ghost" onClick={toggle} title="Play/Pause (Space)">
          {isPlaying ? '⏸' : '▶'}
        </Button>
        <span className="text-xs text-slate-400">
          Frame {currentFrameIndex + 1} / {frameCount}
        </span>
        <span className="mx-2 h-4 w-px bg-surface-border" />
        <input
          className="w-56 rounded border border-surface-border bg-surface-2 px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent"
          placeholder="e.g. 1-10,15,20-25"
          value={rangeText}
          onChange={(e) => applySelection(e.target.value)}
        />
        <Button
          variant="default"
          disabled={selectedFrames.length === 0}
          onClick={() => {
            deleteFrames(selectedFrames)
            setSelectedFrames([])
            setRangeText('')
          }}
        >
          Delete selected
        </Button>
        <Button
          variant="default"
          disabled={selectedFrames.length === 0}
          onClick={() => {
            keepFrames(selectedFrames)
            setSelectedFrames([])
            setRangeText('')
          }}
        >
          Keep selected
        </Button>
        <Button variant="ghost" onClick={() => applySelection(formatFrameRange(Array.from({ length: frameCount }, (_, i) => i + 1)))}>
          Select all
        </Button>
        <Button
          variant="ghost"
          disabled={frameCount === 0}
          onClick={() => {
            const selected = new Set(selectedFrames)
            const inverted = Array.from({ length: frameCount }, (_, i) => i + 1).filter((n) => !selected.has(n))
            setRangeText(formatFrameRange(inverted))
            setSelectedFrames(inverted)
            setRangeWarning(null)
          }}
        >
          Invert
        </Button>
        <Button variant="ghost" onClick={() => applySelection('')}>
          Clear
        </Button>
        {rangeWarning && <span className="text-[11px] text-amber-400">{rangeWarning}</span>}
      </div>

      <div ref={containerRef} className="no-scrollbar flex-1 overflow-x-auto overflow-y-hidden" onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}>
        <div className="relative" style={{ width: frameCount * CELL_WIDTH, height: CELL_HEIGHT + 20 }}>
          {Array.from({ length: visibleRange.end - visibleRange.start }, (_, offset) => {
            const i = visibleRange.start + offset
            const originalIndex = frameOrder[i]
            if (originalIndex === undefined) return null
            const thumb = thumbnails.get(originalIndex)
            const isCurrent = i === currentFrameIndex
            const isSelected = selectedFrames.includes(i + 1)
            return (
              <button
                key={i}
                className={`absolute top-2 flex flex-col items-center gap-0.5 rounded border p-0.5 transition-colors ${
                  isCurrent ? 'border-accent' : isSelected ? 'border-amber-500' : 'border-transparent hover:border-surface-4'
                }`}
                style={{ left: i * CELL_WIDTH, width: CELL_WIDTH - 4, height: CELL_HEIGHT }}
                onClick={() => setCurrentFrameIndex(i)}
              >
                {thumb ? (
                  <ThumbCanvas bitmap={thumb} />
                ) : (
                  <div className="h-full w-full animate-pulse rounded bg-surface-3" />
                )}
                <span className="text-[9px] text-slate-500">{i + 1}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ThumbCanvas({ bitmap }: { bitmap: ImageBitmap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0)
  }, [bitmap])
  return <canvas ref={canvasRef} className="max-h-full max-w-full rounded object-contain" />
}
