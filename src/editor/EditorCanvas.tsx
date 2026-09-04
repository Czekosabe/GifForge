import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect, Text as KonvaText, Transformer } from 'react-konva'
import type Konva from 'konva'
import { useProjectStore } from '../state/projectStore'
import { useFrameCacheStore } from '../state/frameCacheStore'
import { useEditorStore } from '../state/editorStore'
import { usePlaybackStore } from '../state/playbackStore'
import { usePlaybackController } from './usePlaybackController'
import { computeOutputDimensions } from '../core/render/compositeFrame'
import { clampCropToBounds } from '../core/render/transforms'
import {
  getFitScale,
  imageToViewportPoint,
  imageToViewportRect,
  viewportToImagePoint,
  viewportToImageRect,
  type Viewport,
} from '../core/coordinates/coordinates'
import { isFrameVisible } from '../core/selection/frameRange'
import type { ImageOverlayLayer, Layer as ProjectLayer, TextLayer } from '../types/project'

export function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const imageNodeRef = useRef<Konva.Image>(null)

  const project = useProjectStore((s) => s.project)
  const previewBitmaps = useFrameCacheStore((s) => s.previewBitmaps)
  const activeTool = useEditorStore((s) => s.activeTool)
  const zoom = useEditorStore((s) => s.zoom)
  const panX = useEditorStore((s) => s.panX)
  const panY = useEditorStore((s) => s.panY)
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId)
  const selectLayer = useEditorStore((s) => s.selectLayer)
  const currentFrameIndex = usePlaybackStore((s) => s.currentFrameIndex)
  const isPlaying = usePlaybackStore((s) => s.isPlaying)

  usePlaybackController(imageNodeRef)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const sourceWidth = project?.metadata.sourceWidth ?? 1
  const sourceHeight = project?.metadata.sourceHeight ?? 1
  const crop = project?.edits.crop ?? null
  const resize = project?.edits.resize ?? null
  const rotate = project?.edits.rotate ?? null

  const outputDims = useMemo(
    () => computeOutputDimensions(sourceWidth, sourceHeight, crop, resize, rotate),
    [sourceWidth, sourceHeight, crop, resize, rotate],
  )

  const viewport: Viewport = {
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    imageWidth: outputDims.width,
    imageHeight: outputDims.height,
    zoom,
    panX,
    panY,
  }

  const originalIndex = project?.edits.frameOrder[currentFrameIndex]
  const currentBitmap = originalIndex !== undefined ? previewBitmaps[originalIndex] : undefined

  // Keep the static (paused) preview image in sync when not playing.
  useEffect(() => {
    if (isPlaying) return
    const node = imageNodeRef.current
    if (node && currentBitmap) {
      node.image(currentBitmap)
      node.getLayer()?.batchDraw()
    }
  }, [isPlaying, currentBitmap])

  if (!project) return null

  const previewScaleX = currentBitmap ? currentBitmap.width / sourceWidth : 1
  const previewScaleY = currentBitmap ? currentBitmap.height / sourceHeight : 1

  const preCropWidth = crop ? crop.width : sourceWidth
  const preCropHeight = crop ? crop.height : sourceHeight
  const destWidth = resize ? resize.width : preCropWidth
  const destHeight = resize ? resize.height : preCropHeight

  const rotationDims =
    rotate && rotate.angleDeg % 360 !== 0 && rotate.canvasMode === 'auto-fit'
      ? outputDims
      : { width: destWidth, height: destHeight }

  const viewportDestSize = imageToViewportRect({ x: 0, y: 0, width: destWidth, height: destHeight }, viewport)
  const viewportCenter = imageToViewportPoint(
    { x: rotationDims.width / 2, y: rotationDims.height / 2 },
    viewport,
  )

  const frameNumber1Based = currentFrameIndex + 1
  const totalFrames = project.edits.frameOrder.length
  // Project.layers is top-of-panel-first (index 0 = frontmost); Konva (like canvas 2D) draws
  // later children on top, so reverse to bottom-to-top for the draw order — matches the
  // worker's export render order (see pipeline.worker.ts renderFullFrame).
  const visibleLayers = project.layers
    .filter((l) => isFrameVisible(l.frameRange, frameNumber1Based, totalFrames))
    .reverse()

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-surface-0">
      <Stage width={stageSize.width} height={stageSize.height}>
        <Layer>
          <KonvaImage
            ref={imageNodeRef}
            image={currentBitmap}
            crop={
              crop
                ? { x: crop.x * previewScaleX, y: crop.y * previewScaleY, width: crop.width * previewScaleX, height: crop.height * previewScaleY }
                : undefined
            }
            width={viewportDestSize.width}
            height={viewportDestSize.height}
            offsetX={viewportDestSize.width / 2}
            offsetY={viewportDestSize.height / 2}
            x={viewportCenter.x}
            y={viewportCenter.y}
            rotation={rotate?.angleDeg ?? 0}
          />
        </Layer>

        <Layer>
          {visibleLayers.map((layer) => (
            <EditableLayerNode
              key={layer.id}
              layer={layer}
              viewport={viewport}
              isSelected={selectedLayerId === layer.id}
              onSelect={() => selectLayer(layer.id)}
            />
          ))}
        </Layer>

        {activeTool === 'crop' && (
          <Layer>
            <CropOverlay viewport={viewport} sourceWidth={sourceWidth} sourceHeight={sourceHeight} />
          </Layer>
        )}
      </Stage>
    </div>
  )
}

