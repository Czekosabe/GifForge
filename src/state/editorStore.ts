import { create } from 'zustand'

export type ToolId =
  | 'upload'
  | 'crop'
  | 'frames'
  | 'text'
  | 'resize'
  | 'speed'
  | 'reverse'
  | 'rotate'
  | 'overlay'
  | 'optimize'
  | 'export'
  | 'history'

interface EditorState {
  activeTool: ToolId
  advancedMode: boolean
  selectedLayerId: string | null
  selectedFrames: number[]
  performanceMode: boolean
  performanceModeAutoSuggested: boolean
  zoom: number
  panX: number
  panY: number
  showComparison: boolean

  setActiveTool: (tool: ToolId) => void
  setAdvancedMode: (advanced: boolean) => void
  selectLayer: (id: string | null) => void
  setSelectedFrames: (frames: number[]) => void
  setPerformanceMode: (enabled: boolean) => void
  suggestPerformanceMode: () => void
  setZoom: (zoom: number) => void
  setPan: (x: number, y: number) => void
  resetView: () => void
  setShowComparison: (show: boolean) => void
  /** Full reset for starting a new project (closing the current one). */
  reset: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  activeTool: 'upload',
  advancedMode: false,
  selectedLayerId: null,
  selectedFrames: [],
  performanceMode: false,
  performanceModeAutoSuggested: false,
  zoom: 1,
  panX: 0,
  panY: 0,
  showComparison: false,

  setActiveTool: (tool) => set({ activeTool: tool }),
  setAdvancedMode: (advancedMode) => set({ advancedMode }),
  selectLayer: (selectedLayerId) => set({ selectedLayerId }),
  setSelectedFrames: (selectedFrames) => set({ selectedFrames }),
  setPerformanceMode: (performanceMode) => set({ performanceMode }),
  suggestPerformanceMode: () => set({ performanceModeAutoSuggested: true, performanceMode: true }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(8, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),
  setShowComparison: (showComparison) => set({ showComparison }),
  reset: () =>
    set({
      activeTool: 'upload',
      advancedMode: false,
      selectedLayerId: null,
      selectedFrames: [],
      performanceMode: false,
      performanceModeAutoSuggested: false,
      zoom: 1,
      panX: 0,
      panY: 0,
      showComparison: false,
    }),
}))
