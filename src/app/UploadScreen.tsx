import { useCallback, useRef, useState } from 'react'
import { useLoadGif } from './useLoadGif'
import { useJobStore } from '../state/jobStore'

export function UploadScreen() {
  const { loadFile } = useLoadGif()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const jobs = useJobStore((s) => s.jobs)
  const activeLoadJob = jobs.find((j) => j.type === 'load' && j.status === 'running')

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      setError(null)
      try {
        await loadFile(file)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load GIF.')
      }
    },
    [loadFile],
  )

  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-0">
      <div
        className={`flex w-[480px] flex-col items-center gap-4 rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          isDragging ? 'border-accent bg-accent-muted/20' : 'border-surface-border'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          handleFile(e.dataTransfer.files[0])
        }}
      >
        <div className="text-3xl font-bold text-slate-100">
          Gif<span className="text-accent">Forge</span>
        </div>
        <p className="text-sm text-slate-400">Edit. Optimize. Export.</p>

        {activeLoadJob ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-sm text-slate-300">{activeLoadJob.message}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">Drag and drop a .gif file here, or</p>
            <button
              className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              onClick={() => inputRef.current?.click()}
            >
              Choose a GIF file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/gif,.gif"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </>
        )}

        {error && <p className="max-w-sm text-xs text-red-400">{error}</p>}

        <p className="mt-4 max-w-sm text-[11px] leading-relaxed text-slate-600">
          Everything runs locally in your browser. Your GIF is never uploaded anywhere.
        </p>
      </div>
    </div>
  )
}
