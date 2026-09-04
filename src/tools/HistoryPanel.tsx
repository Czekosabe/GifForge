import { useProjectStore } from '../state/projectStore'
import { Section, Button } from '../components/ui/Section'

export function HistoryPanel() {
  const past = useProjectStore((s) => s.past)
  const future = useProjectStore((s) => s.future)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const canUndo = useProjectStore((s) => s.canUndo)
  const canRedo = useProjectStore((s) => s.canRedo)
  const resetToOriginal = useProjectStore((s) => s.resetToOriginal)

  return (
    <div>
      <Section title="History">
        <div className="flex gap-2">
          <Button onClick={undo} disabled={!canUndo}>
            ↶ Undo
          </Button>
          <Button onClick={redo} disabled={!canRedo}>
            ↷ Redo
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          {past.length} step{past.length === 1 ? '' : 's'} back · {future.length} step{future.length === 1 ? '' : 's'} forward
        </p>
      </Section>
      <Section title="Reset">
        <Button variant="danger" onClick={resetToOriginal}>
          Reset to original
        </Button>
        <p className="text-[11px] text-slate-500">Discards all edits and restores the originally uploaded GIF.</p>
      </Section>
    </div>
  )
}
