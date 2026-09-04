#!/usr/bin/env node
/**
 * Generates a synthetic, high-frame-count GIF for manual stress/performance testing
 * of GifForge (large timelines, Performance Mode activation, memory estimate logic).
 *
 * Not committed to the repository — the output is large (several MB) and, unlike the
 * small fixtures under fixtures/, its exact pixel content doesn't matter, only its
 * frame count and dimensions. Regenerate on demand:
 *
 *   node scripts/generate-stress-fixture.cjs [width] [height] [frameCount]
 *
 * Defaults produce a file estimated (width * height * 4 * frameCount) to land just
 * above GifForge's 300MB "suggest Performance Mode" threshold, specifically to
 * exercise that code path.
 */
const { GIFEncoder, quantize, applyPalette } = require('gifenc')
const fs = require('fs')
const path = require('path')

const width = Number(process.argv[2]) || 480
const height = Number(process.argv[3]) || 360
const frameCount = Number(process.argv[4]) || 600
const outPath = process.argv[5] || path.join(__dirname, '..', 'fixtures-stress.gif')

const estimatedMB = (width * height * 4 * frameCount) / 1e6
console.log(`Generating ${frameCount} frames at ${width}x${height} (estimated decoded memory: ${estimatedMB.toFixed(1)}MB)...`)

const enc = GIFEncoder()
for (let i = 0; i < frameCount; i++) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  const barX = Math.floor((i / frameCount) * width)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const dist = Math.abs(x - barX)
      const v = Math.max(0, 255 - dist * 3)
      rgba[idx] = v
      rgba[idx + 1] = (x + y) % 256
      rgba[idx + 2] = 255 - v
      rgba[idx + 3] = 255
    }
  }
  const palette = quantize(rgba, 48)
  const index = applyPalette(rgba, palette)
  enc.writeFrame(index, width, height, { palette, delay: 40, first: i === 0 })
}
enc.finish()
const bytes = enc.bytes()
fs.writeFileSync(outPath, Buffer.from(bytes))
console.log(`Wrote ${(bytes.length / 1e6).toFixed(2)}MB to ${outPath}`)
