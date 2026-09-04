import { useProjectStore } from '../state/projectStore'
import { Section, Button } from '../components/ui/Section'
import { NumberField } from '../components/ui/NumberField'
import type { RotateCanvasMode } from '../types/project'

const PRESETS = [90, 180, 270]

export function RotatePanel() {
  const project = useProjectStore((s) => s.project)
  const setRotate = useProjectStore((s) => s.setRotate)
  const beginInteraction = useProjectStore((s) => s.beginInteraction)
  const updateDuringInteraction = useProjectStore((s) => s.updateDuringInteraction)
  const endInteraction = useProjectStore((s) => s.endInteraction)

  if (!project) return null
  const rotate = project.edits.rotate ?? { angleDeg: 0, canvasMode: 'auto-fit' as RotateCanvasMode }

  function setAngleLive(angleDeg: number) {
    updateDuringInteraction((p) => ({ ...p, edits: { ...p.edits, rotate: { ...rotate, angleDeg } } }))
  }

  function setAngleCommitted(angleDeg: number) {
    setRotate({ ...rotate, angleDeg: ((angleDeg % 360) + 360) % 360 })
  }

  return (
    <div>
      <Section title="Presets">
        <div className="flex gap-2">
          {PRESETS.map((deg) => (
            <Button key={deg} onClick={() => setAngleCommitted(deg)}>
              {deg}°
            </Button>
          ))}
          <Button onClick={() => setAngleCommitted(0)}>Reset</Button>
        </div>
      </Section>

      <Section title="Custom angle">
        <input
          type="range"
          min={0}
          max={359}
          value={rotate.angleDeg}
          onMouseDown={beginInteraction}
          onChange={(e) => setAngleLive(Number(e.target.value))}
          onMouseUp={endInteraction}
          className="w-full"
        />
        <NumberField
          label="Degrees"
          value={rotate.angleDeg}
          min={0}
          max={359}
          onChange={() => {}}
          onCommit={setAngleCommitted}
          suffix="°"
        />
      </Section>

      <Section title="Canvas">
        <div className="flex gap-2">
          <Button
            variant={rotate.canvasMode === 'auto-fit' ? 'primary' : 'default'}
            onClick={() => setRotate({ ...rotate, canvasMode: 'auto-fit' })}
          >
            Auto-fit
          </Button>
          <Button
            variant={rotate.canvasMode === 'keep-original' ? 'primary' : 'default'}
            onClick={() => setRotate({ ...rotate, canvasMode: 'keep-original' })}
          >
            Keep original
          </Button>
        </div>
      </Section>
    </div>
  )
}
