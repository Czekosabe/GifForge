import { quantize as gifencQuantize } from 'gifenc'

export type PaletteColor = [number, number, number] | [number, number, number, number]

const ALPHA_THRESHOLD = 128

/** Whether any pixel in the buffer has meaningful transparency. */
export function hasTransparency(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! < ALPHA_THRESHOLD) return true
  }
  return false
}

export interface BuildPaletteOptions {
  maxColors: number
  /** Cap on total sampled pixels across all frames, to bound quantization cost. */
  sampleBudget?: number
}

/**
 * Builds one shared palette from a representative sample of pixels across all frames,
 * so the encoded GIF doesn't flicker between visually-similar frames using different
 * per-frame palettes.
 */
export function buildGlobalPalette(
  frames: Uint8ClampedArray[],
  options: BuildPaletteOptions,
): { palette: PaletteColor[]; format: 'rgb565' | 'rgba4444'; transparent: boolean } {
  const transparent = frames.some(hasTransparency)
  const format = transparent ? 'rgba4444' : 'rgb565'
  const sampleBudget = options.sampleBudget ?? 400_000
  const pixelsPerFrameBudget = Math.max(1000, Math.floor(sampleBudget / Math.max(1, frames.length)))

  const sampled: number[] = []
  for (const frame of frames) {
    const totalPixels = frame.length / 4
    const step = Math.max(1, Math.floor(totalPixels / pixelsPerFrameBudget))
    for (let p = 0; p < totalPixels; p += step) {
      const idx = p * 4
      sampled.push(frame[idx]!, frame[idx + 1]!, frame[idx + 2]!, frame[idx + 3]!)
    }
  }

  const sampleBuffer = Uint8ClampedArray.from(sampled)
  const palette = gifencQuantize(sampleBuffer, options.maxColors, {
    format,
    oneBitAlpha: transparent,
  }) as PaletteColor[]

  return { palette, format, transparent }
}

/**
 * Maps a full RGBA frame onto a fixed palette using Floyd-Steinberg error diffusion,
 * producing higher perceived quality than nearest-color mapping alone (avoids banding).
 * Pixels below the alpha threshold are mapped directly to the transparent index without
 * diffusing color error (GIF transparency is binary, not partial).
 */
/**
 * A nearest-color lookup cache keyed by a coarsely-quantized RGB bucket. Real frames
 * (and animations across frames sharing a palette) have vastly fewer distinct
 * near-colors than pixels — without this, dithering a 400x400 frame against a
 * 256-color palette does up to ~160,000 * 256 = 41M distance comparisons *per frame*,
 * which multiplies into a genuinely slow (multi-second-per-attempt) bottleneck for
 * the target-size search's up-to-24 real encode attempts. Reusing one cache across
 * every frame in an encode (they all share the same global palette) turns that into
 * effectively O(unique colors) instead of O(pixels), a very large real speedup.
 */
export type NearestColorCache = Map<number, number>

export function createNearestColorCache(): NearestColorCache {
  return new Map()
}

function bucketKey(r: number, g: number, b: number): number {
  // 5 bits per channel (32 levels) — fine enough that cache misses are rare on
  // real images, coarse enough that the cache itself stays small and fast.
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
}

export function ditherFrameToPalette(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  palette: PaletteColor[],
  transparentIndex: number,
  strength: number,
  cache: NearestColorCache = createNearestColorCache(),
): Uint8Array {
  const working = Float32Array.from(rgba)
  const indices = new Uint8Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = y * width + x
      const bufIdx = pixelIdx * 4
      const alpha = working[bufIdx + 3]!

      if (alpha < ALPHA_THRESHOLD) {
        indices[pixelIdx] = transparentIndex
        continue
      }

      const r = clamp8(working[bufIdx]!)
      const g = clamp8(working[bufIdx + 1]!)
      const b = clamp8(working[bufIdx + 2]!)

      const key = bucketKey(r, g, b)
      let colorIndex = cache.get(key)
      if (colorIndex === undefined) {
        colorIndex = nearestOpaqueColorIndex(r, g, b, palette, transparentIndex)
        cache.set(key, colorIndex)
      }
      indices[pixelIdx] = colorIndex

      if (strength <= 0) continue

      const chosen = palette[colorIndex]!
      const errR = (r - chosen[0]) * strength
      const errG = (g - chosen[1]) * strength
      const errB = (b - chosen[2]) * strength

      diffuseError(working, width, height, x, y, 1, 0, 7 / 16, errR, errG, errB)
      diffuseError(working, width, height, x, y, -1, 1, 3 / 16, errR, errG, errB)
      diffuseError(working, width, height, x, y, 0, 1, 5 / 16, errR, errG, errB)
      diffuseError(working, width, height, x, y, 1, 1, 1 / 16, errR, errG, errB)
    }
  }

  return indices
}

function diffuseError(
  buf: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  weight: number,
  errR: number,
  errG: number,
  errB: number,
): void {
  const nx = x + dx
  const ny = y + dy
  if (nx < 0 || nx >= width || ny < 0 || ny >= height) return
  const idx = (ny * width + nx) * 4
  buf[idx] = buf[idx]! + errR * weight
  buf[idx + 1] = buf[idx + 1]! + errG * weight
  buf[idx + 2] = buf[idx + 2]! + errB * weight
}

function nearestOpaqueColorIndex(
  r: number,
  g: number,
  b: number,
  palette: PaletteColor[],
  skipIndex: number,
): number {
  let bestIndex = 0
  let bestDist = Infinity
  for (let i = 0; i < palette.length; i++) {
    if (i === skipIndex) continue
    const [pr, pg, pb] = palette[i]!
    const dr = pr - r
    const dg = pg - g
    const db = pb - b
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      bestIndex = i
    }
  }
  return bestIndex
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/** Finds the palette index closest to fully-transparent, for use as the GIF transparent color. */
export function findTransparentIndex(palette: PaletteColor[]): number {
  let bestIndex = 0
  let bestAlpha = 255
  for (let i = 0; i < palette.length; i++) {
    const color = palette[i]!
    const alpha = color.length === 4 ? color[3] : 255
    if (alpha < bestAlpha) {
      bestAlpha = alpha
      bestIndex = i
    }
  }
  return bestIndex
}
