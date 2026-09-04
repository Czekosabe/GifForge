/**
 * Pure geometry for the Before/After Frame-mode zoom/pan inspector. Kept separate from the
 * component and unit-tested directly because it's easy to get transform math subtly wrong,
 * and because Original/Optimized can have different pixel dimensions (optimization may
 * reduce resolution) — the same normalized pan center must map correctly onto both.
 */

export type ZoomLevel = 'fit' | 1 | 2 | 4 | 8

export interface ViewportLayout {
  /** CSS pixels, relative to the viewport's own top-left. */
  left: number
  top: number
  width: number
  height: number
}

/**
 * The CSS-pixels-per-source-pixel scale for displaying a `sourceWidth`x`sourceHeight` image
 * in a `viewportWidth`x`viewportHeight` box. 'fit' computes an aspect-preserving fit (like
 * `object-fit: contain`); 1/2/4/8 are literal multiples, so zoom level 1 genuinely renders
 * one source pixel as one CSS pixel — not "fit, then treat that as the 100% baseline".
 */
export function computeZoomScale(
  zoomLevel: ZoomLevel,
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (zoomLevel !== 'fit') return zoomLevel
  if (sourceWidth <= 0 || sourceHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return 1
  return Math.min(viewportWidth / sourceWidth, viewportHeight / sourceHeight)
}

/**
 * Where to position/size a `scale`d source image within the viewport so that the normalized
 * point (`centerX`, `centerY`, each in [0,1]) is centered — clamped so the image can never be
 * panned entirely out of view, and simply centered (no panning possible) whenever it's
 * smaller than the viewport on that axis.
 */
export function computeViewportLayout(
  sourceWidth: number,
  sourceHeight: number,
  scale: number,
  centerX: number,
  centerY: number,
  viewportWidth: number,
  viewportHeight: number,
): ViewportLayout {
  const dispW = sourceWidth * scale
  const dispH = sourceHeight * scale

  const left =
    dispW <= viewportWidth
      ? (viewportWidth - dispW) / 2
      : Math.min(0, Math.max(viewportWidth - dispW, viewportWidth / 2 - centerX * dispW))
  const top =
    dispH <= viewportHeight
      ? (viewportHeight - dispH) / 2
      : Math.min(0, Math.max(viewportHeight - dispH, viewportHeight / 2 - centerY * dispH))

  return { left, top, width: dispW, height: dispH }
}

/** Inverse of `computeViewportLayout`: given a pointer position in viewport-local CSS pixels
 * and that layout, returns the normalized [0,1] source point, or null if outside the
 * rendered image (e.g. in the letterboxed margin at Fit). */
export function viewportPointToNormalized(
  pointerX: number,
  pointerY: number,
  layout: ViewportLayout,
): { x: number; y: number } | null {
  if (layout.width <= 0 || layout.height <= 0) return null
  const x = (pointerX - layout.left) / layout.width
  const y = (pointerY - layout.top) / layout.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  return { x, y }
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
