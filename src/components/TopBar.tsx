import { useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useEditorStore } from '../state/editorStore'
import { startNewProject } from '../app/useLoadGif'
import { Button } from './ui/Section'

export function TopBar() {
  const project = useProjectStore((s) => s.project)
  const canUndo = useProjectStore((s) => s.canUndo)
  const canRedo = useProjectStore((s) => s.canRedo)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const commit = useProjectStore((s) => s.commit)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const advancedMode = useEditorStore((s) => s.advancedMode)
  const setAdvancedMode = useEditorStore((s) => s.setAdvancedMode)
  const [editingName, setEditingName] = useState(false)
  const [confirmingNew, setConfirmingNew] = useState(false)

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border bg-surface-1 px-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-slate-100">
            Gif<span className="text-accent">Forge</span>
          </span>
          <span className="hidden text-[10px] text-slate-500 sm:inline">Edit. Optimize. Export.</span>
        </div>
        {project && (
          <>
            <span className="mx-1 h-5 w-px bg-surface-border" />
            {editingName ? (
              <input
                autoFocus
                className="rounded border border-accent bg-surface-2 px-2 py-1 text-sm text-slate-100 outline-none"
                defaultValue={project.metadata.name}
                onBlur={(e) => {
                  const name = e.target.value.trim() || project.metadata.name
                  commit((p) => ({ ...p, metadata: { ...p.metadata, name } }))
                  setEditingName(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setEditingName(false)
                }}
              />
            ) : (
              <button
                className="rounded px-2 py-1 text-sm text-slate-300 hover:bg-surface-2"
                onClick={() => setEditingName(true)}
                title="Rename project"
              >
                {project.metadata.name}
              </button>
            )}
          </>
        )}
      </div>

      {project && (
        <div className="flex items-center gap-2">
          <label className="mr-2 flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={advancedMode} onChange={(e) => setAdvancedMode(e.target.checked)} className="accent-accent" />
            Advanced
          </label>
          <Button variant="ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶ Undo
          </Button>
          <Button variant="ghost" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            ↷ Redo
          </Button>
          {confirmingNew ? (
            <span className="flex items-center gap-1.5 rounded bg-surface-2 px-2 py-1 text-xs text-slate-300">
              Close this project and upload a different GIF?
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmingNew(false)
                  void startNewProject()
                }}
              >
                Yes, start new
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingNew(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmingNew(true)} title="Close this project and upload a different GIF">
              New
            </Button>
          )}
          <Button variant="primary" onClick={() => setActiveTool('export')}>
            Export
          </Button>
        </div>
      )}
    </header>
  )
}
