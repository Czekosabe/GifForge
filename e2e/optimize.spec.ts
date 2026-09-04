import { test, expect } from '@playwright/test'
import { statSync } from 'node:fs'
import { decodeGifFile, LOADING_ICON_GIF, OFFSCREEN_CANVAS_UNSUPPORTED_REASON, ROTATING_EARTH_GIF, uploadGif } from './helpers'

test.describe('optimization', () => {
  test('running optimization produces a genuinely different, real encoded result', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    await uploadGif(page, LOADING_ICON_GIF)
    const originalSize = statSync(LOADING_ICON_GIF).size

    await page.locator('button[title="Optimize"]').click()
    await page.locator('button:has-text("Aggressive")').click()
    await page.locator('button:has-text("Run optimization")').click()
    await expect(page.locator('text=Before / After')).toBeVisible({ timeout: 30_000 })

    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Download optimized GIF")').click()
    const filePath = await (await downloadPromise).path()
    const optimizedSize = statSync(filePath!).size

    expect(optimizedSize).toBeGreaterThan(0)
    // Not asserting smaller-than-original here: a genuine, real encode of a
    // low-color source can legitimately be larger than the original (see
    // docs/IMPLEMENTATION_STATUS.md "Known Limitations" — dithering vs. LZW).
    // What matters is that a real, distinct file was produced.
    expect(optimizedSize).not.toBe(originalSize)

    const result = decodeGifFile(filePath!)
    expect(result.frames.length).toBeGreaterThan(0)
  })

  test('target-size search with every reduction flag enabled actually exercises frame-rate/resolution reduction, not just palette (regression)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    test.slow() // this runs a real bounded search of up to ~18 real encodes on a 44-frame image
    await uploadGif(page, ROTATING_EARTH_GIF)

    await page.locator('button[title="Optimize"]').click()
    await page.locator('button:has-text("Target Size")').click()
    await page.getByRole('button', { name: '256KB', exact: true }).click()
    await page.locator('text=Allow FPS reduction').click()
    await page.locator('text=Allow frame dropping').click()
    await page.locator('text=Allow resolution reduction').click()
    await page.locator('text=Keep dimensions').click() // uncheck

    await page.locator('button:has-text("Run optimization")').click()
    await expect(page.locator('text=Before / After')).toBeVisible({ timeout: 60_000 })

    // Regression: an earlier cartesian-product candidate generator exhausted the
    // attempt budget re-trying color/dither combinations at 100% scale/frame-rate
    // before ever reaching frame-rate or resolution reduction, even when allowed.
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Download optimized GIF")').click()
    const filePath = await (await downloadPromise).path()
    const result = decodeGifFile(filePath!)

    // The source is 44 frames at 400x400. A real reduction technique must have
    // been used: either fewer frames or smaller dimensions than the source.
    const usedFrameReduction = result.frames.length < 44
    const usedResolutionReduction = result.width < 400 || result.height < 400
    expect(usedFrameReduction || usedResolutionReduction).toBe(true)
  })

  test('cancelling an in-progress optimization stops cleanly, not as a red error toast, and leaves the app usable', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await uploadGif(page, ROTATING_EARTH_GIF)
    await page.locator('button[title="Optimize"]').click()
    await page.locator('button:has-text("Target Size")').click()
    await page.getByRole('button', { name: '256KB', exact: true }).click()
    await page.locator('text=Allow FPS reduction').click()
    await page.locator('text=Allow frame dropping').click()
    await page.locator('text=Allow resolution reduction').click()
    await page.locator('text=Keep dimensions').click() // uncheck

    await page.locator('button:has-text("Run optimization")').click()
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible({ timeout: 5_000 })
    await page.waitForTimeout(300) // let the search genuinely start before cancelling
    await page.locator('button:has-text("Cancel")').click()

    // Cancelling is a user action, not an error: no red failed-job toast, no leftover
    // "Encoding was cancelled." message shown as if something went wrong (regression —
    // this used to happen because the aborted worker promise's rejection overwrote the
    // job's 'cancelled' status back to 'failed' after cancelJob() had already set it).
    await expect(page.locator('text=Encoding was cancelled.')).not.toBeVisible()
    await expect(page.locator('.border-red-800')).not.toBeVisible()

    // The Run button must come back — not stuck showing "Cancel" forever.
    await expect(page.locator('button:has-text("Run optimization")')).toBeVisible({ timeout: 5_000 })

    // The worker must still be usable afterward, not left in a broken/aborted state.
    await page.locator('button:has-text("Aggressive")').click()
    await page.locator('button:has-text("Run optimization")').click()
    await expect(page.locator('text=Before / After')).toBeVisible({ timeout: 30_000 })

    expect(pageErrors).toEqual([])
  })
})
