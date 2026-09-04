import { useProjectStore } from '../state/projectStore'
import { ASPECT_RATIO_PRESETS, applyAspectRatio, centerCrop, clampCropToBounds } from '../core/render/transforms'
import { Section, Button } from '../components/ui/Section'
import { NumberField } from '../components/ui/NumberField'
import type { CropRegion } from '../types/project'

const ASPECT_LABELS: [string, string][] = [
  ['free', 'Free'],
  ['original', 'Original'],
  ['1:1', '1:1'],
  ['4:3', '4:3'],
  ['3:4', '3:4'],
  ['16:9', '16:9'],
  ['9:16', '9:16'],
  ['21:9', '21:9'],
]

export function CropPanel() {
  const project = useProjectStore((s) => s.project)
  const setCrop = useProjectStore((s) => s.setCrop)
  const beginInteraction = useProjectStore((s) => s.beginInteraction)
  const updateDuringInteraction = useProjectStore((s) => s.updateDuringInteraction)
  const endInteraction = useProjectStore((s) => s.endInteraction)

  if (!project) return null
  const { sourceWidth, sourceHeight } = project.metadata
  const crop = project.edits.crop ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight }

  function updateLive(patch: Partial<CropRegion>) {
    const clamped = clampCropToBounds({ ...crop, ...patch }, sourceWidth, sourceHeight)
    updateDuringInteraction((p) => ({ ...p, edits: { ...p.edits, crop: clamped } }))
  }

  function applyRatio(key: string) {
    if (key === 'free') return
    const ratio = key === 'original' ? sourceWidth / sourceHeight : ASPECT_RATIO_PRESETS[key]!
    setCrop(applyAspectRatio(crop, ratio, sourceWidth, sourceHeight))
  }

  const fieldProps = {
    onFocus: beginInteraction,
    onCommit: () => endInteraction(),
  }

  return (
    <div>
      <Section title="Aspect ratio">
        <div className="grid grid-cols-4 gap-1">
          {ASPECT_LABELS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyRatio(key)}
              className="rounded bg-surface-3 px-2 py-1 text-[11px] text-slate-200 hover:bg-surface-4"
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Region">
        <NumberField label="X" value={crop.x} min={0} max={sourceWidth - 1} onChange={(x) => updateLive({ x })} {...fieldProps} />
        <NumberField label="Y" value={crop.y} min={0} max={sourceHeight - 1} onChange={(y) => updateLive({ y })} {...fieldProps} />
        <NumberField label="Width" value={crop.width} min={1} max={sourceWidth} onChange={(width) => updateLive({ width })} {...fieldProps} />
        <NumberField label="Height" value={crop.height} min={1} max={sourceHeight} onChange={(height) => updateLive({ height })} {...fieldProps} />
      </Section>

      <Section title="Actions">
        <div className="flex gap-2">
          <Button onClick={() => setCrop({ x: 0, y: 0, width: sourceWidth, height: sourceHeight })}>Reset</Button>
          <Button onClick={() => setCrop(centerCrop(crop.width, crop.height, sourceWidth, sourceHeight))}>Center</Button>
        </div>
      </Section>
    </div>
  )
}
