import { test, expect } from '@playwright/test'
import { LOADING_ICON_GIF, OVERLAY_RED_PNG, ROTATING_EARTH_GIF, uploadGif } from './helpers'

test.describe('resilience', () => {
  test('New Project fully closes the current project and loads a different GIF with no leftover layers', async ({ page }) => {
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Overlay"]').click()
    await page.locator('input[type=file]').setInputFiles(OVERLAY_RED_PNG)
    await page.waitForTimeout(400)

    await page.locator('button:has-text("New")').first().click()
    await page.locator('button:has-text("Yes, start new")').click()
    await expect(page.locator('text=Choose a GIF file')).toBeVisible({ timeout: 5_000 })

    await uploadGif(page, ROTATING_EARTH_GIF)
    await expect(page.locator('.h-9.shrink-0').first()).toContainText('44 frames')

    await page.locator('button[title="Overlay"]').click()
    await expect(page.locator('text=No layers yet.')).toBeVisible()
  })

  test('"Reset to original" removes layers and leaves the app fully functional afterward', async ({ page }) => {
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Overlay"]').click()
    await page.locator('input[type=file]').setInputFiles(OVERLAY_RED_PNG)
    await page.waitForTimeout(400)

    await page.locator('button[title="History"]').click()
    await page.locator('button:has-text("Reset to original")').click()
    await expect(page.locator('text=GifForge')).toBeVisible()

    await page.locator('button[title="Overlay"]').click()
    await expect(page.locator('text=No layers yet.')).toBeVisible()

    // App must still work: adding a fresh overlay after reset should render correctly.
    await page.locator('input[type=file]').setInputFiles(OVERLAY_RED_PNG)
    await page.waitForTimeout(400)
    await expect(page.locator('text=No layers yet.')).not.toBeVisible()
  })

  test('autosave persists across a reload and restore brings the edit back', async ({ page }) => {
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Rotate"]').click()
    await page.getByRole('button', { name: '180°', exact: true }).click()
    await page.waitForTimeout(2_500) // debounced autosave (1.5s)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('button:has-text("Restore")')).toBeVisible({ timeout: 10_000 })

    await page.locator('button:has-text("Restore")').click()
    await page.waitForSelector('button[title="Crop"]', { timeout: 30_000 })

    await page.locator('button[title="Rotate"]').click()
    const degreesField = page.locator('label:has-text("Degrees") input')
    await expect(degreesField).toHaveValue('180')
  })

  test('an unexpected render error is caught by the error boundary and shows a recovery screen, not a blank page', async ({
    page,
  }) => {
    // App.tsx exposes a dev-only crash hook via a query param specifically for this test —
    // see the `__crashtest` check at the top of App(). It throws unconditionally so this
    // test can verify the ErrorBoundary without needing to break real application logic.
    await page.goto('/?__crashtest=1')
    await page.waitForTimeout(500)

    await expect(page.locator('button:has-text("Reload GifForge")')).toBeVisible()
    await expect(page.locator('text=Something went wrong')).toBeVisible()
    const bodyText = await page.locator('body').textContent()
    expect(bodyText!.trim().length).toBeGreaterThan(0)
  })
})
