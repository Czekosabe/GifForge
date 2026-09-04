/**
 * Composites raw per-frame GIF patches (as decoded by gifuct-js) into full-canvas
 * RGBA frames, correctly honoring GIF disposal methods:
 *
 *   0 / 1 — "do not dispose" / "combine": leave the canvas as-is for the next frame.
 *   2     — "restore to background": after drawing, clear this frame's own rectangle
 *           to transparent before the next frame is drawn on top.
 *   3     — "restore to previous": after drawing, restore this frame's rectangle to
 *           whatever the canvas looked like immediately before this frame was drawn.
 *
 * Pixels with alpha=0 in a frame's patch are transparent and must NOT overwrite the
 * canvas beneath them — this is how partial frame updates work.
 */

export interface RawFramePatch {
  /** RGBA pixel data for just this frame's sub-rectangle, width*height*4 bytes. */
  patch: Uint8ClampedArray
  dims: { left: number; top: number; width: number; height: number }
  disposalType: number
  delay: number
}

export interface CompositeResult {
  rgba: Uint8ClampedArray
  delayMs: number
}

export function compositeGifFrames(
  screenWidth: number,
  screenHeight: number,
  frames: RawFramePatch[],
): CompositeResult[] {
  const canvas = new Uint8ClampedArray(screenWidth * screenHeight * 4)
  const results: CompositeResult[] = []

  for (const frame of frames) {
    const { left, top, width, height } = frame.dims

    let savedRegion: Uint8ClampedArray | null = null
    if (frame.disposalType === 3) {
      savedRegion = new Uint8ClampedArray(canvas)
    }

    drawPatch(canvas, screenWidth, frame.patch, left, top, width, height)

    results.push({
      rgba: new Uint8ClampedArray(canvas),
      // NOTE: `frame.delay` here is already in milliseconds — gifuct-js converts from
      // the GIF spec's raw 1/100s units itself (see decompressFrame in gifuct-js),
      // including its own floor for a zero/missing delay. Re-scaling here would double
      // the real delay. We still clamp defensively in case a future frame source omits it.
      delayMs: frame.delay > 0 ? frame.delay : 100,
    })

    if (frame.disposalType === 2) {
      clearRegion(canvas, screenWidth, left, top, width, height)
    } else if (frame.disposalType === 3 && savedRegion) {
      canvas.set(savedRegion)
    }
    // disposalType 0/1: canvas is left untouched for the next frame.
  }

  return results
}

function drawPatch(
  canvas: Uint8ClampedArray,
  screenWidth: number,
  patch: Uint8ClampedArray,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  for (let y = 0; y < height; y++) {
    const canvasRowStart = ((top + y) * screenWidth + left) * 4
    const patchRowStart = y * width * 4
    for (let x = 0; x < width; x++) {
      const srcIdx = patchRowStart + x * 4
      const alpha = patch[srcIdx + 3]
      if (alpha === 0) continue
      const dstIdx = canvasRowStart + x * 4
      canvas[dstIdx] = patch[srcIdx]!
      canvas[dstIdx + 1] = patch[srcIdx + 1]!
      canvas[dstIdx + 2] = patch[srcIdx + 2]!
      canvas[dstIdx + 3] = patch[srcIdx + 3]!
    }
  }
}

function clearRegion(
  canvas: Uint8ClampedArray,
  screenWidth: number,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  for (let y = 0; y < height; y++) {
    const rowStart = ((top + y) * screenWidth + left) * 4
    for (let x = 0; x < width; x++) {
      const idx = rowStart + x * 4
      canvas[idx] = 0
      canvas[idx + 1] = 0
      canvas[idx + 2] = 0
      canvas[idx + 3] = 0
    }
  }
}
