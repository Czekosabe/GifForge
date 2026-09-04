import { test, expect } from '@playwright/test'
import {
  decodeGifFile,
  centerPixel,
  layerCanvasCenterPixel,
  LOADING_ICON_GIF,
  OFFSCREEN_CANVAS_UNSUPPORTED_REASON,
  OVERLAY_BLUE_PNG,
  OVERLAY_RED_PNG,
  uploadGif,
} from './helpers'

test.describe('layers', () => {
  test('adding a text layer paints real pixels onto the render canvas, not just an HTML overlay', async ({ page }) => {
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Text"]').click()
    await page.locator('button:has-text("+ Add")').click()
    await page.waitForTimeout(300)

    // A default text layer has black stroke text; the layers canvas should have
    // dark pixels it didn't have before (the source GIF is a light spinner).
    const hasDarkPixels = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'))
      const maxArea = Math.max(...canvases.map((c) => c.width * c.height))
      const layerCanvas = canvases.filter((c) => c.width * c.height === maxArea)[1]
      const ctx = layerCanvas.getContext('2d')!
      const data = ctx.getImageData(0, 0, layerCanvas.width, layerCanvas.height).data
      let dark = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! > 10 && data[i]! < 80 && data[i + 1]! < 80 && data[i + 2]! < 80) dark++
      }
      return dark
    })
    expect(hasDarkPixels).toBeGreaterThan(0)
  })

  test('image overlay with transparency renders correctly composited', async ({ page }) => {
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Overlay"]').click()
    await page.locator('input[type=file]').setInputFiles(OVERLAY_RED_PNG)
    await page.waitForTimeout(500)

    const [r, g, , a] = await layerCanvasCenterPixel(page)
    expect(r).toBeGreaterThan(200)
    expect(g).toBeLessThan(100)
    expect(a).toBeGreaterThan(100)
  })

  test('layer z-order (live preview): later-added layers render on top (regression)', async ({ page }) => {
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Overlay"]').click()
    await page.locator('input[type=file]').setInputFiles(OVERLAY_RED_PNG)
    await page.waitForTimeout(400)
    await page.locator('input[type=file]').setInputFiles(OVERLAY_BLUE_PNG)
    await page.waitForTimeout(400)

    const panelOrder = await page.locator('button', { hasText: /test-overlay/ }).allTextContents()
    expect(panelOrder[0]).toContain('blue')

    const [, , b] = await layerCanvasCenterPixel(page)
    expect(b).toBeGreaterThan(200) // blue on top
  })

  test('layer z-order (export): later-added layers render on top in the real exported file (regression)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Overlay"]').click()
    await page.locator('input[type=file]').setInputFiles(OVERLAY_RED_PNG)
    await page.waitForTimeout(400)
    await page.locator('input[type=file]').setInputFiles(OVERLAY_BLUE_PNG)
    await page.waitForTimeout(400)

    await page.locator('button[title="Export"]').click()
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export GIF")').click()
    const filePath = await (await downloadPromise).path()
    const result = decodeGifFile(filePath!)
    const [r, , b] = centerPixel(result.frames[0]!)
    expect(b).toBeGreaterThan(200)
    expect(r).toBeLessThan(100)
  })

  test('layer reorder (live preview): "Move up" brings a layer to the front (regression)', async ({ page }) => {
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Overlay"]').click()
    await page.locator('input[type=file]').setInputFiles(OVERLAY_RED_PNG)
    await page.waitForTimeout(400)
    await page.locator('input[type=file]').setInputFiles(OVERLAY_BLUE_PNG)
    await page.waitForTimeout(400)

    // Red is currently the back row; move it up so it becomes frontmost.
    await page.locator('button[title="Move up"]').nth(1).click()
    await page.waitForTimeout(200)

    const panelOrder = await page.locator('button', { hasText: /test-overlay/ }).allTextContents()
    expect(panelOrder[0]).toContain('red')

    const [r] = await layerCanvasCenterPixel(page)
    expect(r).toBeGreaterThan(200) // red now on top, live
  })

  test('layer reorder (export): "Move up" brings a layer to the front in the real exported file (regression)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Overlay"]').click()
    await page.locator('input[type=file]').setInputFiles(OVERLAY_RED_PNG)
    await page.waitForTimeout(400)
    await page.locator('input[type=file]').setInputFiles(OVERLAY_BLUE_PNG)
    await page.waitForTimeout(400)
    await page.locator('button[title="Move up"]').nth(1).click()
    await page.waitForTimeout(200)

    await page.locator('button[title="Export"]').click()
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export GIF")').click()
    const filePath = await (await downloadPromise).path()
    const result = decodeGifFile(filePath!)
    const [r, , b] = centerPixel(result.frames[0]!)
    expect(r).toBeGreaterThan(200)
    expect(b).toBeLessThan(100)
  })

  test('deleting an overlay and adding a new one leaves no stale reference in the export', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', OFFSCREEN_CANVAS_UNSUPPORTED_REASON)
    await uploadGif(page, LOADING_ICON_GIF)
    await page.locator('button[title="Overlay"]').click()
    await page.locator('input[type=file]').setInputFiles(OVERLAY_RED_PNG)
    await page.waitForTimeout(400)
    await page.locator('button:has-text("Delete overlay")').click()
    await page.waitForTimeout(300)
    await page.locator('input[type=file]').setInputFiles(OVERLAY_BLUE_PNG)
    await page.waitForTimeout(400)

    await page.locator('button[title="Export"]').click()
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export GIF")').click()
    const filePath = await (await downloadPromise).path()
    const result = decodeGifFile(filePath!)
    const [r, , b] = centerPixel(result.frames[0]!)
    expect(b).toBeGreaterThan(200)
    expect(r).toBeLessThan(100)
  })
})