function CropOverlay({ viewport, sourceWidth, sourceHeight }: { viewport: Viewport; sourceWidth: number; sourceHeight: number }) {
  const project = useProjectStore((s) => s.project)
  const setCrop = useProjectStore((s) => s.setCrop)
  const beginInteraction = useProjectStore((s) => s.beginInteraction)
  const updateDuringInteraction = useProjectStore((s) => s.updateDuringInteraction)
  const endInteraction = useProjectStore((s) => s.endInteraction)
  const rectRef = useRef<Konva.Rect>(null)
  const transformerRef = useRef<Konva.Transformer>(null)

  const crop = project?.edits.crop ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight }
  const viewportRect = imageToViewportRect(crop, viewport)

  useEffect(() => {
    if (rectRef.current && transformerRef.current) {
      transformerRef.current.nodes([rectRef.current])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [])

  return (
    <>
      <Rect
        ref={rectRef}
        x={viewportRect.x}
        y={viewportRect.y}
        width={viewportRect.width}
        height={viewportRect.height}
        stroke="#5b8cff"
        strokeWidth={2}
        dash={[6, 4]}
        fill="rgba(91,140,255,0.08)"
        draggable
        onDragStart={() => beginInteraction()}
        onDragMove={(e) => {
          const node = e.target
          const imageRect = viewportToImageRect({ x: node.x(), y: node.y(), width: viewportRect.width, height: viewportRect.height }, viewport)
          const clamped = clampCropToBounds(imageRect, sourceWidth, sourceHeight)
          updateDuringInteraction((p) => ({ ...p, edits: { ...p.edits, crop: clamped } }))
        }}
        onDragEnd={() => endInteraction()}
        onTransformStart={() => beginInteraction()}
        onTransform={(e) => {
          const node = e.target as Konva.Rect
          const scaleX = node.scaleX()
          const scaleY = node.scaleY()
          const imageRect = viewportToImageRect(
            { x: node.x(), y: node.y(), width: node.width() * scaleX, height: node.height() * scaleY },
            viewport,
          )
          node.scaleX(1)
          node.scaleY(1)
          const clamped = clampCropToBounds(imageRect, sourceWidth, sourceHeight)
          updateDuringInteraction((p) => ({ ...p, edits: { ...p.edits, crop: clamped } }))
        }}
        onTransformEnd={() => endInteraction()}
      />
      <Transformer
        ref={transformerRef}
        rotateEnabled={false}
        borderStroke="#5b8cff"
        anchorStroke="#5b8cff"
        anchorFill="#0a0a0c"
        keepRatio={false}
      />
      {/* Initialize crop to full image on first entry into crop tool if unset. */}
      {!project?.edits.crop && <CropInitializer setCrop={setCrop} sourceWidth={sourceWidth} sourceHeight={sourceHeight} />}
    </>
  )
}

function CropInitializer({
  setCrop,
  sourceWidth,
  sourceHeight,
}: {
  setCrop: (c: { x: number; y: number; width: number; height: number }) => void
  sourceWidth: number
  sourceHeight: number
}) {
  useEffect(() => {
    setCrop({ x: 0, y: 0, width: sourceWidth, height: sourceHeight })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function EditableLayerNode({
  layer,
  viewport,
  isSelected,
  onSelect,
}: {
  layer: ProjectLayer
  viewport: Viewport
  isSelected: boolean
  onSelect: () => void
}) {
  const beginInteraction = useProjectStore((s) => s.beginInteraction)
  const updateDuringInteraction = useProjectStore((s) => s.updateDuringInteraction)
  const endInteraction = useProjectStore((s) => s.endInteraction)
  const assetBitmaps = useFrameCacheStore((s) => s.assetBitmaps)
  const nodeRef = useRef<Konva.Text | Konva.Image>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const scale = getFitScale(viewport)

  useEffect(() => {
    if (isSelected && nodeRef.current && transformerRef.current) {
      transformerRef.current.nodes([nodeRef.current])
      transformerRef.current.getLayer()?.batchDraw()
    } else if (!isSelected && transformerRef.current) {
      transformerRef.current.nodes([])
    }
  }, [isSelected])

  const pos = imageToViewportPoint({ x: layer.x, y: layer.y }, viewport)

  const commitLive = (patch: Partial<ProjectLayer>) => {
    updateDuringInteraction((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === layer.id ? ({ ...l, ...patch } as ProjectLayer) : l)),
    }))
  }

  const commonProps = {
    x: pos.x,
    y: pos.y,
    rotation: layer.rotationDeg,
    opacity: layer.opacity,
    draggable: !layer.locked,
    onClick: onSelect,
    onTap: onSelect,
    onDragStart: () => beginInteraction(),
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target
      const back = viewportToImagePoint({ x: node.x(), y: node.y() }, viewport)
      commitLive({ x: back.x, y: back.y })
    },
    onDragEnd: () => endInteraction(),
    onTransformStart: () => beginInteraction(),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target
      node.scaleX(1)
      node.scaleY(1)
      endInteraction()
    },
  }

  if (layer.type === 'text') {
    const textLayer = layer as TextLayer
    return (
      <>
        <KonvaText
          ref={nodeRef as React.RefObject<Konva.Text>}
          text={textLayer.text}
          fontFamily={textLayer.fontFamily}
          fontSize={textLayer.fontSize * scale}
          fill={textLayer.fillColor}
          stroke={textLayer.strokeColor}
          strokeWidth={textLayer.strokeWidth * scale}
          align={textLayer.align}
          width={textLayer.width * scale}
          {...commonProps}
          onTransform={(e) => {
            const node = e.target as Konva.Text
            const newWidth = node.width() * node.scaleX()
            const newFontSize = textLayer.fontSize * node.scaleY()
            node.scaleX(1)
            node.scaleY(1)
            commitLive({ width: newWidth / scale, fontSize: newFontSize } as Partial<TextLayer>)
          }}
        />
        {isSelected && <Transformer ref={transformerRef} borderStroke="#5b8cff" anchorStroke="#5b8cff" anchorFill="#0a0a0c" />}
      </>
    )
  }

  const overlayLayer = layer as ImageOverlayLayer
  const bitmap = assetBitmaps.get(overlayLayer.assetId)
  return (
    <>
      <KonvaImage
        ref={nodeRef as React.RefObject<Konva.Image>}
        image={bitmap}
        width={overlayLayer.width * scale}
        height={overlayLayer.height * scale}
        {...commonProps}
        onTransform={(e) => {
          const node = e.target as Konva.Image
          const newWidth = (node.width() * node.scaleX()) / scale
          const newHeight = (node.height() * node.scaleY()) / scale
          node.scaleX(1)
          node.scaleY(1)
          commitLive({ width: newWidth, height: newHeight } as Partial<ImageOverlayLayer>)
        }}
      />
      {isSelected && <Transformer ref={transformerRef} borderStroke="#5b8cff" anchorStroke="#5b8cff" anchorFill="#0a0a0c" />}
    </>
  )
}
