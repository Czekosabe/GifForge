import type { Rect } from '../coordinates/coordinates'

export type ResizeAspectMode = 'free' | 'lock' | 'fit-width' | 'fit-height'

export function clampCropToBounds(crop: Rect, sourceWidth: number, sourceHeight: number): Rect {
  const width = Math.max(1, Math.min(Math.round(crop.width), sourceWidth))
  const height = Math.max(1, Math.min(Math.round(crop.height), sourceHeight))
  const x = Math.max(0, Math.min(Math.round(crop.x), sourceWidth - width))
  const y = Math.max(0, Math.min(Math.round(crop.y), sourceHeight - height))
  return { x, y, width, height }
}

export function centerCrop(cropWidth: number, cropHeight: number, sourceWidth: number, sourceHeight: number): Rect {
  return clampCropToBounds(
    { x: (sourceWidth - cropWidth) / 2, y: (sourceHeight - cropHeight) / 2, width: cropWidth, height: cropHeight },
    sourceWidth,
    sourceHeight,
  )
}

/** Named aspect ratios exposed in the crop tool UI. Value is width/height. */
export const ASPECT_RATIO_PRESETS: Record<string, number | null> = {
  free: null,
  original: null, // resolved by caller using source dimensions
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '21:9': 21 / 9,
}

/** Resizes a rect to match a target aspect ratio, keeping its top-left corner fixed and area roughly stable. */
export function applyAspectRatio(crop: Rect, ratio: number, sourceWidth: number, sourceHeight: number): Rect {
  let width = crop.width
  let height = width / ratio
  if (height > sourceHeight) {
    height = sourceHeight
    width = height * ratio
  }
  if (width > sourceWidth) {
    width = sourceWidth
    height = width / ratio
  }
  return clampCropToBounds({ x: crop.x, y: crop.y, width, height }, sourceWidth, sourceHeight)
}

export interface PixelResizeInput {
  sourceWidth: number
  sourceHeight: number
  targetWidth: number
  targetHeight: number
  mode: ResizeAspectMode
}

export function computePixelResize(input: PixelResizeInput): { width: number; height: number } {
  const { sourceWidth, sourceHeight, mode } = input
  const ratio = sourceWidth / sourceHeight
  let { targetWidth, targetHeight } = input

  if (mode === 'lock') {
    targetHeight = Math.round(targetWidth / ratio)
  } else if (mode === 'fit-width') {
    targetHeight = Math.round(targetWidth / ratio)
  } else if (mode === 'fit-height') {
    targetWidth = Math.round(targetHeight * ratio)
  }

  return {
    width: Math.max(1, Math.round(targetWidth)),
    height: Math.max(1, Math.round(targetHeight)),
  }
}

export function computePercentResize(
  sourceWidth: number,
  sourceHeight: number,
  percent: number,
): { width: number; height: number } {
  const factor = Math.max(1, percent) / 100
  return {
    width: Math.max(1, Math.round(sourceWidth * factor)),
    height: Math.max(1, Math.round(sourceHeight * factor)),
  }
}

/** Bounding box (in source pixel units) that fully contains a WxH rect rotated by angleDeg around its center. */
export function computeRotatedBounds(width: number, height: number, angleDeg: number): { width: number; height: number } {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  return {
    width: Math.round(width * cos + height * sin),
    height: Math.round(width * sin + height * cos),
  }
}
