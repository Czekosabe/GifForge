import { useEditorStore } from '../state/editorStore'
import { CropPanel } from '../tools/CropPanel'
import { FramesPanel } from '../tools/FramesPanel'
import { TextPanel } from '../tools/TextPanel'
import { ResizePanel } from '../tools/ResizePanel'
import { SpeedPanel } from '../tools/SpeedPanel'
import { RotatePanel } from '../tools/RotatePanel'
import { OverlayPanel } from '../tools/OverlayPanel'
import { OptimizePanel } from '../tools/OptimizePanel'
import { ExportPanel } from '../tools/ExportPanel'
import { HistoryPanel } from '../tools/HistoryPanel'

const TOOL_TITLES: Record<string, string> = {
  crop: 'Crop',
  frames: 'Frames',
  text: 'Text',
  resize: 'Resize',
  speed: 'Speed',
  rotate: 'Rotate',
  overlay: 'Overlay',
  optimize: 'Optimize',
  export: 'Export',
  history: 'History',
}

export function RightInspector() {
  const activeTool = useEditorStore((s) => s.activeTool)

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-surface-border bg-surface-1">
      <div className="border-b border-surface-border px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          {TOOL_TITLES[activeTool] ?? 'Inspector'}
        </h2>
      </div>
      {activeTool === 'crop' && <CropPanel />}
      {activeTool === 'frames' && <FramesPanel />}
      {activeTool === 'text' && <TextPanel />}
      {activeTool === 'resize' && <ResizePanel />}
      {activeTool === 'speed' && <SpeedPanel />}
      {activeTool === 'rotate' && <RotatePanel />}
      {activeTool === 'overlay' && <OverlayPanel />}
      {activeTool === 'optimize' && <OptimizePanel />}
      {activeTool === 'export' && <ExportPanel />}
      {activeTool === 'history' && <HistoryPanel />}
    </aside>
  )
}
