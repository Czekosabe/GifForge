import { useEffect, useRef, useState } from 'react'
import type { CompareDecodeResult } from '../workers/pipeline.worker'
import { clamp01, computeViewportLayout, computeZoomScale, viewportPointToNormalized, type ZoomLevel } from './beforeAfterViewport'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

interface BeforeAfterCompareProps {
  original: CompareDecodeResult
  optimized: CompareDecodeResult
  /** The editor's current timeline frame — reused (not re-invented) as the default frame
   * for Frame mode, mapped proportionally if the two sides have different frame counts. */
  currentEditorFrameIndex: number
}

type Mode = 'animated' | 'frame'

const ZOOM_LEVELS: { value: ZoomLevel; label: string }[] = [
  { value: 'fit', label: 'Fit' },
  { value: 1, label: '100%' },
  { value: 2, label: '200%' },
  { value: 4, label: '400%' },
  { value: 8, label: '800%' },
]

/**
 * Real visual Before/After viewer for an optimization result. Both sides are actual decoded
 * frames — "Original" from the real uploaded source bytes, "Optimized" from the real
 * optimized GIF bytes the download button sends — never a CSS filter or guessed effect, so
 * quantization/dithering/palette/resolution/frame-reduction artifacts genuinely show up.
 *
 * Animated playback drives each side from a single shared clock, but each side independently
 * resolves its own current frame from its own delay list and wraps at its own frame count —
 * a real, honest sync (both sides show what would actually be on screen at the same
 * wall-clock moment), not a faked 1:1 frame correspondence that would silently misrepresent
 * results whenever optimization used frame-rate reduction (differing frame counts).
 *
 * Frame mode additionally supports pixel-level zoom/pan inspection (dithering texture, edges,
 * palette artifacts). Zoom/pan is purely a *display* transform over the already-decoded
 * bitmaps — canvas backing stores stay at native resolution throughout; zooming/panning never
 * redraws, re-decodes, or touches the worker, so it can't trigger a re-optimize. Original and
 * Optimized share one normalized pan center (see `beforeAfterViewport.ts`) so the same visual
 * region stays aligned on both sides even when optimization changed the resolution.
 */
