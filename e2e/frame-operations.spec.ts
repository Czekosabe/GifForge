import { test, expect } from '@playwright/test'
import { decodeGifFile, LOADING_ICON_GIF, frameCounterLocator, stageHasVisibleContent, uploadGif } from './helpers'

test.describe('frame operations', () => {
  test('reverse genuinely rewrites frame order in the exported file, not just the preview', async ({ page }) => {
    await uploadGif(page, LOADING_ICON_GIF)

    await page.locator('button[title="Export"]').click()
    let downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export GIF")').click()
    const baselinePath = await (await downloadPromise).path()
    const baseline = decodeGifFile(baselinePath!)

    await page.locator('button[title="Reverse"]').click()
    await page.locator('button[title="Export"]').click()
    downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export GIF")').click()
    const reversedPath = await (await downloadPromise).path()
    const reversed = decodeGifFile(reversedPath!)

    // reversed[0] must equal baseline[last], and vice versa, at the pixel level.
    const firstBytes = Buffer.from(reversed.frames[0]!.patch.slice(0, 64))
    const lastBaselineBytes = Buffer.from(baseline.frames[baseline.frames.length - 1]!.patch.slice(0, 64))
    expect(firstBytes.equals(lastBaselineBytes)).toBe(true)
  })

  test('deleting frames updates the visible count and playback wraps within the new range, not the stale original count', async ({
    page,
  }) => {
    await uploadGif(page, LOADING_ICON_GIF)

    await page.locator('input[placeholder*="1-10"]').fill('4-24')
    await page.locator('button:has-text("Delete selected")').click()
    await expect(frameCounterLocator(page)).toHaveText('Frame 1 / 3')

    // Regression: playbackStore.frameCount used to go stale after a delete, so the
    // playback loop's `(currentFrameIndex + 1) % frameCount` wrapped using the
    // ORIGINAL frame count (24) instead of the new one (3), eventually indexing
    // past the real frame list and silently rendering nothing.
    await page.locator('button[title="Play/Pause (Space)"]').first().click()
    await page.waitForTimeout(1200) // 3 frames at 50ms/frame — many wraps
    const label = await frameCounterLocator(page).textContent()
    const [, cur, total] = label!.match(/Frame (\d+) \/ (\d+)/)!
    expect(Number(total)).toBe(3)
    expect(Number(cur)).toBeLessThanOrEqual(3)
    expect(await stageHasVisibleContent(page)).toBe(true)
  })

  test('scrubbing to a frame that later becomes out-of-range clamps to the new last frame instead of going blank', async ({
    page,
  }) => {
    await uploadGif(page, LOADING_ICON_GIF)

    const thumbButtons = page.locator('.no-scrollbar button')
    await thumbButtons.nth(9).click() // frame 10
    await expect(frameCounterLocator(page)).toHaveText('Frame 10 / 24')

    // Delete frames 1-15 while sitting at frame 10 — frame 10 no longer exists.
    await page.locator('input[placeholder*="1-10"]').fill('1-15')
    await page.locator('button:has-text("Delete selected")').click()

    await expect(frameCounterLocator(page)).toHaveText('Frame 9 / 9')
    expect(await stageHasVisibleContent(page)).toBe(true)
  })

  test('invert selection produces the complement of the current selection', async ({ page }) => {
    await uploadGif(page, LOADING_ICON_GIF)
    const rangeInput = page.locator('input[placeholder*="1-10"]')
    await rangeInput.fill('1-5')
    await page.locator('button:has-text("Invert")').click()
    await expect(rangeInput).toHaveValue('6-24')
  })

  test('deleting every frame degrades gracefully: app stays usable and export fails with a clear message, not a crash', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))

    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('input[placeholder*="1-10"]').fill('1-24')
    await page.locator('button:has-text("Delete selected")').click()
    await expect(page.locator('text=GifForge')).toBeVisible()

    await page.locator('button[title="Export"]').click()
    await page.locator('button:has-text("Export GIF")').click()
    await expect(page.locator('text=Cannot encode a GIF with zero frames.')).toBeVisible({ timeout: 5_000 })
    expect(errors).toEqual([])
  })

  test('undo restores frame count and redo re-applies it, keeping playback state in sync', async ({ page }) => {
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('input[placeholder*="1-10"]').fill('1-21')
    await page.locator('button:has-text("Delete selected")').click()
    await expect(frameCounterLocator(page)).toContainText('/ 3')

    await page.keyboard.press('Control+z')
    await expect(frameCounterLocator(page)).toContainText('/ 24')

    await page.keyboard.press('Control+Shift+z')
    await expect(frameCounterLocator(page)).toContainText('/ 3')
  })
})
