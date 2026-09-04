import { useEffect, useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useEditorStore } from '../state/editorStore'
import { usePlaybackStore } from '../state/playbackStore'
import { useJobStore } from '../state/jobStore'
import { getPipeline, proxyProgress } from '../workers/client'
import { downloadBytes } from '../utils/download'
import { Section, Button, Select, Checkbox } from '../components/ui/Section'
import { NumberField } from '../components/ui/NumberField'
import type { ExportSettings, LoopMode } from '../types/project'
import type { VideoCodecSupport, VideoExportFormat, VideoExportOptions, VideoQualityPreset } from '../core/video/types'
import { computeScaledPaddedDimensions } from '../core/video/dimensions'

const EXPORT_PRESETS: Record<string, Partial<ExportSettings>> = {
  'Best Quality': { quality: 'best', maxColors: 256, dither: true, scalePercent: 100 },
  'Small File Size': { quality: 'small', maxColors: 64, dither: true, scalePercent: 100 },
  Discord: { quality: 'balanced', maxColors: 128, dither: true, scalePercent: 100, loopMode: 'forever' },
  'Social Media': { quality: 'balanced', maxColors: 128, dither: true, scalePercent: 100, loopMode: 'forever' },
  Website: { quality: 'small', maxColors: 96, dither: true, scalePercent: 100, loopMode: 'forever' },
  'Sticker / Emoji': { quality: 'balanced', maxColors: 64, dither: false, scalePercent: 100, loopMode: 'forever' },
  Avatar: { quality: 'balanced', maxColors: 96, dither: true, scalePercent: 100, loopMode: 'forever' },
}

const VIDEO_QUALITY_PRESETS: { value: VideoQualityPreset; label: string }[] = [
  { value: 'high', label: 'High Quality' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'small', label: 'Small File' },
]

