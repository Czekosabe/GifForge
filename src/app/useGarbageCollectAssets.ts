import { useEffect } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useFrameCacheStore } from '../state/frameCacheStore'
import { getPipeline } from '../workers/client'
import type { Project } from '../types/project'

function collectReferencedAssetIds(project: Project | null): Set<string> {
  const ids = new Set<string>()
  for (const layer of project?.layers ?? []) {
    if (layer.type === 'image-overlay') ids.add(layer.assetId)
  }
  return ids
}

/**
 * Frees overlay-image bitmaps (both the main-thread copy in `frameCacheStore` and the
 * worker's registered copy) as soon as no layer in the project references them anymore.
 *
 * This covers every path that can drop a layer — explicit delete, undo/redo past the
 * point a layer existed, "Reset to original", and autosave restore replacing the whole
 * project — with one mechanism, rather than remembering to call cleanup at each call
 * site individually (the frame-count sync bug above was exactly that kind of miss).
 * Closing the project entirely is handled separately by `frameCacheStore.clear()` /
 * `terminatePipeline()` in `startNewProject`, so this is a no-op while no project is
 * loaded — it only prunes assets orphaned *within* an active project's own history.
 */
export function useGarbageCollectAssets() {
  useEffect(() => {
    let lastIds = collectReferencedAssetIds(useProjectStore.getState().project)

    const unsubscribe = useProjectStore.subscribe((state) => {
      if (!state.project) {
        lastIds = new Set()
        return
      }
      const currentIds = collectReferencedAssetIds(state.project)
      for (const id of lastIds) {
        if (!currentIds.has(id)) {
          useFrameCacheStore.getState().removeAssetBitmap(id)
          getPipeline().removeAsset(id).catch(() => {})
        }
      }
      lastIds = currentIds
    })

    return unsubscribe
  }, [])
}
