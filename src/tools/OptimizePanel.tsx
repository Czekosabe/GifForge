import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { usePlaybackStore } from '../state/playbackStore'
import { useJobStore } from '../state/jobStore'
import { getPipeline, proxyProgress } from '../workers/client'
import { downloadBytes } from '../utils/download'
import { Section, Button, Checkbox } from '../components/ui/Section'
import { NumberField } from '../components/ui/NumberField'
import { BeforeAfterCompare } from './BeforeAfterCompare'
import { useOptimizeComparison, type OptimizeResultData } from './useOptimizeComparison'
import type { OptimizationSettings, Project } from '../types/project'

const TARGET_PRESETS_KB = [256, 512, 1024, 2048, 5120]

export function OptimizePanel() {
  const project = useProjectStore((s) => s.project)
  const sourceBlob = useProjectStore((s) => s.sourceBlob)
  const setOptimizationSettings = useProjectStore((s) => s.setOptimizationSettings)
  const currentFrameIndex = usePlaybackStore((s) => s.currentFrameIndex)
  const startJob = useJobStore((s) => s.startJob)
  const updateJob = useJobStore((s) => s.updateJob)
  const completeJob = useJobStore((s) => s.completeJob)
  const failJob = useJobStore((s) => s.failJob)

  const [result, setResult] = useState<OptimizeResultData | null>(null)
  const [running, setRunning] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  // The Project this result was produced from — if the project changes afterward (further
  // edits, different optimize settings, a New Project), the result no longer describes the
  // current project and must not keep looking current. See useEffect below.
  const resultProjectRef = useRef<Project | null>(null)

  const comparison = useOptimizeComparison(result, sourceBlob)

  useEffect(() => {
    if (resultProjectRef.current && resultProjectRef.current !== project) {
      setResult(null)
      resultProjectRef.current = null
    }
  }, [project])

  if (!project) return null
  const settings = project.optimizationSettings

  function patch(p: Partial<OptimizationSettings>) {
    setOptimizationSettings(p)
  }

  async function run() {
    if (!project) return
    setRunning(true)
    setResult(null)
    resultProjectRef.current = null
    const id = startJob('optimize', 'Optimizing…', true)
    setJobId(id)
    try {
      const pipeline = getPipeline()
      const res = await pipeline.optimize(
        project.edits,
        project.layers,
        project.optimizationSettings,
        proxyProgress((fraction, message) => updateJob(id, { progress: fraction, message })),
      )
      setResult(res)
      resultProjectRef.current = project
      completeJob(id)
    } catch (err) {
      // A user-initiated cancel already set this job to 'cancelled' (see cancel() below);
      // the abort then makes the pending pipeline call reject too. Don't let that turn a
      // clean cancellation into a red "failed" toast.
      if (useJobStore.getState().jobs.find((j) => j.id === id)?.status !== 'cancelled') {
        failJob(id, err instanceof Error ? err.message : 'Optimization failed.')
      }
    } finally {
      setRunning(false)
      setJobId(null)
    }
  }

  function cancel() {
    getPipeline().cancel()
    if (jobId) useJobStore.getState().cancelJob(jobId)
  }

  return (
    <div>
      <Section title="Preset">
        <div className="grid grid-cols-2 gap-1">
          {(['light', 'balanced', 'aggressive', 'target-size'] as const).map((p) => (
            <button
              key={p}
              onClick={() => patch({ preset: p })}
              className={`rounded px-2 py-1.5 text-[11px] capitalize ${
                settings.preset === p ? 'bg-accent text-white' : 'bg-surface-3 text-slate-200 hover:bg-surface-4'
              }`}
            >
              {p.replace('-', ' ')}
            </button>
          ))}
        </div>
      </Section>

      {settings.preset === 'target-size' && (
        <Section title="Target size">
          <div className="grid grid-cols-3 gap-1">
            {TARGET_PRESETS_KB.map((kb) => (
              <button
                key={kb}
                onClick={() => patch({ targetSizeBytes: kb * 1024 })}
                className={`rounded px-2 py-1 text-[11px] ${
                  settings.targetSizeBytes === kb * 1024 ? 'bg-accent text-white' : 'bg-surface-3 text-slate-200 hover:bg-surface-4'
                }`}
              >
                {kb >= 1024 ? `${kb / 1024}MB` : `${kb}KB`}
              </button>
            ))}
          </div>
          <NumberField
            label="Custom (KB)"
            value={settings.targetSizeBytes ? Math.round(settings.targetSizeBytes / 1024) : 512}
            min={16}
            onChange={() => {}}
            onCommit={(kb) => patch({ targetSizeBytes: kb * 1024 })}
          />
          <Checkbox label="Keep dimensions" checked={settings.keepDimensions} onChange={(v) => patch({ keepDimensions: v })} />
          <Checkbox label="Allow FPS reduction" checked={settings.allowFpsReduction} onChange={(v) => patch({ allowFpsReduction: v })} />
          <Checkbox label="Allow frame dropping" checked={settings.allowFrameDropping} onChange={(v) => patch({ allowFrameDropping: v })} />
          <Checkbox
            label="Allow resolution reduction"
            checked={settings.allowResolutionReduction}
            onChange={(v) => patch({ allowResolutionReduction: v })}
          />
        </Section>
      )}

      {settings.preset === 'custom' && (
        <Section title="Custom settings">
          <NumberField label="Max colors" value={settings.maxColors} min={2} max={256} onChange={() => {}} onCommit={(v) => patch({ maxColors: v })} />
          <Checkbox label="Dithering" checked={settings.dither} onChange={(v) => patch({ dither: v })} />
          <NumberField label="Scale" value={settings.scalePercent} min={10} max={100} suffix="%" onChange={() => {}} onCommit={(v) => patch({ scalePercent: v })} />
        </Section>
      )}

      <Section title="Run">
        {!running ? (
          <Button variant="primary" onClick={run}>
            Run optimization
          </Button>
        ) : (
          <Button variant="danger" onClick={cancel}>
            Cancel
          </Button>
        )}
      </Section>

      {result && (
        <Section title="Before / After">
          <p className={`text-[11px] ${result.achievedTarget ? 'text-emerald-400' : 'text-amber-400'}`}>{result.message}</p>

          {comparison.status === 'loading' && <p className="text-xs text-slate-400">Preparing visual comparison…</p>}
          {comparison.status === 'error' && (
            <p className="text-xs text-amber-400">
              Couldn't prepare the visual comparison ({comparison.error}) — the download below is still the real optimized file.
            </p>
          )}
          {comparison.status === 'ready' && comparison.original && comparison.optimized && (
            <BeforeAfterCompare original={comparison.original} optimized={comparison.optimized} currentEditorFrameIndex={currentFrameIndex} />
          )}

          <Button variant="primary" onClick={() => downloadBytes(result.bytes, `${project.metadata.name}-optimized.gif`, 'image/gif')}>
            Download optimized GIF
          </Button>
        </Section>
      )}
    </div>
  )
}
