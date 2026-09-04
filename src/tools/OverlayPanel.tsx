import { useRef } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useEditorStore } from '../state/editorStore'
import { useFrameCacheStore } from '../state/frameCacheStore'
import { useStorageHealthStore } from '../state/storageHealthStore'
import { getPipeline } from '../workers/client'
import { saveAsset, deleteAsset } from '../storage/db'
import { nanoid } from '../utils/nanoid'
import { Section, Button } from '../components/ui/Section'
import { NumberField } from '../components/ui/NumberField'
import { LayerList, FrameRangeField } from './LayerList'
import type { ImageOverlayLayer } from '../types/project'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function OverlayPanel() {
  const project = useProjectStore((s) => s.project)
  const addLayer = useProjectStore((s) => s.addLayer)
  const updateLayer = useProjectStore((s) => s.updateLayer)
  const removeLayer = useProjectStore((s) => s.removeLayer)
  const beginInteraction = useProjectStore((s) => s.beginInteraction)
  const updateDuringInteraction = useProjectStore((s) => s.updateDuringInteraction)
  const endInteraction = useProjectStore((s) => s.endInteraction)
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId)
  const selectLayer = useEditorStore((s) => s.selectLayer)
  const setAssetBitmap = useFrameCacheStore((s) => s.setAssetBitmap)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!project) return null
  const overlayLayers = project.layers.filter((l): l is ImageOverlayLayer => l.type === 'image-overlay')
  const selected = overlayLayers.find((l) => l.id === selectedLayerId) ?? null

  async function handleFile(file: File | undefined) {
    if (!file || !project) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      alert('Please choose a PNG, JPG, or WEBP image.')
      return
    }
    const assetId = nanoid()
    const bitmap = await createImageBitmap(file)
    setAssetBitmap(assetId, bitmap)
    // Persisting to IndexedDB (for autosave restore) is best-effort: if it fails, the
    // overlay should still work for the rest of this session, it just won't survive a
    // reload. Don't let a storage error block the user from using the layer at all.
    saveAsset(assetId, file, file.name)
      .then(() => useStorageHealthStore.getState().reportSuccess())
      .catch((err) => {
        console.warn('Failed to persist overlay asset for autosave restore:', err)
        useStorageHealthStore.getState().reportFailure()
      })
    await getPipeline().registerAsset(assetId, bitmap)

    const sourceW = project.metadata.sourceWidth
    const sourceH = project.metadata.sourceHeight
    const scale = Math.min(1, (sourceW * 0.4) / bitmap.width, (sourceH * 0.4) / bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const layer: ImageOverlayLayer = {
      id: nanoid(),
      type: 'image-overlay',
      name: file.name,
      visible: true,
      locked: false,
      frameRange: '',
      x: (sourceW - width) / 2,
      y: (sourceH - height) / 2,
      width,
      height,
      rotationDeg: 0,
      opacity: 1,
      assetId,
    }
    addLayer(layer)
    selectLayer(layer.id)
  }

  function updateLive(patch: Partial<ImageOverlayLayer>) {
    if (!selected) return
    updateDuringInteraction((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === selected.id ? ({ ...l, ...patch } as ImageOverlayLayer) : l)),
    }))
  }

  const fieldProps = { onFocus: beginInteraction, onCommit: () => endInteraction() }

  return (
    <div>
      <Section
        title="Image overlays"
        actions={
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            + Add
          </Button>
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <LayerList layers={overlayLayers} />
      </Section>

      {selected && (
        <>
          <Section title="Position & size">
            <NumberField label="X" value={selected.x} onChange={(x) => updateLive({ x })} {...fieldProps} />
            <NumberField label="Y" value={selected.y} onChange={(y) => updateLive({ y })} {...fieldProps} />
            <NumberField label="Width" value={selected.width} min={1} onChange={(width) => updateLive({ width })} {...fieldProps} />
            <NumberField label="Height" value={selected.height} min={1} onChange={(height) => updateLive({ height })} {...fieldProps} />
            <NumberField
              label="Rotation"
              value={selected.rotationDeg}
              min={-360}
              max={360}
              onChange={(rotationDeg) => updateLive({ rotationDeg })}
              suffix="°"
              {...fieldProps}
            />
            <NumberField
              label="Opacity"
              value={selected.opacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(opacity) => updateLive({ opacity })}
              {...fieldProps}
            />
          </Section>

          <Section title="Timing">
            <FrameRangeField
              value={selected.frameRange}
              onChange={(frameRange) => updateLayer(selected.id, { frameRange })}
              frameCount={project.edits.frameOrder.length}
            />
          </Section>

          <Section title="Actions">
            <Button
              variant="danger"
              onClick={() => {
                // Bitmap + worker-side asset cleanup happens automatically once no layer
                // references this assetId anymore — see useGarbageCollectAssets. Only the
                // IndexedDB-persisted blob (a separate concern, for autosave) needs deleting here.
                deleteAsset(selected.assetId).catch(() => {})
                removeLayer(selected.id)
                selectLayer(null)
              }}
            >
              Delete overlay
            </Button>
          </Section>
        </>
      )}
    </div>
  )
}
