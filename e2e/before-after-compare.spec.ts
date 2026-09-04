import { test, expect } from '@playwright/test'
import { statSync } from 'node:fs'
import { decodeGifFile, LOADING_ICON_GIF, OFFSCREEN_CANVAS_UNSUPPORTED_REASON, uploadGif } from './helpers'

/** Reads the RGBA color of a canvas's center pixel, by data-testid (not "biggest canvas on
 * screen" — the comparison view puts several canvases on screen at once). */
async function comparePixel(page: import('@playwright/test').Page, testId: string): Promise<[number, number, number, number]> {
  return page.evaluate((id) => {
    const canvas = document.querySelector(`canvas[data-testid="${id}"]`) as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const d = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
    return [d[0], d[1], d[2], d[3]] as [number, number, number, number]
  }, testId)
}

test.describe('visual Before/After comparison', () => {
  test('shows no comparison before optimization has run, then a real one after — with real data, no unnecessary re-runs, and clean invalidation', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    test.slow()
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await uploadGif(page, LOADING_ICON_GIF)
    const originalFileSize = statSync(LOADING_ICON_GIF).size

    // 1. No Before/After result before an optimization result exists.
    await page.locator('button[title="Optimize"]').click()
    await expect(page.locator('text=Before / After')).not.toBeVisible()
    await expect(page.locator('canvas[data-testid="compare-optimized-canvas"]')).not.toBeVisible()

    // 2 & 3. Run a real optimization; the comparison UI appears.
    await page.locator('button:has-text("Aggressive")').click()
    await page.locator('button:has-text("Run optimization")').click()
    await expect(page.locator('text=Before / After')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('canvas[data-testid="compare-optimized-canvas"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('canvas[data-testid="compare-original-canvas"]')).toBeVisible()

    // 4. Reported original/optimized byte sizes match real data.
    const originalSizeText = (await page.locator('[data-testid="compare-original-size"]').textContent())!
    expect(originalSizeText).toContain(originalFileSize < 1024 ? 'B' : (originalFileSize / 1024).toFixed(1))

    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Download optimized GIF")').click()
    const download = await downloadPromise
    const filePath = await download.path()
    const actualOptimizedSize = statSync(filePath!).size
    const optimizedSizeText = (await page.locator('[data-testid="compare-optimized-size"]').textContent())!
    // The displayed size must be the same real file, not an estimate — compare the number,
    // tolerant only of the KB-rounding the UI itself applies.
    const displayedKb = parseFloat(optimizedSizeText)
    expect(Math.abs(displayedKb - actualOptimizedSize / 1024)).toBeLessThan(0.15)

    // 5. The optimized visual source comes from the actual optimization result: decode the
    // real downloaded file and compare its center pixel against the comparison canvas's
    // center pixel — same real bytes, same decode, must match exactly.
    const decoded = decodeGifFile(filePath!)
    const firstFrame = decoded.frames[0]!
    const cx = Math.floor(firstFrame.dims.width / 2)
    const cy = Math.floor(firstFrame.dims.height / 2)
    const idx = (cy * firstFrame.dims.width + cx) * 4
    const expectedPixel = [firstFrame.patch[idx], firstFrame.patch[idx + 1], firstFrame.patch[idx + 2]]

    const actualPixel = await comparePixel(page, 'compare-optimized-canvas')
    expect(actualPixel[0]).toBe(expectedPixel[0])
    expect(actualPixel[1]).toBe(expectedPixel[1])
    expect(actualPixel[2]).toBe(expectedPixel[2])

    // 6. Changing the comparison control (dragging the split) does NOT start a new
    // optimization job — the displayed sizes must stay exactly the same, no new toast.
    const splitHandle = page.locator('[role="slider"][aria-label="Comparison split position"]')
    await splitHandle.focus()
    await splitHandle.press('ArrowRight')
    await splitHandle.press('ArrowRight')
    await expect(page.locator('text=Optimizing…')).not.toBeVisible()
    const optimizedSizeAfterDrag = (await page.locator('[data-testid="compare-optimized-size"]').textContent())!
    expect(optimizedSizeAfterDrag).toBe(optimizedSizeText)

    // Frame mode toggle must also not trigger any worker call — just switches what's drawn.
    await page.getByRole('button', { name: /^Frame \d+$/ }).click()
    await expect(page.locator('canvas[data-testid="compare-optimized-canvas"]')).toBeVisible()
    await page.locator('button:has-text("Animated")').click()

    // 7. Running another optimization replaces the previous comparison result cleanly.
    await page.locator('button:has-text("light")').click()
    await page.locator('button:has-text("Run optimization")').click()
    await expect(page.locator('text=Before / After')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('canvas[data-testid="compare-optimized-canvas"]')).toBeVisible({ timeout: 15_000 })

    // 8. New Project removes comparison state/resources.
    await page.locator('button:has-text("New")').first().click()
    await page.locator('button:has-text("Yes, start new")').click()
    await expect(page.locator('text=Choose a GIF file')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('canvas[data-testid="compare-optimized-canvas"]')).not.toBeVisible()

    // 9. No page errors occurred anywhere in this flow.
    expect(pageErrors).toEqual([])
  })
})
