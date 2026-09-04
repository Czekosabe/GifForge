import { describe, expect, it } from 'vitest'
import { computeViewportLayout, computeZoomScale, viewportPointToNormalized } from './beforeAfterViewport'

describe('computeZoomScale', () => {
  it('fits a wider-than-viewport image by width', () => {
    // 400x200 into a 200x200 viewport: width-constrained (200/400=0.5) is smaller than
    // height-constrained (200/200=1), so fit must pick the smaller to avoid overflow.
    expect(computeZoomScale('fit', 400, 200, 200, 200)).toBe(0.5)
  })

  it('fits a taller-than-viewport image by height', () => {
    expect(computeZoomScale('fit', 200, 400, 200, 200)).toBe(0.5)
  })

  it('returns literal multiples for numeric zoom levels, ignoring dimensions', () => {
    expect(computeZoomScale(1, 400, 400, 100, 100)).toBe(1)
    expect(computeZoomScale(2, 400, 400, 100, 100)).toBe(2)
    expect(computeZoomScale(8, 40, 40, 900, 900)).toBe(8)
  })
})

describe('computeViewportLayout', () => {
  it('centers an image smaller than the viewport, ignoring the requested pan center', () => {
    const layout = computeViewportLayout(100, 100, 1, 0.9, 0.1, 300, 300)
    expect(layout).toEqual({ left: 100, top: 100, width: 100, height: 100 })
  })

  it('centers the requested normalized point when the image is larger than the viewport', () => {
    // 400x400 at scale 1 (disp 400x400) in a 100x100 viewport, centered on (0.5, 0.5) —
    // the middle of the image should land in the middle of the viewport.
    const layout = computeViewportLayout(400, 400, 1, 0.5, 0.5, 100, 100)
    expect(layout.left).toBeCloseTo(100 / 2 - 0.5 * 400, 5)
    expect(layout.top).toBeCloseTo(100 / 2 - 0.5 * 400, 5)
    expect(layout.width).toBe(400)
    expect(layout.height).toBe(400)
  })

  it('clamps panning so the image can never be panned fully out of view', () => {
    // Requesting the extreme top-left corner (0,0) as the "center" would put the image far
    // off to the bottom-right of the viewport if unclamped — must be pulled back so the
    // viewport's left/top edge aligns with the image's left/top edge instead.
    const layout = computeViewportLayout(400, 400, 1, 0, 0, 100, 100)
    expect(layout.left).toBe(0)
    expect(layout.top).toBe(0)

    // Requesting the extreme bottom-right corner (1,1) — clamped so the image's right/bottom
    // edge aligns with the viewport's right/bottom edge, not pushed further left/up.
    const layoutEnd = computeViewportLayout(400, 400, 1, 1, 1, 100, 100)
    expect(layoutEnd.left).toBe(100 - 400)
    expect(layoutEnd.top).toBe(100 - 400)
  })

  it('shows the same normalized region on both sides at the same zoom/pan, despite different source dimensions', () => {
    // This is the core "linked navigation with differing dimensions" guarantee: Original
    // 400x400 and Optimized 200x200 at the same zoom level and pan center, unclamped (a
    // centered pan never needs clamping), must each report the viewport's center pointer
    // position as the SAME normalized source point — genuinely linked, not stretched to
    // match each other, and each still rendered at its own real pixel dimensions.
    const original = computeViewportLayout(400, 400, 2, 0.5, 0.5, 100, 100)
    const optimized = computeViewportLayout(200, 200, 2, 0.5, 0.5, 100, 100)
    expect(original.width).toBe(800)
    expect(optimized.width).toBe(400)

    const originalCenterPoint = viewportPointToNormalized(50, 50, original)
    const optimizedCenterPoint = viewportPointToNormalized(50, 50, optimized)
    expect(originalCenterPoint?.x).toBeCloseTo(0.5, 5)
    expect(originalCenterPoint?.y).toBeCloseTo(0.5, 5)
    expect(optimizedCenterPoint?.x).toBeCloseTo(0.5, 5)
    expect(optimizedCenterPoint?.y).toBeCloseTo(0.5, 5)
  })
})

describe('viewportPointToNormalized', () => {
  it('is the exact inverse of computeViewportLayout for a point inside the image', () => {
    const layout = computeViewportLayout(400, 400, 2, 0.3, 0.7, 200, 200)
    const centerPointerX = layout.left + 0.3 * layout.width
    const centerPointerY = layout.top + 0.7 * layout.height
    const result = viewportPointToNormalized(centerPointerX, centerPointerY, layout)
    expect(result?.x).toBeCloseTo(0.3, 5)
    expect(result?.y).toBeCloseTo(0.7, 5)
  })

  it('returns null for a point outside the rendered image (e.g. the letterboxed margin)', () => {
    const layout = computeViewportLayout(100, 100, 0.5, 0.5, 0.5, 200, 200) // disp 50x50, centered, margins around it
    expect(viewportPointToNormalized(5, 5, layout)).toBeNull()
  })

  it('returns null for a degenerate zero-size layout instead of dividing by zero', () => {
    expect(viewportPointToNormalized(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull()
  })
})
