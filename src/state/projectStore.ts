import { create } from 'zustand'
import { nanoid } from '../utils/nanoid'
import { createInitialFrameOrder } from '../core/edit/frameOrder'
import type { GifMetadata } from '../types/gif'
import type {
  CropRegion,
  ExportSettings,
  Layer,
  OptimizationSettings,
  Project,
  ResizeSettings,
  RotateSettings,
} from '../types/project'

const MAX_HISTORY_DEPTH = 50

function defaultExportSettings(): ExportSettings {
  return {
    loopMode: 'forever',
    customLoopCount: 0,
    frameRange: '',
    quality: 'balanced',
    maxColors: 256,
    dither: true,
    scalePercent: 100,
  }
}

function defaultOptimizationSettings(): OptimizationSettings {
  return {
    preset: 'balanced',
    maxColors: 128,
    dither: true,
    ditherStrength: 0.8,
    lossy: 0,
    frameSkip: 1,
    scalePercent: 100,
    targetSizeBytes: null,
    keepDimensions: true,
    allowFpsReduction: false,
    allowFrameDropping: false,
    allowResolutionReduction: false,
  }
}

export function createProjectFromMetadata(metadata: GifMetadata): Project {
  const now = Date.now()
  return {
    metadata: {
      id: nanoid(),
      name: metadata.fileName.replace(/\.gif$/i, ''),
      createdAt: now,
      updatedAt: now,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      sourceFrameCount: metadata.frameCount,
      sourceFileName: metadata.fileName,
      sourceFileSizeBytes: metadata.fileSizeBytes,
      sourceLoopCount: metadata.loopCount,
    },
    edits: {
      frameOrder: createInitialFrameOrder(metadata.frameCount),
      crop: null,
      resize: null,
      rotate: null,
      speed: { factor: 1 },
    },
    layers: [],
    exportSettings: defaultExportSettings(),
    optimizationSettings: defaultOptimizationSettings(),
  }
}

interface ProjectStoreState {
  project: Project | null
  sourceBlob: Blob | null
  past: Project[]
  future: Project[]
  dragSnapshot: Project | null

  canUndo: boolean
  canRedo: boolean

  loadProject: (project: Project, sourceBlob: Blob) => void
  resetToOriginal: () => void
  closeProject: () => void

  commit: (mutate: (draft: Project) => Project) => void
  beginInteraction: () => void
  updateDuringInteraction: (mutate: (draft: Project) => Project) => void
  endInteraction: () => void
  cancelInteraction: () => void

  undo: () => void
  redo: () => void

  // Convenience actions (each is one committed history entry unless noted).
  setCrop: (crop: CropRegion | null) => void
  setResize: (resize: ResizeSettings | null) => void
  setRotate: (rotate: RotateSettings | null) => void
  setSpeed: (factor: number) => void
  reverseFrames: () => void
  deleteFrames: (selected1Based: number[]) => void
  keepFrames: (selected1Based: number[]) => void
  addLayer: (layer: Layer) => void
  updateLayer: (id: string, patch: Partial<Layer>) => void
  removeLayer: (id: string) => void
  reorderLayer: (id: string, newIndex: number) => void
  setExportSettings: (settings: Partial<ExportSettings>) => void
  setOptimizationSettings: (settings: Partial<OptimizationSettings>) => void
}

