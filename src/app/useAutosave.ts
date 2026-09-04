import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useFrameCacheStore } from '../state/frameCacheStore'
import { usePlaybackStore } from '../state/playbackStore'
import { useEditorStore } from '../state/editorStore'
import { getPipeline } from '../workers/client'
import {
  clearProjectAutosave,
  loadAssets,
  loadProjectAutosave,
  saveProjectAutosave,
  StorageError,
  type StoredProject,
} from '../storage/db'

const AUTOSAVE_DEBOUNCE_MS = 1500

/** Debounced autosave: writes the current project + source blob to IndexedDB after edits settle. */
export function useAutosave() {
  const project = useProjectStore((s) => s.project)
  const sourceBlob = useProjectStore((s) => s.sourceBlob)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!project || !sourceBlob) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      saveProjectAutosave(project, sourceBlob).catch((err) => {
        if (err instanceof StorageError) console.warn(err.message)
      })
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [project, sourceBlob])
}

/** Checks for a previously autosaved project on mount, offering the user a restore prompt. */
export function useAutosaveRestore() {
  const [pending, setPending] = useState<StoredProject | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    loadProjectAutosave()
      .then((stored) => {
        if (stored) setPending(stored)
      })
      .catch(() => {})
  }, [])

  async function restore() {
    if (!pending) return
    setRestoring(true)
    try {
      const buffer = await pending.sourceBlob.arrayBuffer()
      const pipeline = getPipeline()
      const result = await pipeline.loadGif(buffer, pending.project.metadata.sourceFileName)
      const previewBitmaps = await pipeline.getPreviewBitmaps(900)
      useFrameCacheStore.getState().setPreviewBitmaps(previewBitmaps, result.frameDelaysMs)

      const assets = await loadAssets()
      for (const asset of assets) {
        const bitmap = await createImageBitmap(asset.blob)
        useFrameCacheStore.getState().setAssetBitmap(asset.id, bitmap)
        await pipeline.registerAsset(asset.id, bitmap)
      }

      // useSyncPlaybackFrameCount's subscription keeps playbackStore.frameCount in sync.
      useProjectStore.getState().loadProject(pending.project, pending.sourceBlob)
      usePlaybackStore.getState().setCurrentFrameIndex(0)
      useEditorStore.getState().setActiveTool('crop')
    } finally {
      setRestoring(false)
      setPending(null)
    }
  }

  function discard() {
    clearProjectAutosave().catch(() => {})
    setPending(null)
  }

  return { pending, restoring, restore, discard }
}
