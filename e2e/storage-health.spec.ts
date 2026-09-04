import { test, expect } from '@playwright/test'
import { LOADING_ICON_GIF, OFFSCREEN_CANVAS_UNSUPPORTED_REASON, uploadGif } from './helpers'

/**
 * Simulates a real storage failure by removing `window.indexedDB` before any app code
 * runs — a genuine browser-API-level failure (matches real private-browsing/quota/disabled-
 * storage scenarios), not a mock of GifForge's own code. Dexie's every operation then
 * rejects for real, exercising the actual catch paths in db.ts/useAutosave.ts/
 * OverlayPanel.tsx exactly as they'd run in production against a real failure.
 */
async function breakIndexedDb(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    // @ts-expect-error intentionally removing a browser API to simulate a real failure
    delete window.indexedDB
  })
}

test.describe('storage-health warning', () => {
  test('shows once, editing/export stay fully usable, and no page errors occur', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await breakIndexedDb(page)
    await uploadGif(page, LOADING_ICON_GIF)

    // 1. Editing still works even though storage is broken.
    await page.locator('button[title="Rotate"]').click()
    await page.getByRole('button', { name: '180°', exact: true }).click()

    // 2. The user sees the autosave-unavailable message (debounced autosave fires at 1.5s).
    const banner = page.locator('[role="status"]', { hasText: 'autosave' })
    await expect(banner).toBeVisible({ timeout: 5_000 })
    await expect(banner).toContainText('Local autosave is unavailable')
    await expect(banner).toContainText('your project may not survive a page reload')

    // 3. Not duplicated: only one banner element exists, even after another edit triggers
    // another (also-failing) debounced autosave attempt.
    await page.getByRole('button', { name: '90°', exact: true }).click()
    await page.waitForTimeout(2_000)
    await expect(page.locator('[role="status"]', { hasText: 'autosave' })).toHaveCount(1)

    // Dismissing it, then triggering yet another failed autosave, must not resurrect it —
    // the same underlying failure episode shouldn't re-notify after being dismissed.
    await page.getByRole('button', { name: 'Dismiss autosave warning' }).click()
    await expect(banner).not.toBeVisible()
    await page.locator('button[title="Rotate"]').click()
    await page.getByRole('button', { name: '270°', exact: true }).click()
    await page.waitForTimeout(2_000)
    await expect(banner).not.toBeVisible()

    // 5. Export remains fully usable — exportGif never touches IndexedDB at all, and this
    // proves it in practice, not just by code inspection.
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button[title="Export"]').click()
    await page.locator('button:has-text("Export GIF")').click()
    const download = await downloadPromise
    expect(await download.path()).toBeTruthy()

    // 4 & 6. No crash, no unhandled page errors throughout.
    expect(pageErrors).toEqual([])
  })

  test('does not show when storage is healthy', async ({ page }) => {
    // No skip here (unlike the test above): this one never touches export/optimize, so it
    // doesn't depend on OffscreenCanvas and should run on every engine, including WebKit.
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Rotate"]').click()
    await page.getByRole('button', { name: '180°', exact: true }).click()
    await page.waitForTimeout(2_000)

    await expect(page.locator('[role="status"]', { hasText: 'autosave' })).not.toBeVisible()
    expect(pageErrors).toEqual([])
  })
})
