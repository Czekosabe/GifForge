/**
 * gifenc ships no TypeScript declarations. This covers only the surface GifForge
 * actually uses (see src/core/gif/encoder.ts and quantize.ts).
 */
declare module 'gifenc' {
  export type RGB = [number, number, number]
  export type RGBA = [number, number, number, number]
  export type PaletteColor = RGB | RGBA

  export interface QuantizeOptions {
    format?: 'rgb565' | 'rgb444' | 'rgba4444'
    oneBitAlpha?: boolean | number
    clearAlpha?: boolean
    clearAlphaThreshold?: number
    clearAlphaColor?: number
  }

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): PaletteColor[]

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: PaletteColor[],
    format?: 'rgb565' | 'rgb444' | 'rgba4444',
  ): Uint8Array

  export interface WriteFrameOptions {
    palette?: PaletteColor[]
    first?: boolean
    transparent?: boolean
    transparentIndex?: number
    delay?: number
    repeat?: number
    dispose?: number
  }

  export interface GIFEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: WriteFrameOptions): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    writeHeader(): void
    reset(): void
    buffer: ArrayBuffer
  }

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GIFEncoderInstance

  export function nearestColorIndex(colors: PaletteColor[], pixel: number[], distanceFn?: (a: unknown, b: unknown) => number): number
  export function nearestColor(colors: PaletteColor[], pixel: number[], distanceFn?: (a: unknown, b: unknown) => number): PaletteColor
  export function snapColorsToPalette(palette: PaletteColor[], knownColors: PaletteColor[], threshold?: number): void
  export function prequantize(rgba: Uint8ClampedArray, opts?: { roundRGB?: number; roundAlpha?: number; oneBitAlpha?: boolean | number }): void
}
