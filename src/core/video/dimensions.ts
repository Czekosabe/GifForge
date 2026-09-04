export interface PaddedDimensions {
  width: number
  height: number
  padded: boolean
}

/**
 * Many video codecs (notably H.264/AVC) require even width and height. Rather than rescale
 * (which would distort the image or require re-deriving crop/resize math), pad by at most 1px
 * on the right/bottom — the image itself is drawn at its real size, unscaled, at (0, 0); the
 * padded row/column is simply extra canvas filled with the background color. `padded` tells
 * the caller whether this happened, so the UI can honestly report a dimension change instead
 * of silently exporting a slightly different size than requested.
 */
export function computeEvenDimensions(width: number, height: number): PaddedDimensions {
  const evenWidth = width % 2 === 0 ? width : width + 1
  const evenHeight = height % 2 === 0 ? height : height + 1
  return { width: evenWidth, height: evenHeight, padded: evenWidth !== width || evenHeight !== height }
}

/**
 * The exact scale-then-pad dimensions a video export will actually encode at — used by the
 * codec-support probe so it checks the real target size instead of the pre-scale source size.
 * Checking the unscaled size meant a source large enough to exceed a codec's resolution limit
 * could show as "unavailable" and disable Export even when the user's chosen scale-down would
 * have brought it comfortably within range.
 */
export function computeScaledPaddedDimensions(width: number, height: number, scalePercent: number): PaddedDimensions {
  const scale = scalePercent / 100
  const scaledWidth = Math.max(1, Math.round(width * scale))
  const scaledHeight = Math.max(1, Math.round(height * scale))
  return computeEvenDimensions(scaledWidth, scaledHeight)
}