/** Strips only characters that are genuinely unsafe across common filesystems — everything
 * else, including non-ASCII/Unicode, is preserved. */
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|]/g, '_').trim()
  return cleaned.length > 0 ? cleaned : 'export'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return { r: 0, g: 0, b: 0 }
  return { r: parseInt(match[1]!, 16), g: parseInt(match[2]!, 16), b: parseInt(match[3]!, 16) }
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

  const [format, setFormat] = useState<'gif' | VideoExportFormat>('gif')
  const [exporting, setExporting] = useState(false)
  const [staticFormat, setStaticFormat] = useState<'png' | 'jpeg'>('png')
  const [jobId, setJobId] = useState<string | null>(null)
  const [padNotice, setPadNotice] = useState<string | null>(null)

  // Video-specific settings — deliberately local component state, not part of the persisted
  // Project/undo-history: GIF's exportSettings is part of Project because it predates this
  // feature and was already established that way; video export is new, additive, and doesn't
  // need undo/autosave tracking to be useful, so it mirrors the existing `staticFormat`
  // local-state pattern instead of expanding the Project schema for this session's scope.
  const [videoQuality, setVideoQuality] = useState<VideoQualityPreset>('balanced')
  const [videoScalePercent, setVideoScalePercent] = useState(100)
  const [backgroundPreset, setBackgroundPreset] = useState<'black' | 'white' | 'custom'>('black')
  const [customBackgroundHex, setCustomBackgroundHex] = useState('#000000')
  const [customBitrateKbps, setCustomBitrateKbps] = useState<number | null>(null)
  const [codecSupport, setCodecSupport] = useState<VideoCodecSupport | null>(null)
  const [checkingSupport, setCheckingSupport] = useState(false)

  useEffect(() => {
    if (format === 'gif' || !project) {
      setCodecSupport(null)
      return
    }
    let cancelled = false
    setCheckingSupport(true)
    setCodecSupport(null)
    async function check() {
      const pipeline = getPipeline()
      const { width, height } = await pipeline.getOutputDimensions(project!.edits)
      // Probe at the size the export will actually encode at (post-scale, post-pad) — probing
      // the pre-scale source size could show "unavailable" for a large source even when the
      // user's chosen scale-down would bring it within the codec's real resolution limit.
      const { width: scaledWidth, height: scaledHeight } = computeScaledPaddedDimensions(width, height, videoScalePercent)
      const { detectVideoCodecSupport } = await import('../core/video/capabilities')
      const support = await detectVideoCodecSupport(scaledWidth, scaledHeight)
      if (!cancelled) {
        setCodecSupport(support)
        setCheckingSupport(false)
      }
    }
    check().catch(() => {
      if (!cancelled) setCheckingSupport(false)
    })
    return () => {
      cancelled = true
    }
    // Re-checking only when the format tab, project, or scale changes is intentional — this is
    // a one-time-per-selection capability probe, not something that should re-run on every
    // unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, project?.edits, videoScalePercent])

  if (!project) return null
  const settings = project.exportSettings

  function patch(p: Partial<ExportSettings>) {
    setExportSettings(p)
  }

  function currentBackground(): { r: number; g: number; b: number } {
    if (backgroundPreset === 'black') return { r: 0, g: 0, b: 0 }
    if (backgroundPreset === 'white') return { r: 255, g: 255, b: 255 }
    return hexToRgb(customBackgroundHex)
  }

  async function exportGif() {
    if (!project) return
    setExporting(true)
    const id = startJob('export', 'Preparing export…', true)
    setJobId(id)
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
      // A user-initiated cancel already set this job to 'cancelled' (see cancelExport()
      // below); the abort then makes this pending call reject too. Don't let that turn a
      // clean cancellation into a red "failed" toast.
      if (useJobStore.getState().jobs.find((j) => j.id === id)?.status !== 'cancelled') {
        failJob(id, err instanceof Error ? err.message : 'Export failed.')
      }
    } finally {
      setExporting(false)
      setJobId(null)
    }
  }

  async function exportVideoFile(videoFormat: VideoExportFormat) {
    if (!project) return
    setExporting(true)
    setPadNotice(null)
    const id = startJob('export-video', 'Preparing export…', true)
    setJobId(id)
    try {
      const pipeline = getPipeline()
      const options: VideoExportOptions = {
        format: videoFormat,
        quality: videoQuality,
        frameRange: '',
        scalePercent: videoScalePercent,
        background: currentBackground(),
        customBitrate: customBitrateKbps ? customBitrateKbps * 1000 : null,
      }
      const result = await pipeline.exportVideo(
        project.edits,
        project.layers,
        options,
        proxyProgress((fraction, message) => updateJob(id, { progress: fraction, message })),
      )
      downloadBytes(
        result.bytes,
        `${sanitizeFilename(project.metadata.name)}.${videoFormat}`,
        videoFormat === 'mp4' ? 'video/mp4' : 'video/webm',
      )
      if (result.padded) {
        setPadNotice(
          `Output was padded to ${result.width}×${result.height} — this codec requires even dimensions.`,
        )
      }
      completeJob(id)
    } catch (err) {
      if (useJobStore.getState().jobs.find((j) => j.id === id)?.status !== 'cancelled') {
        failJob(id, err instanceof Error ? err.message : 'Video export failed.')
      }
    } finally {
      setExporting(false)
      setJobId(null)
    }
  }

  function cancelExport() {
    getPipeline().cancel()
    if (jobId) useJobStore.getState().cancelJob(jobId)
  }

  function handleExportClick() {
    if (format === 'gif') {
      exportGif()
    } else {
      exportVideoFile(format)
    }
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
      <Section title="Format">
        <div className="grid grid-cols-3 gap-1">
          {(['gif', 'mp4', 'webm'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`rounded px-2 py-1.5 text-[11px] uppercase ${
                format === f ? 'bg-accent text-white' : 'bg-surface-3 text-slate-200 hover:bg-surface-4'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </Section>

      {format === 'gif' && (
        <>
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
        </>
      )}

      {(format === 'mp4' || format === 'webm') && (
        <>
          <Section title="Support">
            {checkingSupport && <p className="text-xs text-slate-400">Checking browser support…</p>}
            {!checkingSupport && codecSupport && (
              <p className={`text-xs ${codecSupport[format].available ? 'text-emerald-400' : 'text-amber-400'}`}>
                {format.toUpperCase()}: {codecSupport[format].available ? 'Available' : (codecSupport[format].reason ?? 'Unavailable in this browser')}
              </p>
            )}
            {advancedMode && !checkingSupport && codecSupport?.[format].available && (
              <p className="text-[10px] text-slate-500">Codec: {codecSupport[format].codec}</p>
            )}
            <p className="text-[10px] text-slate-500">Video only — no audio.</p>
          </Section>

          <Section title="Quality">
            <div className="grid grid-cols-3 gap-1">
              {VIDEO_QUALITY_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setVideoQuality(p.value)}
                  className={`rounded px-2 py-1.5 text-[11px] ${
                    videoQuality === p.value ? 'bg-accent text-white' : 'bg-surface-3 text-slate-200 hover:bg-surface-4'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <NumberField
              label="Scale"
              value={videoScalePercent}
              min={10}
              max={100}
              suffix="%"
              onChange={() => {}}
              onCommit={setVideoScalePercent}
            />
          </Section>

          <Section title="Background">
            <div className="grid grid-cols-3 gap-1">
              {(['black', 'white', 'custom'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBackgroundPreset(b)}
                  className={`rounded px-2 py-1.5 text-[11px] capitalize ${
                    backgroundPreset === b ? 'bg-accent text-white' : 'bg-surface-3 text-slate-200 hover:bg-surface-4'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
            {backgroundPreset === 'custom' && (
              <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
                <span className="text-slate-400">Color</span>
                <input
                  type="color"
                  value={customBackgroundHex}
                  onChange={(e) => setCustomBackgroundHex(e.target.value)}
                  className="h-7 w-14 rounded border border-surface-border bg-surface-2"
                />
              </label>
            )}
            <p className="text-[10px] text-slate-500">
              Transparent pixels are composited onto this background — video formats don't reliably support
              transparency.
            </p>
          </Section>

          {advancedMode && (
            <Section title="Advanced">
              <NumberField
                label="Bitrate (kbps, blank = auto)"
                value={customBitrateKbps ?? 0}
                min={0}
                onChange={() => {}}
                onCommit={(v) => setCustomBitrateKbps(v > 0 ? v : null)}
              />
            </Section>
          )}
        </>
      )}

      <Section title="Export">
        {!exporting ? (
          <Button
            variant="primary"
            onClick={handleExportClick}
            disabled={(format === 'mp4' || format === 'webm') && codecSupport !== null && !codecSupport[format].available}
          >
            Export {format.toUpperCase()}
          </Button>
        ) : (
          <Button variant="danger" onClick={cancelExport}>
            Cancel export
          </Button>
        )}
        {padNotice && <p className="text-[11px] text-amber-400">{padNotice}</p>}
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
