import { test, expect } from '@playwright/test'
import { LOADING_ICON_GIF, OFFSCREEN_CANVAS_UNSUPPORTED_REASON, OVERLAY_RED_PNG, ROTATING_EARTH_GIF, uploadGif } from './helpers'

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

  test('starting New Project mid-optimize does not leave a permanently stuck job toast', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    // Regression: startNewProject() used to terminate the worker without touching the
    // global job store, so a still-'running' job's Comlink call never resolved or
    // rejected — nothing ever marked it done, leaving its progress toast on screen
    // forever with no way to dismiss it (JobStatusBar only offers dismiss for 'failed').
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

    await page.locator('button:has-text("New")').first().click()
    await page.locator('button:has-text("Yes, start new")').click()
    await expect(page.locator('text=Choose a GIF file')).toBeVisible({ timeout: 5_000 })

    // The old job's toast must be gone immediately, not just eventually.
    await expect(page.locator('text=Trying 256 colors')).not.toBeVisible()
    await expect(page.locator('.fixed.bottom-4.right-4')).not.toBeVisible()

    // Wait past when the abandoned search would have finished on its own, to rule out
    // it silently reappearing (e.g. a delayed progress callback resurrecting the toast).
    await page.waitForTimeout(9_000)
    await expect(page.locator('.fixed.bottom-4.right-4')).not.toBeVisible()
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

  test('uploading a file with a corrupt GIF signature shows a clear error and leaves the app usable, no unhandled page errors', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/')
    await page.waitForSelector('text=GifForge', { timeout: 15_000 })

    // Named and MIME-typed as a GIF (passes the extension/MIME/size checks in
    // useLoadGif's validateFile), but the content is garbage — this exercises the
    // decoder's own signature check (GifDecodeError in src/core/gif/decoder.ts),
    // not the upload-form validation, which unit tests already cover directly.
    await page.locator('input[type=file]').setInputFiles({
      name: 'corrupt.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('this is not a real gif file, just garbage bytes'),
    })

    await expect(page.locator('text=/not a valid GIF/i').first()).toBeVisible({ timeout: 10_000 })
    // Must still be on the upload screen, not stuck in a perpetual loading spinner.
    await expect(page.locator('button:has-text("Choose a GIF file")')).toBeVisible()

    // The app must still be fully usable afterward — a real GIF loads normally.
    await page.locator('input[type=file]').setInputFiles(LOADING_ICON_GIF)
    await page.waitForSelector('button[title="Crop"]', { timeout: 30_000 })
    await expect(page.locator('.h-9.shrink-0').first()).toContainText('24 frames')

    expect(pageErrors).toEqual([])
  })

  test('starting Export while an Optimize search is still running is rejected cleanly, and the app stays fully usable afterward', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    test.slow() // runs a real bounded target-size search (~8s) in the background
    // Nothing in the UI stops a user from switching tools mid-job and starting a second
    // heavy operation on the same shared worker instance. Regression test for the fix in
    // pipeline.worker.ts: exportGif/optimize now guard against a second one starting while
    // one is already in flight, instead of silently racing on the shared abortController.
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

    // Switch tools mid-job (allowed by the UI) and try to start a second heavy operation.
    // Switching tools unmounts OptimizePanel (losing its local "running"/result state, by
    // design — unrelated to this fix), but the background job itself is untouched by that.
    await page.locator('button[title="Export"]').click()
    await page.locator('button:has-text("Export GIF")').click()

    await expect(page.locator('text=Another export or optimization is already running.').first()).toBeVisible({
      timeout: 5_000,
    })

    // Give the background target-size search (up to ~8s) time to finish on its own before
    // proving the worker is healthy again — this also confirms the in-flight guard actually
    // releases afterward (the `finally` reset), not just that it blocks a second call.
    await page.waitForTimeout(10_000)

    // The app must still be fully usable: a fresh optimization from a clean panel state
    // must complete normally, not be permanently stuck behind the "already running" guard.
    await page.locator('button[title="Optimize"]').click()
    await page.locator('button:has-text("Aggressive")').click()
    await page.locator('button:has-text("Run optimization")').click()
    await expect(page.locator('text=Before / After')).toBeVisible({ timeout: 30_000 })

    expect(pageErrors).toEqual([])
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
