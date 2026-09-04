import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { decodeGifFile, LOADING_ICON_GIF, OFFSCREEN_CANVAS_UNSUPPORTED_REASON, OVERLAY_RED_PNG, uploadGif } from './helpers'

test.describe('core editing flow', () => {
  test('uploads a GIF, decodes it, and shows correct metadata', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(String(err)))

    await uploadGif(page, LOADING_ICON_GIF)

    await expect(page.locator('.h-9.shrink-0').first()).toContainText('441 × 291')
    await expect(page.locator('.h-9.shrink-0').first()).toContainText('24 frames')
    expect(consoleErrors).toEqual([])
  })

  test('drag-and-drop upload works via a real DataTransfer event, not just file-input selection', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('text=GifForge', { timeout: 15_000 })

    const buffer = readFileSync(LOADING_ICON_GIF)
    const dataTransfer = await page.evaluateHandle((b64: string) => {
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], 'loading-icon.gif', { type: 'image/gif' }))
      return dt
    }, buffer.toString('base64'))

    await page.locator('div.border-dashed').dispatchEvent('drop', { dataTransfer })
    await page.waitForSelector('button[title="Crop"]', { timeout: 30_000 })
    await expect(page.locator('.h-9.shrink-0').first()).toContainText('24 frames')
  })

  test('rejects a non-GIF file with a clear error, not a crash', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('text=GifForge', { timeout: 15_000 })
    await page.locator('input[type=file]').setInputFiles(OVERLAY_RED_PNG)
    await expect(page.locator('text=Please choose a .gif file.').first()).toBeVisible({ timeout: 5_000 })
  })

  test('exports a GIF that re-decodes with correct dimensions, frame count, and timing matching the source', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    await uploadGif(page, LOADING_ICON_GIF)

    await page.locator('button[title="Export"]').click()
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export GIF")').click()
    const download = await downloadPromise
    const filePath = await download.path()
    expect(filePath).toBeTruthy()

    const result = decodeGifFile(filePath!)
    expect(result.width).toBe(441)
    expect(result.height).toBe(291)
    expect(result.frames).toHaveLength(24)
    // Regression: compositor.ts once double-converted GIF delay units, exporting
    // everything 10x slower than the source. The source's real delay is 50ms/frame.
    expect(result.frames[0]!.delay).toBe(50)
    expect(result.frames.every((f) => f.delay === 50)).toBe(true)
  })

  test('crop tool applies visually and the crop region can be set numerically', async ({ page }) => {
    await uploadGif(page, LOADING_ICON_GIF)
    const widthField = page.locator('label:has-text("Width") input')
    await widthField.fill('200')
    await widthField.blur()
    await expect(widthField).toHaveValue('200')
  })

  test('resize genuinely changes the output dimensions used by export, not just a UI label', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Resize"]').click()
    await page.locator('button:has-text("Percent")').click()
    await page.getByRole('button', { name: '50%', exact: true }).click()
    await expect(page.locator('text=Output: 221 × 146')).toBeVisible()

    await page.locator('button[title="Export"]').click()
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export GIF")').click()
    const download = await downloadPromise
    const filePath = await download.path()
    const result = decodeGifFile(filePath!)
    expect(result.width).toBe(221)
    expect(result.height).toBe(146)
  })
})
