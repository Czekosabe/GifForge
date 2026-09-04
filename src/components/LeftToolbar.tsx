import { useEditorStore, type ToolId } from '../state/editorStore'
import { useProjectStore } from '../state/projectStore'

const TOOLS: { id: ToolId; label: string; icon: string }[] = [
  { id: 'crop', label: 'Crop', icon: '⬚' },
  { id: 'frames', label: 'Frames', icon: '▤' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'resize', label: 'Resize', icon: '⤢' },
  { id: 'speed', label: 'Speed', icon: '⏱' },
  { id: 'reverse', label: 'Reverse', icon: '⇄' },
  { id: 'rotate', label: 'Rotate', icon: '⟳' },
  { id: 'overlay', label: 'Overlay', icon: '🖼' },
  { id: 'optimize', label: 'Optimize', icon: '⚙' },
  { id: 'export', label: 'Export', icon: '⭳' },
  { id: 'history', label: 'History', icon: '⏳' },
]

export function LeftToolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const reverseFrames = useProjectStore((s) => s.reverseFrames)
  const project = useProjectStore((s) => s.project)

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-surface-border bg-surface-1 py-2">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          title={tool.label}
          disabled={!project}
          onClick={() => {
            if (tool.id === 'reverse') {
              reverseFrames()
              return
            }
            setActiveTool(tool.id)
          }}
          className={`flex w-14 flex-col items-center gap-0.5 rounded py-1.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
            activeTool === tool.id ? 'bg-accent-muted text-accent' : 'text-slate-400 hover:bg-surface-2 hover:text-slate-200'
          }`}
        >
          <span className="text-lg leading-none">{tool.icon}</span>
          {tool.label}
        </button>
      ))}
    </nav>
  )
}