let originalProject: Project | null = null

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  project: null,
  sourceBlob: null,
  past: [],
  future: [],
  dragSnapshot: null,
  canUndo: false,
  canRedo: false,

  loadProject: (project, sourceBlob) => {
    originalProject = project
    set({ project, sourceBlob, past: [], future: [], dragSnapshot: null, canUndo: false, canRedo: false })
  },

  resetToOriginal: () => {
    if (!originalProject) return
    const { project } = get()
    if (!project) return
    const past = [...get().past, project].slice(-MAX_HISTORY_DEPTH)
    set({ project: { ...originalProject, metadata: { ...project.metadata, updatedAt: Date.now() } }, past, future: [], canUndo: true, canRedo: false })
  },

  closeProject: () => {
    originalProject = null
    set({ project: null, sourceBlob: null, past: [], future: [], dragSnapshot: null, canUndo: false, canRedo: false })
  },

  commit: (mutate) => {
    const { project, past } = get()
    if (!project) return
    const next = mutate(structuredClone(project))
    next.metadata.updatedAt = Date.now()
    const newPast = [...past, project].slice(-MAX_HISTORY_DEPTH)
    set({ project: next, past: newPast, future: [], canUndo: true, canRedo: false })
  },

  beginInteraction: () => {
    const { project, dragSnapshot } = get()
    if (dragSnapshot || !project) return
    set({ dragSnapshot: project })
  },

  updateDuringInteraction: (mutate) => {
    const { project } = get()
    if (!project) return
    set({ project: mutate(structuredClone(project)) })
  },

  endInteraction: () => {
    const { dragSnapshot, project, past } = get()
    if (!dragSnapshot || !project) {
      set({ dragSnapshot: null })
      return
    }
    if (JSON.stringify(dragSnapshot) === JSON.stringify(project)) {
      set({ dragSnapshot: null })
      return
    }
    const newPast = [...past, dragSnapshot].slice(-MAX_HISTORY_DEPTH)
    set({ dragSnapshot: null, past: newPast, future: [], canUndo: true, canRedo: false })
  },

  cancelInteraction: () => {
    const { dragSnapshot } = get()
    if (dragSnapshot) set({ project: dragSnapshot, dragSnapshot: null })
  },

  undo: () => {
    const { past, project, future } = get()
    if (past.length === 0 || !project) return
    const previous = past[past.length - 1]!
    set({
      project: previous,
      past: past.slice(0, -1),
      future: [project, ...future],
      canUndo: past.length - 1 > 0,
      canRedo: true,
    })
  },

  redo: () => {
    const { future, project, past } = get()
    if (future.length === 0 || !project) return
    const next = future[0]!
    set({
      project: next,
      future: future.slice(1),
      past: [...past, project].slice(-MAX_HISTORY_DEPTH),
      canUndo: true,
      canRedo: future.length - 1 > 0,
    })
  },

  setCrop: (crop) => get().commit((p) => ({ ...p, edits: { ...p.edits, crop } })),
  setResize: (resize) => get().commit((p) => ({ ...p, edits: { ...p.edits, resize } })),
  setRotate: (rotate) => get().commit((p) => ({ ...p, edits: { ...p.edits, rotate } })),
  setSpeed: (factor) => get().commit((p) => ({ ...p, edits: { ...p.edits, speed: { factor } } })),

  reverseFrames: () =>
    get().commit((p) => ({ ...p, edits: { ...p.edits, frameOrder: [...p.edits.frameOrder].reverse() } })),

  deleteFrames: (selected1Based) => {
    const toDelete = new Set(selected1Based)
    get().commit((p) => ({
      ...p,
      edits: { ...p.edits, frameOrder: p.edits.frameOrder.filter((_, i) => !toDelete.has(i + 1)) },
    }))
  },

  keepFrames: (selected1Based) => {
    const toKeep = new Set(selected1Based)
    get().commit((p) => ({
      ...p,
      edits: { ...p.edits, frameOrder: p.edits.frameOrder.filter((_, i) => toKeep.has(i + 1)) },
    }))
  },

  // New layers go to the front (index 0 = frontmost, top of panel) so they appear on top
  // of everything already on the canvas, matching what a user adding a new layer expects.
  addLayer: (layer) => get().commit((p) => ({ ...p, layers: [layer, ...p.layers] })),

  updateLayer: (id, patch) =>
    get().commit((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
    })),

  removeLayer: (id) => get().commit((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) })),

  reorderLayer: (id, newIndex) =>
    get().commit((p) => {
      const layers = [...p.layers]
      const currentIndex = layers.findIndex((l) => l.id === id)
      if (currentIndex === -1) return p
      const [item] = layers.splice(currentIndex, 1)
      layers.splice(Math.max(0, Math.min(newIndex, layers.length)), 0, item!)
      return { ...p, layers }
    }),

  setExportSettings: (settings) =>
    get().commit((p) => ({ ...p, exportSettings: { ...p.exportSettings, ...settings } })),

  setOptimizationSettings: (settings) =>
    get().commit((p) => ({ ...p, optimizationSettings: { ...p.optimizationSettings, ...settings } })),
}))