export function BeforeAfterCompare({ original, optimized, currentEditorFrameIndex }: BeforeAfterCompareProps) {
  const [mode, setMode] = useState<Mode>('animated')
  const [playing, setPlaying] = useState(true)
  const [split, setSplit] = useState(50)
  const [zoom, setZoom] = useState<ZoomLevel>('fit')
  const [panCenter, setPanCenter] = useState({ x: 0.5, y: 0.5 })
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [hoverPoint, setHoverPoint] = useState<{ original: { x: number; y: number } | null; optimized: { x: number; y: number } | null } | null>(
    null,
  )

  const originalCanvasRef = useRef<HTMLCanvasElement>(null)
  const optimizedCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const panDragRef = useRef<{ lastX: number; lastY: number } | null>(null)

  // A genuinely new comparison result (not a mode switch, not a frame scrub) resets the
  // inspection viewport — an old zoom/pan position from a previous result would be
  // meaningless (and possibly out of range) for a new one.
  useEffect(() => {
    setZoom('fit')
    setPanCenter({ x: 0.5, y: 0.5 })
  }, [original, optimized])

  useEffect(() => {
    const c = originalCanvasRef.current
    if (c) {
      c.width = original.width
      c.height = original.height
    }
  }, [original])

  useEffect(() => {
    const c = optimizedCanvasRef.current
    if (c) {
      c.width = optimized.width
      c.height = optimized.height
    }
  }, [optimized])

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) setViewportSize({ width: box.width, height: box.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (mode !== 'animated' || !playing) return

    let raf = 0
    let lastTime = 0
    const acc = { original: 0, optimized: 0 }
    const idx = { original: 0, optimized: 0 }

    function draw(side: 'original' | 'optimized', frameIdx: number) {
      const data = side === 'original' ? original : optimized
      const canvas = side === 'original' ? originalCanvasRef.current : optimizedCanvasRef.current
      const bitmap = data.bitmaps[frameIdx]
      if (canvas && bitmap) canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
    }

    draw('original', 0)
    draw('optimized', 0)

    function tick(now: number) {
      if (lastTime === 0) lastTime = now
      const elapsed = now - lastTime
      lastTime = now

      for (const side of ['original', 'optimized'] as const) {
        const data = side === 'original' ? original : optimized
        if (data.bitmaps.length <= 1) continue
        acc[side] += elapsed
        const delay = data.frameDelaysMs[idx[side]] ?? 100
        if (acc[side] >= delay) {
          acc[side] = 0
          idx[side] = (idx[side] + 1) % data.bitmaps.length
          draw(side, idx[side])
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode, playing, original, optimized])

  useEffect(() => {
    if (mode !== 'frame') return
    const originalIdx = Math.min(original.frameCount - 1, Math.max(0, currentEditorFrameIndex))
    const proportional = original.frameCount > 0 ? originalIdx / original.frameCount : 0
    const optimizedIdx = Math.min(optimized.frameCount - 1, Math.max(0, Math.round(proportional * optimized.frameCount)))

    const oc = originalCanvasRef.current
    const ob = original.bitmaps[originalIdx]
    if (oc && ob) oc.getContext('2d')?.drawImage(ob, 0, 0)

    const pc = optimizedCanvasRef.current
    const pb = optimized.bitmaps[optimizedIdx]
    if (pc && pb) pc.getContext('2d')?.drawImage(pb, 0, 0)
  }, [mode, currentEditorFrameIndex, original, optimized])

  function moveSplitTo(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    setSplit(Math.min(100, Math.max(0, pct)))
  }

  const zoomed = mode === 'frame' && zoom !== 'fit'

  function handleContainerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    if (zoomed) {
      panDragRef.current = { lastX: e.clientX, lastY: e.clientY }
    } else {
      moveSplitTo(e.clientX)
    }
  }

  function handleContainerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    updateHover(e)
    if (e.buttons !== 1) return
    if (zoomed && panDragRef.current) {
      const dx = e.clientX - panDragRef.current.lastX
      const dy = e.clientY - panDragRef.current.lastY
      panDragRef.current = { lastX: e.clientX, lastY: e.clientY }
      // Original's own rendered size is the reference for converting a CSS-pixel drag
      // distance into a normalized fraction — an arbitrary but consistent choice (Original
      // is already the aspect-ratio reference elsewhere in this component); Optimized still
      // ends up showing the exact same normalized region, just at its own real pixel size.
      setPanCenter((c) => ({
        x: clamp01(c.x - dx / Math.max(1, originalLayout.width)),
        y: clamp01(c.y - dy / Math.max(1, originalLayout.height)),
      }))
    } else if (!zoomed) {
      moveSplitTo(e.clientX)
    }
  }

  function handleContainerPointerUp() {
    panDragRef.current = null
  }

  function handleDividerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    moveSplitTo(e.clientX)
  }

  function handleDividerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (e.buttons !== 1) return
    moveSplitTo(e.clientX)
  }

  function handleDividerKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      setSplit((s) => Math.max(0, s - 2))
      e.preventDefault()
    } else if (e.key === 'ArrowRight') {
      setSplit((s) => Math.min(100, s + 2))
      e.preventDefault()
    } else if (e.key === 'Home') {
      setSplit(0)
      e.preventDefault()
    } else if (e.key === 'End') {
      setSplit(100)
      e.preventDefault()
    }
  }

  function updateHover(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== 'frame') return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top
    setHoverPoint({
      original: viewportPointToNormalized(localX, localY, originalLayout),
      optimized: viewportPointToNormalized(localX, localY, optimizedLayout),
    })
  }

  const aspect = original.width / original.height || 1
  const percentSaved = Math.max(0, Math.round((1 - optimized.fileSizeBytes / original.fileSizeBytes) * 100))

  // Frame mode's zoom/pan viewport math — cheap pure arithmetic, no canvas redraw or worker
  // call involved. Animated mode never uses these (it keeps its original object-contain
  // layout below), so this has zero effect on animated playback.
  const effectiveZoom: ZoomLevel = mode === 'frame' ? zoom : 'fit'
  const originalScale = computeZoomScale(effectiveZoom, original.width, original.height, viewportSize.width, viewportSize.height)
  const optimizedScale = computeZoomScale(effectiveZoom, optimized.width, optimized.height, viewportSize.width, viewportSize.height)
  const originalLayout = computeViewportLayout(
    original.width,
    original.height,
    originalScale,
    panCenter.x,
    panCenter.y,
    viewportSize.width,
    viewportSize.height,
  )
  const optimizedLayout = computeViewportLayout(
    optimized.width,
    optimized.height,
    optimizedScale,
    panCenter.x,
    panCenter.y,
    viewportSize.width,
    viewportSize.height,
  )
  // `image-rendering: pixelated` (not canvas imageSmoothingEnabled) is the correct lever here
  // — nothing redraws the bitmap at a different scale via drawImage on zoom; the browser is
  // just displaying the same native-resolution canvas at a different CSS size, which is a
  // display-compositing concern, not a draw-time one.
  const pixelatedWhenZoomed = mode === 'frame' && zoom !== 'fit' ? 'pixelated' : 'auto'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={() => setMode('animated')}
          className={`rounded px-2 py-1 text-[11px] ${mode === 'animated' ? 'bg-accent text-white' : 'bg-surface-3 text-slate-200 hover:bg-surface-4'}`}
        >
          Animated
        </button>
        <button
          onClick={() => setMode('frame')}
          className={`rounded px-2 py-1 text-[11px] ${mode === 'frame' ? 'bg-accent text-white' : 'bg-surface-3 text-slate-200 hover:bg-surface-4'}`}
        >
          Frame {currentEditorFrameIndex + 1}
        </button>
        {mode === 'animated' && (
          <button
            onClick={() => setPlaying((p) => !p)}
            className="ml-auto rounded bg-surface-3 px-2 py-1 text-[11px] text-slate-200 hover:bg-surface-4"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
        )}
        {mode === 'frame' && (
          <div className="ml-auto flex items-center gap-1" role="group" aria-label="Zoom level">
            {ZOOM_LEVELS.map((z) => (
              <button
                key={z.label}
                onClick={() => setZoom(z.value)}
                aria-pressed={zoom === z.value}
                aria-label={`Zoom ${z.label}`}
                className={`rounded px-2 py-1 text-[11px] ${zoom === z.value ? 'bg-accent text-white' : 'bg-surface-3 text-slate-200 hover:bg-surface-4'}`}
              >
                {z.label}
              </button>
            ))}
            <button
              onClick={() => {
                setZoom('fit')
                setPanCenter({ x: 0.5, y: 0.5 })
              }}
              disabled={zoom === 'fit'}
              aria-label="Reset zoom and pan to fit"
              className="rounded bg-surface-3 px-2 py-1 text-[11px] text-slate-200 hover:bg-surface-4 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset View
            </button>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className={`relative w-full touch-none select-none overflow-hidden rounded bg-black ${zoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ aspectRatio: `${aspect}`, maxHeight: 320 }}
        onPointerDown={handleContainerPointerDown}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerLeave={() => setHoverPoint(null)}
      >
        {mode === 'animated' ? (
          <>
            <canvas
              ref={optimizedCanvasRef}
              data-testid="compare-optimized-canvas"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
            <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
              <canvas ref={originalCanvasRef} data-testid="compare-original-canvas" className="absolute inset-0 h-full w-full object-contain" />
            </div>
          </>
        ) : (
          <>
            <canvas
              ref={optimizedCanvasRef}
              data-testid="compare-optimized-canvas"
              className="pointer-events-none absolute"
              style={{
                left: optimizedLayout.left,
                top: optimizedLayout.top,
                width: optimizedLayout.width,
                height: optimizedLayout.height,
                imageRendering: pixelatedWhenZoomed,
              }}
            />
            <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
              <canvas
                ref={originalCanvasRef}
                data-testid="compare-original-canvas"
                className="absolute"
                style={{
                  left: originalLayout.left,
                  top: originalLayout.top,
                  width: originalLayout.width,
                  height: originalLayout.height,
                  imageRendering: pixelatedWhenZoomed,
                }}
              />
            </div>
          </>
        )}

        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          Original
        </div>
        <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          Optimized
        </div>

        {mode === 'frame' && hoverPoint && (hoverPoint.original || hoverPoint.optimized) && (
          <div
            data-testid="compare-hover-readout"
            className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
          >
            {hoverPoint.original && (
              <div>
                Original: {Math.round(hoverPoint.original.x * original.width)}, {Math.round(hoverPoint.original.y * original.height)}
              </div>
            )}
            {hoverPoint.optimized && (
              <div>
                Optimized: {Math.round(hoverPoint.optimized.x * optimized.width)}, {Math.round(hoverPoint.optimized.y * optimized.height)}
              </div>
            )}
          </div>
        )}

        <div
          role="slider"
          tabIndex={0}
          aria-label="Comparison split position"
          aria-orientation="horizontal"
          aria-valuenow={Math.round(split)}
          aria-valuemin={0}
          aria-valuemax={100}
          onPointerDown={handleDividerPointerDown}
          onPointerMove={handleDividerPointerMove}
          onKeyDown={handleDividerKeyDown}
          className="absolute top-0 h-full w-0.5 -translate-x-1/2 cursor-ew-resize bg-accent shadow-[0_0_0_1px_rgba(0,0,0,0.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          style={{ left: `${split}%` }}
        >
          {/* A dark ring + light fill keeps the handle visible against both light and dark
              image content — a plain white circle disappears against light source frames. */}
          <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" />
        </div>
      </div>

      <p className="text-xs text-slate-300">{percentSaved}% smaller</p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-surface-2 p-2" data-testid="compare-original-meta">
          <p className="text-slate-500">Original</p>
          <p className="text-slate-200" data-testid="compare-original-size">
            {formatBytes(original.fileSizeBytes)}
          </p>
          <p className="text-[10px] text-slate-500">
            {original.width}×{original.height} · {original.frameCount} frames · {formatDuration(original.durationMs)}
          </p>
        </div>
        <div className="rounded bg-surface-2 p-2" data-testid="compare-optimized-meta">
          <p className="text-slate-500">Optimized</p>
          <p className="text-emerald-400" data-testid="compare-optimized-size">
            {formatBytes(optimized.fileSizeBytes)}
          </p>
          <p className="text-[10px] text-slate-500">
            {optimized.width}×{optimized.height} · {optimized.frameCount} frames · {formatDuration(optimized.durationMs)}
          </p>
        </div>
      </div>
    </div>
  )
}
