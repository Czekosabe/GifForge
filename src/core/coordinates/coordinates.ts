/**
 * Single source of truth for converting between IMAGE SPACE (source pixel units,
 * what's stored in project state) and VIEWPORT SPACE (CSS pixels of the on-screen
 * editor canvas, which changes with zoom/fit-to-screen).
 */

export interface Viewport {
  /** CSS pixel size of the visible stage. */
  stageWidth: number
  stageHeight: number
  /** Source image dimensions in image-space pixels. */
  imageWidth: number
  imageHeight: number
  /** User zoom multiplier on top of the fit-to-screen scale. 1 = fit-to-screen. */
  zoom: number
  /** Additional pan offset in CSS pixels, applied after centering. */
  panX: number
  panY: number
}

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The scale factor that maps one image-space pixel to one viewport (CSS) pixel. */
export function getFitScale(viewport: Viewport): number {
  if (viewport.imageWidth <= 0 || viewport.imageHeight <= 0) return 1
  const fitScale = Math.min(
    viewport.stageWidth / viewport.imageWidth,
    viewport.stageHeight / viewport.imageHeight,
  )
  return (Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1) * viewport.zoom
}

/** Top-left offset (in CSS px) where the image origin (0,0) lands on the stage. */
export function getImageOrigin(viewport: Viewport): Point {
  const scale = getFitScale(viewport)
  const renderedWidth = viewport.imageWidth * scale
  const renderedHeight = viewport.imageHeight * scale
  return {
    x: (viewport.stageWidth - renderedWidth) / 2 + viewport.panX,
    y: (viewport.stageHeight - renderedHeight) / 2 + viewport.panY,
  }
}

export function imageToViewportPoint(point: Point, viewport: Viewport): Point {
  const scale = getFitScale(viewport)
  const origin = getImageOrigin(viewport)
  return {
    x: origin.x + point.x * scale,
    y: origin.y + point.y * scale,
  }
}

export function viewportToImagePoint(point: Point, viewport: Viewport): Point {
  const scale = getFitScale(viewport)
  const origin = getImageOrigin(viewport)
  return {
    x: (point.x - origin.x) / scale,
    y: (point.y - origin.y) / scale,
  }
}

export function imageToViewportLength(length: number, viewport: Viewport): number {
  return length * getFitScale(viewport)
}

export function viewportToImageLength(length: number, viewport: Viewport): number {
  const scale = getFitScale(viewport)
  return scale === 0 ? 0 : length / scale
}

export function imageToViewportRect(rect: Rect, viewport: Viewport): Rect {
  const topLeft = imageToViewportPoint({ x: rect.x, y: rect.y }, viewport)
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: imageToViewportLength(rect.width, viewport),
    height: imageToViewportLength(rect.height, viewport),
  }
}

export function viewportToImageRect(rect: Rect, viewport: Viewport): Rect {
  const topLeft = viewportToImagePoint({ x: rect.x, y: rect.y }, viewport)
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: viewportToImageLength(rect.width, viewport),
    height: viewportToImageLength(rect.height, viewport),
  }
}

export function clampRectToBounds(rect: Rect, bounds: Rect): Rect {
  const width = Math.min(rect.width, bounds.width)
  const height = Math.min(rect.height, bounds.height)
  const x = Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.width - width)
  const y = Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.height - height)
  return { x, y, width, height }
}
