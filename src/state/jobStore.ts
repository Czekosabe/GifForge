import { create } from 'zustand'
import { nanoid } from '../utils/nanoid'
import type { Job, JobType } from '../types/jobs'

interface JobState {
  jobs: Job[]
  startJob: (type: JobType, message: string, cancellable?: boolean) => string
  updateJob: (id: string, patch: Partial<Pick<Job, 'progress' | 'message'>>) => void
  completeJob: (id: string) => void
  failJob: (id: string, error: string) => void
  cancelJob: (id: string) => void
  dismissJob: (id: string) => void
}

export const useJobStore = create<JobState>((set) => ({
  jobs: [],

  startJob: (type, message, cancellable = false) => {
    const id = nanoid()
    const job: Job = { id, type, status: 'running', progress: null, message, error: null, cancellable }
    set((s) => ({ jobs: [...s.jobs, job] }))
    return id
  },

  updateJob: (id, patch) =>
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),

  completeJob: (id) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: 'completed', progress: 1 } : j)),
    })),

  failJob: (id, error) =>
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: 'failed', error } : j)) })),

  cancelJob: (id) =>
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: 'cancelled' } : j)) })),

  dismissJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
}))
