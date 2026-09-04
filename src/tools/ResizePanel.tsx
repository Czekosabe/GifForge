import { useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { computePercentResize, computePixelResize } from '../core/render/transforms'
import { Section, Button, Checkbox } from '../components/ui/Section'
import { NumberField } from '../components/ui/NumberField'

const PERCENT_PRESETS = [25, 50, 75, 100, 125, 150, 200]

export function ResizePanel() {
  const project = useProjectStore((s) => s.project)
  const setResize = useProjectStore((s) => s.setResize)
  const [lockAspect, setLockAspect] = useState(true)
  const [mode, setMode] = useState<'pixels' | 'percent'>('pixels')

  if (!project) return null
  const { sourceWidth, sourceHeight } = project.metadata
  const preResizeWidth = project.edits.crop?.width ?? sourceWidth
  const preResizeHeight = project.edits.crop?.height ?? sourceHeight
  const current = project.edits.resize ?? { width: preResizeWidth, height: preResizeHeight }

  function applyPixels(width: number, height: number) {
    const result = computePixelResize({
      sourceWidth: preResizeWidth,
      sourceHeight: preResizeHeight,
      targetWidth: width,
      targetHeight: height,
      mode: lockAspect ? 'lock' : 'free',
    })
    setResize(result)
  }

  function applyPercent(percent: number) {
    setResize(computePercentResize(preResizeWidth, preResizeHeight, percent))
  }

  return (
    <div>
      <Section title="Mode">
        <div className="flex gap-2">
          <Button variant={mode === 'pixels' ? 'primary' : 'default'} onClick={() => setMode('pixels')}>
            Pixels
          </Button>
          <Button variant={mode === 'percent' ? 'primary' : 'default'} onClick={() => setMode('percent')}>
            Percent
          </Button>
        </div>
      </Section>

      {mode === 'pixels' ? (
        <Section title="Dimensions (px)">
          <NumberField label="Width" value={current.width} min={1} onChange={() => {}} onCommit={(w) => applyPixels(w, current.height)} />
          <NumberField label="Height" value={current.height} min={1} onChange={() => {}} onCommit={(h) => applyPixels(current.width, h)} />
          <Checkbox label="Keep aspect ratio" checked={lockAspect} onChange={setLockAspect} />
        </Section>
      ) : (
        <Section title="Scale">
          <div className="grid grid-cols-4 gap-1">
            {PERCENT_PRESETS.map((p) => (
              <button key={p} onClick={() => applyPercent(p)} className="rounded bg-surface-3 px-2 py-1 text-[11px] text-slate-200 hover:bg-surface-4">
                {p}%
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Preview">
        <p className="text-xs text-slate-400">
          Original: {preResizeWidth} × {preResizeHeight}
        </p>
        <p className="text-xs text-slate-200">
          Output: {current.width} × {current.height}
        </p>
        <Button onClick={() => setResize(null)}>Reset</Button>
      </Section>
    </div>
  )
}
