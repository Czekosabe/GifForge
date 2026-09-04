import { useProjectStore } from '../state/projectStore'
import { Section, Button } from '../components/ui/Section'
import { NumberField } from '../components/ui/NumberField'

const PRESETS = [0.25, 0.5, 1, 1.5, 2, 3]

export function SpeedPanel() {
  const project = useProjectStore((s) => s.project)
  const setSpeed = useProjectStore((s) => s.setSpeed)

  if (!project) return null
  const factor = project.edits.speed.factor

  return (
    <div>
      <Section title="Presets">
        <div className="grid grid-cols-3 gap-1">
          {PRESETS.map((p) => (
            <Button key={p} variant={factor === p ? 'primary' : 'default'} onClick={() => setSpeed(p)}>
              {p}x
            </Button>
          ))}
        </div>
      </Section>
      <Section title="Custom">
        <NumberField label="Speed" value={factor} min={0.1} max={10} step={0.05} suffix="x" onChange={() => {}} onCommit={setSpeed} />
        <p className="text-[11px] text-slate-500">
          Changes playback speed by adjusting frame delays. GIF timing is limited to 10ms steps, so very
          precise speeds may round slightly.
        </p>
      </Section>
    </div>
  )
}
