import { test, expect, type Page } from '@playwright/test'
import { LOADING_ICON_GIF, OFFSCREEN_CANVAS_UNSUPPORTED_REASON, ROTATING_EARTH_GIF, uploadGif } from './helpers'

async function canvasCssWidth(page: Page, testId: string): Promise<number> {
  return page.evaluate((id) => {
    const el = document.querySelector(`canvas[data-testid="${id}"]`) as HTMLElement
    return el.getBoundingClientRect().width
  }, testId)
}

async function runAggressiveOptimize(page: Page) {
  await uploadGif(page, LOADING_ICON_GIF)
  await page.locator('button[title="Optimize"]').click()
  await page.locator('button:has-text("Aggressive")').click()
  await page.locator('button:has-text("Run optimization")').click()
  await page.locator('text=Before / After').waitFor({ timeout: 30_000 })
  await expect(page.locator('canvas[data-testid="compare-optimized-canvas"]')).toBeVisible({ timeout: 15_000 })
}

test.describe('Before/After pixel-level zoom inspector', () => {
  test('zoom controls, pan, split-while-zoomed, reset, and frame navigation all work without touching the optimizer', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await runAggressiveOptimize(page)
    const optimizedSizeBefore = (await page.locator('[data-testid="compare-optimized-size"]').textContent())!

    // Zoom controls do not exist in Animated mode (task: primary inspection mode is Frame).
    await expect(page.getByRole('group', { name: 'Zoom level' })).not.toBeVisible()

    // 2 & 3. Switch to Frame mode; zoom controls appear.
    await page.getByRole('button', { name: /^Frame \d+$/ }).click()
    await expect(page.getByRole('group', { name: 'Zoom level' })).toBeVisible()
    const fitWidth = await canvasCssWidth(page, 'compare-optimized-canvas')

    // 5. Fit -> higher zoom changes the rendered scale (canvas CSS box size grows).
    await page.getByRole('button', { name: 'Zoom 400%' }).click()
    const zoomedWidth = await canvasCssWidth(page, 'compare-optimized-canvas')
    expect(zoomedWidth).toBeGreaterThan(fitWidth * 2) // well beyond noise, real magnification

    // 4. Changing zoom does not start a new optimize job or change the real result.
    await expect(page.locator('text=Optimizing…')).not.toBeVisible()
    const optimizedSizeAfterZoom = (await page.locator('[data-testid="compare-optimized-size"]').textContent())!
    expect(optimizedSizeAfterZoom).toBe(optimizedSizeBefore)

    // 6. Pan works when zoomed — drag well away from the split divider (center) so this
    // actually pans instead of moving the divider — and the hover readout updates,
    // confirming real pointer-to-source-pixel tracking, not just a static label.
    const box = (await page.locator('.relative.w-full.touch-none').boundingBox())!
    const startX = box.x + box.width * 0.25
    const startY = box.y + box.height / 2
    await page.mouse.move(startX, startY)
    const readoutBeforePan = await page.locator('[data-testid="compare-hover-readout"]').textContent()
    await page.mouse.down()
    await page.mouse.move(startX - 80, startY - 50, { steps: 6 })
    await page.mouse.up()
    await page.mouse.move(startX, startY) // hover the same viewport point again after panning
    const readoutAfterPan = await page.locator('[data-testid="compare-hover-readout"]').textContent()
    expect(readoutAfterPan).not.toBe(readoutBeforePan) // same viewport point, different source pixel now

    // 8. The split divider still works while zoomed, and stays at the position it was
    // dragged to (not reset/confused by the pan interaction above).
    const divider = page.locator('[role="slider"][aria-label="Comparison split position"]')
    await divider.focus()
    await divider.press('ArrowRight')
    await divider.press('ArrowRight')
    await expect(divider).toHaveAttribute('aria-valuenow', '54')

    // 7. Reset View restores Fit — canvas returns to its original (pre-zoom) rendered size.
    await page.getByRole('button', { name: 'Reset zoom and pan to fit' }).click()
    const widthAfterReset = await canvasCssWidth(page, 'compare-optimized-canvas')
    expect(Math.abs(widthAfterReset - fitWidth)).toBeLessThan(1)
    await expect(page.getByRole('button', { name: 'Zoom Fit' })).toHaveAttribute('aria-pressed', 'true')

    // 9. Scrubbing the main timeline updates the inspected frame without losing zoom state
    // or crashing — re-zoom first, then scrub, and confirm zoom level survived.
    await page.getByRole('button', { name: 'Zoom 200%' }).click()
    await page.locator('.no-scrollbar button').nth(5).click() // frame 6
    await page.waitForTimeout(200)
    await expect(page.getByRole('button', { name: 'Zoom 200%' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('canvas[data-testid="compare-optimized-canvas"]')).toBeVisible()

    expect(pageErrors).toEqual([])
  })

  test('different Original/Optimized dimensions do not break the zoomed viewer', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await uploadGif(page, ROTATING_EARTH_GIF)
    await page.locator('button[title="Optimize"]').click()
    await page.locator('button:has-text("Aggressive")').click() // reduces scale to 85% by default
    await page.locator('button:has-text("Run optimization")').click()
    await page.locator('text=Before / After').waitFor({ timeout: 30_000 })

    const originalMeta = (await page.locator('[data-testid="compare-original-meta"]').textContent())!
    const optimizedMeta = (await page.locator('[data-testid="compare-optimized-meta"]').textContent())!
    expect(originalMeta).toContain('400×400')
    expect(optimizedMeta).not.toContain('400×400') // genuinely reduced, not the same dimensions

    await page.getByRole('button', { name: /^Frame \d+$/ }).click()
    await page.getByRole('button', { name: 'Zoom 800%' }).click()
    await page.waitForTimeout(200)

    // Both canvases must still render at a sane, non-zero, non-distorted size — this is the
    // "don't stretch one into the other's coordinate system" guarantee in practice.
    const originalWidth = await canvasCssWidth(page, 'compare-original-canvas')
    const optimizedWidth = await canvasCssWidth(page, 'compare-optimized-canvas')
    expect(originalWidth).toBeGreaterThan(0)
    expect(optimizedWidth).toBeGreaterThan(0)
    // At the same zoom multiple (800%), Original (400px source) must render wider on screen
    // than Optimized (340px source, 400*0.85) — each scaled from its OWN real pixel size,
    // not forced to match the other's.
    expect(originalWidth).toBeGreaterThan(optimizedWidth)

    expect(pageErrors).toEqual([])
  })

  test('New Project clears the zoomed comparison normally', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await runAggressiveOptimize(page)
    await page.getByRole('button', { name: /^Frame \d+$/ }).click()
    await page.getByRole('button', { name: 'Zoom 400%' }).click()

    await page.locator('button:has-text("New")').first().click()
    await page.locator('button:has-text("Yes, start new")').click()
    await expect(page.locator('text=Choose a GIF file')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('canvas[data-testid="compare-optimized-canvas"]')).not.toBeVisible()

    expect(pageErrors).toEqual([])
  })
})
