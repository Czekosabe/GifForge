import { useEffect, useRef } from 'react'
import type Konva from 'konva'
import { usePlaybackStore } from '../state/playbackStore'
import { useFrameCacheStore } from '../state/frameCacheStore'
import { useProjectStore } from '../state/projectStore'
import { applySpeedToDelay } from '../core/edit/frameOrder'

/**
 * Imperative rAF-driven playback loop. Deliberately does NOT run through React state
 * for the per-frame image swap — it mutates the Konva image node directly and only
 * touches the Zustand playback store when the logical frame index actually changes
 * (bounded by the GIF's own frame rate, not the display refresh rate).
 */
export function usePlaybackController(imageNodeRef: React.RefObject<Konva.Image | null>) {
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)
  const accumulatorRef = useRef<number>(0)

  useEffect(() => {
    function drawFrame(timelineIndex: number) {
      const { previewBitmaps, frameDelaysMs } = useFrameCacheStore.getState()
      const project = useProjectStore.getState().project
      if (!project) return
      const originalIndex = project.edits.frameOrder[timelineIndex]
      if (originalIndex === undefined) return
      const bitmap = previewBitmaps[originalIndex]
      const node = imageNodeRef.current
      if (bitmap && node) {
        node.image(bitmap)
        node.getLayer()?.batchDraw()
      }
      return frameDelaysMs[originalIndex] ?? 100
    }

    function tick(now: number) {
      const { isPlaying, currentFrameIndex, frameCount, setCurrentFrameIndex } = usePlaybackStore.getState()
      if (!isPlaying || frameCount === 0) {
        rafRef.current = null
        return
      }

      if (lastTickRef.current === 0) lastTickRef.current = now
      const elapsed = now - lastTickRef.current
      lastTickRef.current = now
      accumulatorRef.current += elapsed

      const project = useProjectStore.getState().project
      const speedFactor = project?.edits.speed.factor ?? 1
      const { frameDelaysMs } = useFrameCacheStore.getState()
      const originalIndex = project?.edits.frameOrder[currentFrameIndex]
      const rawDelay = originalIndex !== undefined ? frameDelaysMs[originalIndex] ?? 100 : 100
      const targetDelay = applySpeedToDelay(rawDelay, speedFactor)

      if (accumulatorRef.current >= targetDelay) {
        accumulatorRef.current = 0
        const nextIndex = (currentFrameIndex + 1) % frameCount
        setCurrentFrameIndex(nextIndex)
        drawFrame(nextIndex)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    const unsubscribe = usePlaybackStore.subscribe((state, prev) => {
      if (state.isPlaying && !prev.isPlaying) {
        lastTickRef.current = 0
        accumulatorRef.current = 0
        if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick)
      }
      if (!state.isPlaying && prev.isPlaying && rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (!state.isPlaying && state.currentFrameIndex !== prev.currentFrameIndex) {
        drawFrame(state.currentFrameIndex)
      }
    })

    if (usePlaybackStore.getState().isPlaying && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick)
    }
    drawFrame(usePlaybackStore.getState().currentFrameIndex)

    return () => {
      unsubscribe()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
