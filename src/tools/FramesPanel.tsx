import { useProjectStore } from '../state/projectStore'
import { useEditorStore } from '../state/editorStore'
import { useFrameCacheStore } from '../state/frameCacheStore'
import { applySpeedToDelay } from '../core/edit/frameOrder'
import { Section, Button } from '../components/ui/Section'

export function FramesPanel() {
  const project = useProjectStore((s) => s.project)
  const reverseFrames = useProjectStore((s) => s.reverseFrames)
  const selectedFrames = useEditorStore((s) => s.selectedFrames)
  const frameDelaysMs = useFrameCacheStore((s) => s.frameDelaysMs)

  if (!project) return null
  const { frameOrder, speed } = project.edits
  const totalDurationMs = frameOrder.reduce((sum, originalIndex) => {
    const raw = frameDelaysMs[originalIndex] ?? 100
    return sum + applySpeedToDelay(raw, speed.factor)
  }, 0)

  return (
    <div>
      <Section title="Overview">
        <p className="text-xs text-slate-400">Frames: {frameOrder.length}</p>
        <p className="text-xs text-slate-400">Duration: {(totalDurationMs / 1000).toFixed(2)}s</p>
        <p className="text-xs text-slate-400">Selected: {selectedFrames.length}</p>
      </Section>
      <Section title="Actions">
        <Button onClick={reverseFrames}>Reverse animation</Button>
        <p className="text-[11px] text-slate-500">
          Use the frame-range field in the timeline below to select frames, then delete or keep them.
        </p>
      </Section>
    </div>
  )
}
