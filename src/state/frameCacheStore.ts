import { create } from 'zustand'

/**
 * Holds decoded-frame bitmaps and lazily-generated thumbnails outside of `projectStore`.
 * These are populated once per load/scroll event (not per-pointermove or per-playback-tick),
 * so keeping them in a store is safe — the goal is simply to keep large binary data out of
 * the history-tracked, JSON-serializable `Project` model.
 */
interface FrameCacheState {
  previewBitmaps: ImageBitmap[]
  /** Original per-frame delay in ms, indexed by ORIGINAL source frame index (not timeline position). */
  frameDelaysMs: number[]
  thumbnails: Map<number, ImageBitmap>
  assetBitmaps: Map<string, ImageBitmap>

  setPreviewBitmaps: (bitmaps: ImageBitmap[], delaysMs: number[]) => void
  setThumbnail: (index: number, bitmap: ImageBitmap) => void
  setAssetBitmap: (id: string, bitmap: ImageBitmap) => void
  removeAssetBitmap: (id: string) => void
  clear: () => void
}

function closeAll(bitmaps: Iterable<ImageBitmap>): void {
  for (const bmp of bitmaps) bmp.close()
}

export const useFrameCacheStore = create<FrameCacheState>((set, get) => ({
  previewBitmaps: [],
  frameDelaysMs: [],
  thumbnails: new Map(),
  assetBitmaps: new Map(),

  setPreviewBitmaps: (bitmaps, delaysMs) => {
    closeAll(get().previewBitmaps)
    set({ previewBitmaps: bitmaps, frameDelaysMs: delaysMs })
  },

  setThumbnail: (index, bitmap) => {
    const next = new Map(get().thumbnails)
    next.get(index)?.close()
    next.set(index, bitmap)
    set({ thumbnails: next })
  },

  setAssetBitmap: (id, bitmap) => {
    const next = new Map(get().assetBitmaps)
    next.get(id)?.close()
    next.set(id, bitmap)
    set({ assetBitmaps: next })
  },

  removeAssetBitmap: (id) => {
    const next = new Map(get().assetBitmaps)
    next.get(id)?.close()
    next.delete(id)
    set({ assetBitmaps: next })
  },

  clear: () => {
    closeAll(get().previewBitmaps)
    closeAll(get().thumbnails.values())
    closeAll(get().assetBitmaps.values())
    set({ previewBitmaps: [], frameDelaysMs: [], thumbnails: new Map(), assetBitmaps: new Map() })
  },
}))
