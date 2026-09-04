export type VideoExportFormat = 'mp4' | 'webm'

export type VideoQualityPreset = 'high' | 'balanced' | 'small'

/** The actual codec mediabunny will use, decided by runtime capability probing —
 * never assumed. `null` means the format is unavailable in this browser. */
export type Mp4VideoCodec = 'avc'
export type WebmVideoCodec = 'vp9' | 'vp8'

export interface VideoFormatSupport<TCodec extends string> {
  available: boolean
  codec: TCodec | null
  /** Present only when `available` is false — why, in plain language. */
  reason: string | null
}

export interface VideoCodecSupport {
  mp4: VideoFormatSupport<Mp4VideoCodec>
  webm: VideoFormatSupport<WebmVideoCodec>
}

export interface VideoExportOptions {
  format: VideoExportFormat
  quality: VideoQualityPreset
  /** Frame range subset, same syntax as GIF export's — blank means all frames. */
  frameRange: string
  scalePercent: number
  /** Composited background for transparent pixels — video codecs don't reliably support
   * alpha, so this is applied once during render, not left to chance. */
  background: { r: number; g: number; b: number }
  /** Only used when `quality` doesn't apply (kept simple: Advanced-mode override). */
  customBitrate: number | null
}

export interface VideoExportResult {
  bytes: Uint8Array
  width: number
  height: number
  /** True if 1px was added to a dimension to satisfy the codec's even-dimension requirement. */
  padded: boolean
  durationMs: number
  codec: string
}
