import { useProjectStore } from '../state/projectStore'
import { useEditorStore } from '../state/editorStore'
import type { Layer } from '../types/project'

export function LayerList({ layers }: { layers: Layer[] }) {
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId)
  const selectLayer = useEditorStore((s) => s.selectLayer)
  const updateLayer = useProjectStore((s) => s.updateLayer)
  const removeLayer = useProjectStore((s) => s.removeLayer)
  const reorderLayer = useProjectStore((s) => s.reorderLayer)
  const allLayers = useProjectStore((s) => s.project?.layers ?? [])

  if (layers.length === 0) {
    return <p className="text-xs text-slate-500">No layers yet.</p>
  }

  return (
    <div className="flex flex-col gap-1">
      {layers.map((layer) => {
        const globalIndex = allLayers.findIndex((l) => l.id === layer.id)
        return (
          <div
            key={layer.id}
            className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs ${
              selectedLayerId === layer.id ? 'bg-accent-muted text-accent' : 'bg-surface-2 text-slate-300'
            }`}
          >
            <button
              className="flex-1 truncate text-left"
              onClick={() => selectLayer(layer.id)}
              title={layer.name}
            >
              {layer.name}
            </button>
            <button
              title={layer.visible ? 'Hide' : 'Show'}
              onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
              className="w-5 opacity-80 hover:opacity-100"
            >
              {layer.visible ? '👁' : '🚫'}
            </button>
            <button
              title={layer.locked ? 'Unlock' : 'Lock'}
              onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
              className="w-5 opacity-80 hover:opacity-100"
            >
              {layer.locked ? '🔒' : '🔓'}
            </button>
            <button
              title="Move up"
              disabled={globalIndex <= 0}
              onClick={() => reorderLayer(layer.id, globalIndex - 1)}
              className="w-4 opacity-80 hover:opacity-100 disabled:opacity-20"
            >
              ↑
            </button>
            <button
              title="Move down"
              disabled={globalIndex < 0 || globalIndex >= allLayers.length - 1}
              onClick={() => reorderLayer(layer.id, globalIndex + 1)}
              className="w-4 opacity-80 hover:opacity-100 disabled:opacity-20"
            >
              ↓
            </button>
            <button
              title="Delete"
              onClick={() => {
                removeLayer(layer.id)
                if (selectedLayerId === layer.id) selectLayer(null)
              }}
              className="w-4 text-red-400 opacity-80 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function FrameRangeField({ value, onChange, frameCount }: { value: string; onChange: (v: string) => void; frameCount: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-300">
      <span className="text-slate-400">Visible on frames (blank = all)</span>
      <input
        className="rounded border border-surface-border bg-surface-2 px-2 py-1 text-slate-100 outline-none focus:border-accent"
        placeholder={`e.g. 1-${frameCount}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
