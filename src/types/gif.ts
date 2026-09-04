/** A single fully-composited animation frame, decoded from source GIF data. */
export interface DecodedFrame {
  /** Frame delay in milliseconds (already converted from GIF's 1/100s units). */
  delayMs: number
  /** GIF disposal method as read from the source, kept for diagnostics only — composition already applied. */
  disposalType: number
}

export interface GifMetadata {
  width: number
  height: number
  frameCount: number
  /** 0 = loop forever, -1 = no loop, N = loop N additional times. */
  loopCount: number
  /** Sum of all frame delays, in milliseconds. */
  durationMs: number
  /** Original compressed file size in bytes. */
  fileSizeBytes: number
  fileName: string
}

/** Raw per-frame pixel data, always full-canvas RGBA (post-disposal composition). */
export interface CompositedFrame {
  rgba: Uint8ClampedArray
  delayMs: number
}

export interface GifDecodeResult {
  metadata: GifMetadata
  frames: CompositedFrame[]
}
