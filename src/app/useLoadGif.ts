import { useCallback } from 'react'
import { getPipeline, proxyProgress, terminatePipeline } from '../workers/client'
import { useProjectStore, createProjectFromMetadata } from '../state/projectStore'
import { useFrameCacheStore } from '../state/frameCacheStore'
import { useEditorStore } from '../state/editorStore'
import { usePlaybackStore } from '../state/playbackStore'
import { useJobStore } from '../state/jobStore'
import { clearProjectAutosave } from '../storage/db'

const PREVIEW_MAX_DIMENSION = 900
const PERFORMANCE_MODE_PREVIEW_MAX_DIMENSION = 420

export class GifValidationError extends Error {}

function validateFile(file: File): void {
  const validExtension = /\.gif$/i.test(file.name)
  const validMime = file.type === '' || file.type === 'image/gif'
  if (!validExtension || !validMime) {
    throw new GifValidationError('Please choose a .gif file.')
  }
  if (file.size === 0) {
    throw new GifValidationError('This file is empty.')
  }
  const MAX_UPLOAD_BYTES = 150 * 1024 * 1024
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new GifValidationError(
      `This file is ${(file.size / 1024 / 1024).toFixed(0)}MB, which is larger than GifForge's 150MB upload limit.`,
    )
  }
}

export function useLoadGif() {
  const startJob = useJobStore((s) => s.startJob)
  const updateJob = useJobStore((s) => s.updateJob)
  const completeJob = useJobStore((s) => s.completeJob)
  const failJob = useJobStore((s) => s.failJob)

  const loadFile = useCallback(async (file: File) => {
    const jobId = startJob('load', 'Reading file…')
    try {
      validateFile(file)

      const buffer = await file.arrayBuffer()
      updateJob(jobId, { message: 'Parsing GIF…' })

      const pipeline = getPipeline()
      const result = await pipeline.loadGif(
        buffer,
        file.name,
        proxyProgress((fraction, message) => updateJob(jobId, { progress: fraction, message })),
      )

      if (result.suggestPerformanceMode) {
        useEditorStore.getState().suggestPerformanceMode()
      }

      updateJob(jobId, { message: 'Generating preview…', progress: null })
      const maxDim = result.suggestPerformanceMode ? PERFORMANCE_MODE_PREVIEW_MAX_DIMENSION : PREVIEW_MAX_DIMENSION
      const previewBitmaps = await pipeline.getPreviewBitmaps(maxDim)

      const project = createProjectFromMetadata(result.metadata)
      // loadProject's subscription (useSyncPlaybackFrameCount) keeps playbackStore.frameCount
      // in sync automatically; only the explicit "start at frame 0" reset is done here.
      useProjectStore.getState().loadProject(project, file)
      useFrameCacheStore.getState().setPreviewBitmaps(previewBitmaps, result.frameDelaysMs)
      usePlaybackStore.getState().setCurrentFrameIndex(0)
      useEditorStore.getState().setActiveTool('crop')

      completeJob(jobId)
    } catch (err) {
      failJob(jobId, err instanceof Error ? err.message : 'Failed to load GIF.')
      throw err
    }
  }, [startJob, updateJob, completeJob, failJob])

  return { loadFile }
}

/**
 * Closes the current project and returns to the upload screen. Terminates the worker
 * (the simplest way to guarantee its decoded frames + registered overlay-asset bitmaps
 * are actually freed, not just dereferenced) and clears every other cache that held
 * bitmaps for the closed project, so repeated upload/edit/export cycles don't leak
 * memory. The next upload lazily spins up a fresh worker via `getPipeline()`.
 */
export async function startNewProject(): Promise<void> {
  usePlaybackStore.getState().pause()
  terminatePipeline()
  useFrameCacheStore.getState().clear()
  useProjectStore.getState().closeProject() // triggers useSyncPlaybackFrameCount to zero frameCount
  useEditorStore.getState().reset()
  usePlaybackStore.getState().setCurrentFrameIndex(0)
  await clearProjectAutosave().catch(() => {})
}
