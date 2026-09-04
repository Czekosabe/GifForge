import { useJobStore } from '../state/jobStore'

export function JobStatusBar() {
  const jobs = useJobStore((s) => s.jobs)
  const dismissJob = useJobStore((s) => s.dismissJob)
  const visible = jobs.filter((j) => j.status === 'running' || j.status === 'failed')

  if (visible.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {visible.map((job) => (
        <div
          key={job.id}
          className={`pointer-events-auto flex w-72 flex-col gap-1 rounded-lg border px-3 py-2 text-xs shadow-lg ${
            job.status === 'failed' ? 'border-red-800 bg-red-950/90 text-red-200' : 'border-surface-border bg-surface-2 text-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="capitalize">{job.type.replace('-', ' ')}</span>
            {job.status === 'failed' && (
              <button onClick={() => dismissJob(job.id)} className="text-red-300 hover:text-red-100">
                ✕
              </button>
            )}
          </div>
          <p>{job.status === 'failed' ? job.error : job.message}</p>
          {job.status === 'running' && (
            <div className="h-1 w-full overflow-hidden rounded bg-surface-3">
              {job.progress === null ? (
                <div className="h-full w-1/3 animate-pulse rounded bg-accent" />
              ) : (
                <div className="h-full rounded bg-accent transition-all" style={{ width: `${Math.round(job.progress * 100)}%` }} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
