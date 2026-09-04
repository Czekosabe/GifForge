import { useProjectStore } from '../state/projectStore'
import { useEditorStore } from '../state/editorStore'
import { nanoid } from '../utils/nanoid'
import { Section, Button, Select } from '../components/ui/Section'
import { NumberField } from '../components/ui/NumberField'
import { LayerList, FrameRangeField } from './LayerList'
import { FONT_FAMILIES, TEXT_PRESETS } from './presets'
import type { TextLayer } from '../types/project'

function createTextLayer(sourceWidth: number, sourceHeight: number, index: number): TextLayer {
  return {
    id: nanoid(),
    type: 'text',
    name: `Text ${index + 1}`,
    visible: true,
    locked: false,
    frameRange: '',
    x: sourceWidth * 0.15,
    y: sourceHeight * 0.7,
    width: sourceWidth * 0.7,
    rotationDeg: 0,
    opacity: 1,
    text: 'Your text here',
    fontFamily: FONT_FAMILIES[0]!,
    fontSize: Math.max(16, Math.round(sourceHeight * 0.1)),
    align: 'center',
    fillColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 2,
    shadow: null,
  }
}

export function TextPanel() {
  const project = useProjectStore((s) => s.project)
  const addLayer = useProjectStore((s) => s.addLayer)
  const updateLayer = useProjectStore((s) => s.updateLayer)
  const beginInteraction = useProjectStore((s) => s.beginInteraction)
  const updateDuringInteraction = useProjectStore((s) => s.updateDuringInteraction)
  const endInteraction = useProjectStore((s) => s.endInteraction)
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId)
  const selectLayer = useEditorStore((s) => s.selectLayer)

  if (!project) return null
  const textLayers = project.layers.filter((l): l is TextLayer => l.type === 'text')
  const selected = textLayers.find((l) => l.id === selectedLayerId) ?? null

  /** Single committed history entry — use for discrete choices (presets, dropdowns, color pickers). */
  function commitField(patch: Partial<TextLayer>) {
    if (!selected) return
    updateLayer(selected.id, patch)
  }

  /** Live update with no history entry — pair with beginInteraction/endInteraction around a typing/dragging session. */
  function updateLive(patch: Partial<TextLayer>) {
    if (!selected) return
    updateDuringInteraction((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === selected.id ? ({ ...l, ...patch } as TextLayer) : l)),
    }))
  }

  function fieldProps() {
    return { onFocus: beginInteraction, onCommit: () => endInteraction() }
  }

  return (
    <div>
      <Section
        title="Text layers"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              const layer = createTextLayer(project.metadata.sourceWidth, project.metadata.sourceHeight, textLayers.length)
              addLayer(layer)
              selectLayer(layer.id)
            }}
          >
            + Add
          </Button>
        }
      >
        <LayerList layers={textLayers} />
      </Section>

      {selected && (
        <>
          <Section title="Content">
            <textarea
              className="min-h-16 rounded border border-surface-border bg-surface-2 px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent"
              value={selected.text}
              onFocus={beginInteraction}
              onChange={(e) => updateLive({ text: e.target.value })}
              onBlur={() => endInteraction()}
            />
            <Select
              label="Font"
              value={selected.fontFamily}
              onChange={(fontFamily) => commitField({ fontFamily })}
              options={FONT_FAMILIES.map((f) => ({ value: f, label: f.split(',')[0]!.replace(/"/g, '') }))}
            />
            <Select
              label="Align"
              value={selected.align}
              onChange={(align) => commitField({ align: align as TextLayer['align'] })}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ]}
            />
          </Section>

          <Section title="Presets">
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(TEXT_PRESETS).map(([name, values]) => (
                <button
                  key={name}
                  onClick={() => commitField(values)}
                  className="rounded bg-surface-3 px-2 py-1 text-[11px] text-slate-200 hover:bg-surface-4"
                >
                  {name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Position & size">
            <NumberField label="X" value={selected.x} onChange={(x) => updateLive({ x })} {...fieldProps()} />
            <NumberField label="Y" value={selected.y} onChange={(y) => updateLive({ y })} {...fieldProps()} />
            <NumberField label="Width" value={selected.width} min={1} onChange={(width) => updateLive({ width })} {...fieldProps()} />
            <NumberField
              label="Font size"
              value={selected.fontSize}
              min={1}
              onChange={(fontSize) => updateLive({ fontSize })}
              {...fieldProps()}
            />
            <NumberField
              label="Rotation"
              value={selected.rotationDeg}
              min={-360}
              max={360}
              onChange={(rotationDeg) => updateLive({ rotationDeg })}
              suffix="°"
              {...fieldProps()}
            />
          </Section>

          <Section title="Style">
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span className="text-slate-400">Fill color</span>
              <input type="color" value={selected.fillColor} onChange={(e) => commitField({ fillColor: e.target.value })} />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span className="text-slate-400">Stroke color</span>
              <input type="color" value={selected.strokeColor} onChange={(e) => commitField({ strokeColor: e.target.value })} />
            </label>
            <NumberField
              label="Stroke width"
              value={selected.strokeWidth}
              min={0}
              max={20}
              step={0.1}
              onChange={(strokeWidth) => updateLive({ strokeWidth })}
              {...fieldProps()}
            />
            <NumberField
              label="Opacity"
              value={selected.opacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(opacity) => updateLive({ opacity })}
              {...fieldProps()}
            />
          </Section>

          <Section title="Timing">
            <FrameRangeField
              value={selected.frameRange}
              onChange={(frameRange) => commitField({ frameRange })}
              frameCount={project.edits.frameOrder.length}
            />
          </Section>
        </>
      )}
    </div>
  )
}
