import { create } from 'zustand'

interface PlaybackState {
  isPlaying: boolean
  currentFrameIndex: number
  frameCount: number

  play: () => void
  pause: () => void
  toggle: () => void
  setCurrentFrameIndex: (index: number) => void
  setFrameCount: (count: number) => void
  restart: () => void
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  isPlaying: false,
  currentFrameIndex: 0,
  frameCount: 0,

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  toggle: () => set({ isPlaying: !get().isPlaying }),
  setCurrentFrameIndex: (currentFrameIndex) => set({ currentFrameIndex }),
  setFrameCount: (frameCount) => set({ frameCount, currentFrameIndex: Math.min(get().currentFrameIndex, Math.max(0, frameCount - 1)) }),
  restart: () => set({ currentFrameIndex: 0 }),
}))
