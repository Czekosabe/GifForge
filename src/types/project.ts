/** All coordinates in this file are in IMAGE SPACE (source pixel units), never viewport/CSS pixels. */

export interface CropRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface ResizeSettings {
  width: number
  height: number
}

export type RotateCanvasMode = 'auto-fit' | 'keep-original'

export interface RotateSettings {
  angleDeg: number
  canvasMode: RotateCanvasMode
}

export interface SpeedSettings {
  /** Multiplier applied to every frame's delay. 1 = unchanged. */
  factor: number
}

export type FrameRangeSpec = string

export interface TextShadow {
  color: string
  blur: number
  offsetX: number
  offsetY: number
}

export type TextAlign = 'left' | 'center' | 'right'

interface LayerBase {
  id: string
  name: string
  visible: boolean
  locked: boolean
  /** Frame-range syntax, e.g. "1-20,25,30-40". Empty string means "all frames". */
  frameRange: FrameRangeSpec
  x: number
  y: number
  rotationDeg: number
  opacity: number
}

export interface TextLayer extends LayerBase {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  width: number
  align: TextAlign
  fillColor: string
  strokeColor: string
  strokeWidth: number
  shadow: TextShadow | null
}

export interface ImageOverlayLayer extends LayerBase {
  type: 'image-overlay'
  /** Reference into the project's asset store (Dexie), not a raw data URL, to avoid bloating project JSON. */
  assetId: string
  width: number
  height: number
}

export type Layer = TextLayer | ImageOverlayLayer

export type LoopMode = 'forever' | 'none' | 'custom'

export interface ExportSettings {
  loopMode: LoopMode
  customLoopCount: number
  frameRange: FrameRangeSpec
  quality: 'best' | 'balanced' | 'small'
  maxColors: number
  dither: boolean
  scalePercent: number
}

export interface OptimizationSettings {
  preset: 'light' | 'balanced' | 'aggressive' | 'target-size' | 'custom'
  maxColors: number
  dither: boolean
  ditherStrength: number
  lossy: number
  frameSkip: number
  scalePercent: number
  targetSizeBytes: number | null
  keepDimensions: boolean
  allowFpsReduction: boolean
  allowFrameDropping: boolean
  allowResolutionReduction: boolean
}

/** The full non-destructive edit stack applied on top of the original decoded source. */
export interface EditOperations {
  /** Which original frame indices survive, in order. Supports delete/keep/reverse via reordering. */
  frameOrder: number[]
  crop: CropRegion | null
  resize: ResizeSettings | null
  rotate: RotateSettings | null
  speed: SpeedSettings
}

export interface ProjectMetadata {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  sourceWidth: number
  sourceHeight: number
  sourceFrameCount: number
  sourceFileName: string
  sourceFileSizeBytes: number
  sourceLoopCount: number
}

export interface Project {
  metadata: ProjectMetadata
  edits: EditOperations
  /** Index 0 = frontmost / top of the Layers panel. Renderers must draw in reverse (bottom-to-top). */
  layers: Layer[]
  exportSettings: ExportSettings
  optimizationSettings: OptimizationSettings
}
