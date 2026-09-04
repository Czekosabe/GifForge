import type { VideoCodecSupport } from './types'

/**
 * Real runtime capability probing via mediabunny's `canEncodeVideo` (itself a thin,
 * consistently-keyed wrapper around `VideoEncoder.isConfigSupported`) — never assumed from
 * `"VideoEncoder" in window` alone, since codec availability varies by browser/platform even
 * when the API itself exists. Dynamically imported so merely checking capability (e.g. when
 * the user selects the MP4/WebM format in the Export panel) doesn't pull in the muxer code
 * that only matters once an export actually runs.
 *
 * MP4 prefers H.264/AVC (the only broadly-supported MP4-compatible WebCodecs codec); WebM
 * prefers VP9, falling back to VP8 if VP9 encoding specifically is unavailable. Never
 * substitutes a different container/codec than what was actually probed.
 */
export async function detectVideoCodecSupport(width: number, height: number): Promise<VideoCodecSupport> {
  const { canEncodeVideo, Quality } = await import('mediabunny')
  const quality = new Quality('medium')

  const avcOk = await canEncodeVideo('avc', { width, height, quality }).catch(() => false)
  const vp9Ok = await canEncodeVideo('vp9', { width, height, quality }).catch(() => false)
  const vp8Ok = vp9Ok ? false : await canEncodeVideo('vp8', { width, height, quality }).catch(() => false)

  return {
    mp4: avcOk
      ? { available: true, codec: 'avc', reason: null }
      : { available: false, codec: null, reason: 'This browser cannot encode H.264/AVC video.' },
    webm: vp9Ok
      ? { available: true, codec: 'vp9', reason: null }
      : vp8Ok
        ? { available: true, codec: 'vp8', reason: null }
        : { available: false, codec: null, reason: 'This browser cannot encode VP9 or VP8 video.' },
  }
}
