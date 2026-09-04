export type JobType =
  | 'load'
  | 'decode'
  | 'thumbnails'
  | 'render'
  | 'optimize'
  | 'target-size'
  | 'encode'
  | 'export'
  | 'export-video'
  | 'static-export'

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Job {
  id: string
  type: JobType
  status: JobStatus
  /** 0..1, or null when progress cannot be determined (use an indeterminate indicator). */
  progress: number | null
  message: string
  error: string | null
  cancellable: boolean
}
