import { useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useEditorStore } from '../state/editorStore'
import { usePlaybackStore } from '../state/playbackStore'
import { useJobStore } from '../state/jobStore'
import { getPipeline, proxyProgress } from '../workers/client'
import { downloadBytes } from '../utils/download'
import { Section, Button, Select, Checkbox } from '../components/ui/Section'
import { NumberField } from '../components/ui/NumberField'
import type { ExportSettings, LoopMode } from '../types/project'

const EXPORT_PRESETS: Record<string, Partial<ExportSettings>> = {
  'Best Quality': { quality: 'best', maxColors: 256, dither: true, scalePercent: 100 },
  'Small File Size': { quality: 'small', maxColors: 64, dither: true, scalePercent: 100 },
  Discord: { quality: 'balanced', maxColors: 128, dither: true, scalePercent: 100, loopMode: 'forever' },
  'Social Media': { quality: 'balanced', maxColors: 128, dither: true, scalePercent: 100, loopMode: 'forever' },
  Website: { quality: 'small', maxColors: 96, dither: true, scalePercent: 100, loopMode: 'forever' },
  'Sticker / Emoji': { quality: 'balanced', maxColors: 64, dither: false, scalePercent: 100, loopMode: 'forever' },
  Avatar: { quality: 'balanced', maxColors: 96, dither: true, scalePercent: 100, loopMode: 'forever' },
}

export function ExportPanel() {
  const project = useProjectStore((s) => s.project)
  const setExportSettings = useProjectStore((s) => s.setExportSettings)
  const advancedMode = useEditorStore((s) => s.advancedMode)
  const currentFrameIndex = usePlaybackStore((s) => s.currentFrameIndex)
  const startJob = useJobStore((s) => s.startJob)
  const updateJob = useJobStore((s) => s.updateJob)
  const completeJob = useJobStore((s) => s.completeJob)
  const failJob = useJobStore((s) => s.failJob)

  const [exporting, setExporting] = useState(false)
  const [staticFormat, setStaticFormat] = useState<'png' | 'jpeg'>('png')

  if (!project) return null
  const settings = project.exportSettings

  function patch(p: Partial<ExportSettings>) {
    setExportSettings(p)
  }

  async function exportGif() {
    if (!project) return
    setExporting(true)
    const id = startJob('export', 'Preparing export…', true)
    try {
      const pipeline = getPipeline()
      const bytes = await pipeline.exportGif(
        project.edits,
        project.layers,
        project.exportSettings,
        proxyProgress((fraction, message) => updateJob(id, { progress: fraction, message })),
      )
      downloadBytes(bytes, `${project.metadata.name}.gif`, 'image/gif')
      completeJob(id)
    } catch (err) {
      failJob(id, err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  function cancelExport() {
    getPipeline().cancel()
  }

  async function exportStaticFrame() {
    if (!project) return
    const id = startJob('static-export', 'Rendering frame…')
    try {
      const bytes = await getPipeline().exportStaticFrame(project.edits, project.layers, currentFrameIndex, staticFormat)
      downloadBytes(bytes, `${project.metadata.name}-frame-${currentFrameIndex + 1}.${staticFormat}`, `image/${staticFormat}`)
      completeJob(id)
    } catch (err) {
      failJob(id, err instanceof Error ? err.message : 'Frame export failed.')
    }
  }

  return (
    <div>
      <Section title="Presets">
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(EXPORT_PRESETS).map(([name, values]) => (
            <button
              key={name}
              onClick={() => patch(values)}
              className="rounded bg-surface-3 px-2 py-1 text-[11px] text-slate-200 hover:bg-surface-4"
            >
              {name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Loop">
        <Select
          label="Mode"
          value={settings.loopMode}
          onChange={(v) => patch({ loopMode: v as LoopMode })}
          options={[
            { value: 'forever', label: 'Loop forever' },
            { value: 'none', label: 'Do not loop' },
            { value: 'custom', label: 'Custom count' },
          ]}
        />
        {settings.loopMode === 'custom' && (
          <NumberField
            label="Repeat count"
            value={settings.customLoopCount}
            min={1}
            onChange={() => {}}
            onCommit={(v) => patch({ customLoopCount: v })}
          />
        )}
      </Section>

      {advancedMode && (
        <Section title="Advanced">
          <NumberField label="Max colors" value={settings.maxColors} min={2} max={256} onChange={() => {}} onCommit={(v) => patch({ maxColors: v })} />
          <Checkbox label="Dithering" checked={settings.dither} onChange={(v) => patch({ dither: v })} />
          <NumberField label="Scale" value={settings.scalePercent} min={10} max={100} suffix="%" onChange={() => {}} onCommit={(v) => patch({ scalePercent: v })} />
          <label className="flex flex-col gap-1 text-xs text-slate-300">
            <span className="text-slate-400">Frame range (blank = all)</span>
            <input
              className="rounded border border-surface-border bg-surface-2 px-2 py-1 text-slate-100 outline-none focus:border-accent"
              placeholder={`1-${project.edits.frameOrder.length}`}
              value={settings.frameRange}
              onChange={(e) => patch({ frameRange: e.target.value })}
            />
          </label>
        </Section>
      )}

      <Section title="Export">
        {!exporting ? (
          <Button variant="primary" onClick={exportGif}>
            Export GIF
          </Button>
        ) : (
          <Button variant="danger" onClick={cancelExport}>
            Cancel export
          </Button>
        )}
      </Section>

      <Section title="Static frame export">
        <Select
          label="Format"
          value={staticFormat}
          onChange={(v) => setStaticFormat(v as 'png' | 'jpeg')}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' },
          ]}
        />
        <Button onClick={exportStaticFrame}>Export current frame ({currentFrameIndex + 1})</Button>
      </Section>
    </div>
  )
}
