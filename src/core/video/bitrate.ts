import type { VideoQualityPreset } from './types'

const MIN_BITRATE = 200_000 // 200 kbps — below this, video becomes unwatchable regardless of content
const MAX_BITRATE = 20_000_000 // 20 Mbps — well above what a GIF-sourced animation ever needs

// Bits per pixel per second, at each preset — deliberately not "one hard-coded bitrate for
// all files" (that was explicitly called out as wrong): scales with real pixel throughput
// (width * height * effective fps), so a small sticker and a large, fast animation don't get
// the same number.
const BITS_PER_PIXEL_PER_SECOND: Record<VideoQualityPreset, number> = {
  high: 0.12,
  balanced: 0.07,
  small: 0.04,
}

/**
 * Estimates a reasonable target bitrate from real output characteristics — never presented
 * as an exact visual-quality guarantee, just a sane starting point clamped to safe bounds.
 */
export function computeBitrate(width: number, height: number, effectiveFps: number, preset: VideoQualityPreset): number {
  const pixelsPerSecond = Math.max(1, width) * Math.max(1, height) * Math.max(1, effectiveFps)
  const raw = pixelsPerSecond * BITS_PER_PIXEL_PER_SECOND[preset]
  return Math.round(Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, raw)))
}

export function clampCustomBitrate(bitrate: number): number {
  return Math.round(Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, bitrate)))
}
