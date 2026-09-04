import type { CropRegion, Layer, ResizeSettings, RotateSettings } from '../../types/project'
import { computeRotatedBounds } from './transforms'

// This module is worker-only (rendered frames never touch the DOM), so it's built against
// OffscreenCanvas alone — keeping it out of the "DOM" lib avoids pulling HTMLCanvasElement
// into a context where WebWorker's lib doesn't define it.
export type CanvasLike = OffscreenCanvas

export interface RenderPipelineInput {
  sourceRgba: Uint8ClampedArray
  sourceWidth: number
  sourceHeight: number
  crop: CropRegion | null
  resize: ResizeSettings | null
  rotate: RotateSettings | null
  /** Layers already filtered to those visible on this frame, in bottom-to-top draw order. */
  layers: Layer[]
  /** Resolves an image-overlay layer's asset to a drawable bitmap. */
  getAssetBitmap: (assetId: string) => CanvasImageSource | undefined
}

export interface CanvasFactory {
  create(width: number, height: number): CanvasLike
}

/** Final output canvas dimensions after crop -> resize -> rotate, before layers are drawn. */
export function computeOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  crop: CropRegion | null,
  resize: ResizeSettings | null,
  rotate: RotateSettings | null,
): { width: number; height: number } {
  let width = crop ? crop.width : sourceWidth
  let height = crop ? crop.height : sourceHeight
  if (resize) {
    width = resize.width
    height = resize.height
  }
  if (rotate && rotate.angleDeg % 360 !== 0 && rotate.canvasMode === 'auto-fit') {
    const bounds = computeRotatedBounds(width, height, rotate.angleDeg)
    width = bounds.width
    height = bounds.height
  }
  return { width, height }
}

function get2dContext(canvas: CanvasLike): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to acquire 2D rendering context.')
  return ctx
}

/**
 * Runs the full non-destructive render pipeline for a single frame:
 * source -> crop -> resize -> rotate -> text/overlay layers -> final composited canvas.
 */
export function renderFrame(input: RenderPipelineInput, canvasFactory: CanvasFactory): CanvasLike {
  const { sourceRgba, sourceWidth, sourceHeight, crop, resize, rotate } = input

  // 1. Source onto a canvas.
  let current = canvasFactory.create(sourceWidth, sourceHeight)
  let ctx = get2dContext(current)
  const sourceImageData = new ImageData(sourceRgba, sourceWidth, sourceHeight)
  ctx.putImageData(sourceImageData, 0, 0)

  // 2. Crop.
  if (crop) {
    const cropped = canvasFactory.create(crop.width, crop.height)
    const cropCtx = get2dContext(cropped)
    cropCtx.drawImage(current as CanvasImageSource, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
    current = cropped
  }

  // 3. Resize.
  if (resize) {
    const resized = canvasFactory.create(resize.width, resize.height)
    const resizeCtx = get2dContext(resized)
    resizeCtx.imageSmoothingEnabled = true
    resizeCtx.imageSmoothingQuality = 'high'
    resizeCtx.drawImage(current as CanvasImageSource, 0, 0, current.width, current.height, 0, 0, resize.width, resize.height)
    current = resized
  }

  // 4. Rotate.
  if (rotate && rotate.angleDeg % 360 !== 0) {
    const targetDims =
      rotate.canvasMode === 'auto-fit'
        ? computeRotatedBounds(current.width, current.height, rotate.angleDeg)
        : { width: current.width, height: current.height }
    const rotated = canvasFactory.create(targetDims.width, targetDims.height)
    const rotateCtx = get2dContext(rotated)
    rotateCtx.translate(targetDims.width / 2, targetDims.height / 2)
    rotateCtx.rotate((rotate.angleDeg * Math.PI) / 180)
    rotateCtx.drawImage(current as CanvasImageSource, -current.width / 2, -current.height / 2)
    current = rotated
  }

  // 5. Layers (text + image overlays), bottom-to-top.
  ctx = get2dContext(current)
  for (const layer of input.layers) {
    if (!layer.visible) continue
    drawLayer(ctx, layer, input.getAssetBitmap)
  }

  return current
}

function drawLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: Layer,
  getAssetBitmap: (assetId: string) => CanvasImageSource | undefined,
): void {
  ctx.save()
  ctx.globalAlpha = clamp01(layer.opacity)

  if (layer.type === 'text') {
    const lineHeight = layer.fontSize * 1.2
    const centerX = layer.x + layer.width / 2
    const centerY = layer.y + lineHeight / 2
    ctx.translate(centerX, centerY)
    ctx.rotate((layer.rotationDeg * Math.PI) / 180)
    ctx.translate(-centerX, -centerY)

    ctx.font = `${layer.fontSize}px ${layer.fontFamily}`
    ctx.textAlign = layer.align
    ctx.textBaseline = 'top'

    if (layer.shadow) {
      ctx.shadowColor = layer.shadow.color
      ctx.shadowBlur = layer.shadow.blur
      ctx.shadowOffsetX = layer.shadow.offsetX
      ctx.shadowOffsetY = layer.shadow.offsetY
    }

    const textX = layer.align === 'left' ? layer.x : layer.align === 'right' ? layer.x + layer.width : centerX
    const lines = layer.text.split('\n')
    lines.forEach((line, i) => {
      const y = layer.y + i * lineHeight
      if (layer.strokeWidth > 0) {
        ctx.lineWidth = layer.strokeWidth
        ctx.strokeStyle = layer.strokeColor
        ctx.strokeText(line, textX, y)
      }
      ctx.fillStyle = layer.fillColor
      ctx.fillText(line, textX, y)
    })
  } else {
    const bitmap = getAssetBitmap(layer.assetId)
    if (bitmap) {
      const centerX = layer.x + layer.width / 2
      const centerY = layer.y + layer.height / 2
      ctx.translate(centerX, centerY)
      ctx.rotate((layer.rotationDeg * Math.PI) / 180)
      ctx.translate(-centerX, -centerY)
      ctx.drawImage(bitmap, layer.x, layer.y, layer.width, layer.height)
    }
  }

  ctx.restore()
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function canvasToImageData(canvas: CanvasLike): ImageData {
  const ctx = get2dContext(canvas)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}
