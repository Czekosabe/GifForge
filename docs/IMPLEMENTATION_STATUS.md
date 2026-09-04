# GifForge Implementation Status

Last updated: 2026-09-04. This file is meant to reflect reality — a feature is
only listed as DONE if it produces a genuinely different, correct output, not
merely because UI for it exists.

# DONE

Verified either by an automated test (unit test file named) or by driving the
real app in a headless Chromium browser against the Vite dev server and
inspecting actual output bytes/pixels (not just screenshots) — see "Test
status" below for exactly what was checked.

- **Upload** — click-to-upload and drag-and-drop, `.gif`/`image/gif`
  validation, corrupt/non-GIF/empty-file/oversized-file rejection with a
  readable error (`decoder.ts`, `useLoadGif.ts`). Verified live: a real
  `DataTransfer`-based drop event (not just `setInputFiles`) successfully
  loads a GIF; a mislabeled PNG dropped in is rejected with "Please choose a
  .gif file." instead of silently failing or crashing.
- **Decode + correct frame reconstruction** — real GIF89a parsing (`gifuct-js`)
  plus a hand-written, unit-tested disposal-method compositor
  (`compositor.ts`) covering disposal 0/1/2/3 and partial-transparent-patch
  compositing. Verified against two real-world fixture GIFs (44-frame /
  400×400 and 24-frame / 441×291) end-to-end in-browser.
- **Metadata display** — dimensions, frame count, loop count (read from the
  NETSCAPE2.0 extension), file size, duration.
- **Playback** — imperative rAF-driven play/pause/scrub/restart, respecting
  real per-frame delays (not a fixed interval). A real timing bug (delay was
  being multiplied by 10 twice, encoding gifs 10x slower than the source) was
  found and fixed via browser-verified round-trip decode of an actual export
  — see "Bugs found and fixed" below.
- **Timeline** — windowed rendering (not all frames mounted at once), lazy
  per-frame thumbnails fetched from the worker and cached, frame-range text
  selection (`"1-10,15,20-25"` syntax, its own unit-tested parser),
  click-to-scrub navigation (verified live: clicking the 5th thumbnail
  updates the frame counter to "Frame 5 / 24").
- **Frame delete / keep / reverse / select-all / invert / clear** —
  implemented as pure reorderings of a frame-index array (`frameOrder.ts`,
  unit tested). All verified live in browser: reverse (visibly changes
  animation direction), delete (24→21 frames after deleting a 3-frame
  selection), invert (`1-5` inverted against 24 frames → `6-24`), each a
  single history entry. Reverse additionally verified at the pixel level in
  an actual exported file: frame 0 of the reversed export byte-for-byte
  matches frame 23 of a baseline export (and vice versa) — the frame order
  is genuinely rewritten in the encoded output, not just displayed reversed.
- **Crop** — visual (draggable/resizable Konva `Transformer`) and numeric,
  kept in sync via `beginInteraction`/`endInteraction` so a drag is one
  history entry. Aspect-ratio presets, reset, center. Verified live.
- **Resize** — pixel mode (with aspect lock) and percent mode with presets;
  verified live that it changes the actual output dimensions used by
  export/optimize (encoded output was measured at the resized 221×146, not
  the original 441×291).
- **Rotate** — 90/180/270 presets, custom-angle slider + numeric field,
  auto-fit (bounding-box growth, unit-tested math) vs. keep-original canvas
  modes. Verified live — canvas genuinely reflows and the image genuinely
  rotates in the interactive preview.
- **Speed** — presets + custom multiplier, implemented as a delay
  transformation (unit tested), not frame duplication/dropping. Verified at
  the byte level in an actual export: 2x speed took a 24-frame, 1200ms-total
  baseline export to a 720ms-total export with per-frame delays dropping
  from 50ms to 30ms (not exactly 25ms — GIF's native 10ms/centisecond
  granularity rounds 2.5 up — an expected, documented rounding, not a bug).
- **Text layers** — multiple independent layers, drag/transform/rotate on
  canvas + numeric inspector (font, size, color, stroke, opacity, alignment,
  shadow, frame-range visibility, 5 presets). Verified live that text pixels
  are actually painted onto the render canvas (not just an HTML overlay).
- **Image overlay layers** — PNG/JPG/WEBP upload, transparency preserved,
  drag/resize/rotate + numeric inspector, frame-range visibility. Verified
  live with a transparent-PNG fixture — overlay renders correctly composited,
  including alpha.
- **Layers panel** — select, rename via list, show/hide, lock/unlock, reorder
  (up/down), delete, shared between text and overlay layers. New layers are
  added frontmost (index 0 = top of panel = top of z-stack, matching
  standard design-tool convention). Verified live at the pixel level, in
  both the interactive preview and the actual exported GIF bytes: with two
  overlapping opaque overlays (red added first, blue added second), the
  center pixel is blue (blue is frontmost); after clicking "Move up" on red,
  the panel order and the center pixel (in both live canvas and re-decoded
  export) flip to red. Two real bugs were found and fixed here — see "Bugs
  found and fixed" below.
- **Optimization** — real encoding at Light/Balanced/Aggressive presets or
  custom settings (max colors, dithering + strength, scale). Verified live
  that palette size and pixel dimensions are genuinely different in the
  output bytes, not a cosmetic slider.
- **Target-size search** — bounded (≤24 attempts), ordered
  least-to-most-destructive real-encode-and-measure search
  (`targetSizeSearch.ts`, unit tested for ordering/config-building logic).
  Honest "could not reach target, best result: X" message when unreachable —
  never silently returns a worse-than-requested result mislabeled as success.
  Verified live on a real 44-frame/400×400/~1MB GIF with an aggressive 256KB
  target and every reduction flag enabled: after a real bug fix (see "Bugs
  found and fixed"), it now genuinely reaches the target (167.6KB) by
  actually exercising frame-rate reduction (44→22 frames, confirmed by
  re-decoding the downloaded file), not just color/dither changes.
- **Before/After** — original vs. optimized size, % saved, actual result
  message, download button for the optimized bytes.
- **Export** — real `gifenc`-based encoding with loop mode (forever / none /
  custom count), frame-range subset, quality/color/dither/scale controls,
  7 presets. Verified live: downloaded file re-decodes with `gifuct-js`,
  correct dimensions/frame-count, and correct per-frame timing matching the
  source.
- **Static frame export** — current frame to PNG or JPEG via
  `OffscreenCanvas.convertToBlob`. Verified live for both formats — the PNG
  has a valid signature, and the JPEG has a valid `FFD8` signature.
- **Undo/redo** — full project-snapshot history, drag/typing-session
  coalescing so a multi-second interaction is one entry, not hundreds.
  Verified live via the toolbar buttons (rotate → reverse → undo×2 correctly
  restored the pre-reverse, pre-rotate state).
- **Reset to original**.
- **Autosave + restore** — debounced (1.5s) write to IndexedDB (Dexie) of the
  project + source blob + overlay assets; restore banner on reload. Verified
  live end-to-end: edited → reloaded the page → restore banner appeared →
  restored project had the edit intact and the worker was correctly
  re-populated (decode re-run against the saved source blob).
- **Job system** — typed job list (`jobStore`) with progress/message/
  cancel, rendered as toasts (`JobStatusBar.tsx`); load/optimize/export all
  report real (not synthetic) progress fractions from the worker.
- **Cancellation** — `AbortController`-based, wired for optimize and export
  (checked between frames/attempts, throws `EncodeCancelledError`).
- **Memory-size estimation + Performance Mode** — `width×height×4×frameCount`
  computed before generating previews; above a threshold, Performance Mode is
  auto-suggested and preview bitmaps are generated at a smaller max
  dimension. A hard cap refuses to decode files estimated above ~2GB RGBA.
- **Keyboard shortcuts** — Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (and Ctrl+Y)
  redo, Delete/Backspace removes the selected layer, Space toggles playback;
  all correctly ignored while a text input/textarea/select is focused.
  Verified live via actual simulated key presses (not just button clicks):
  Ctrl+Z correctly restored 21→24 frames after a delete, Ctrl+Shift+Z
  correctly redid it back to 21, Space toggled the play icon ▶→⏸, and
  Delete removed a selected text layer.
- **Errors** — invalid/corrupt/oversized file, decode failure, encode
  failure, cancellation, worker/IndexedDB failure are all caught and surfaced
  as a readable message via the job system, not a raw stack trace. A
  top-level React error boundary (`ErrorBoundary.tsx`) additionally catches
  any *unexpected* render-time error and shows a plain "GifForge needs to
  restart" recovery screen with a reload button, instead of an unrecoverable
  blank white page — verified live by intentionally throwing from `App` and
  confirming the recovery UI renders instead of a blank page.
- **New Project** — a "New" button (with an inline confirm) in the top bar
  closes the current project and returns to the upload screen, fully
  cleaning up: terminates and lazily-recreates the worker (freeing its
  decoded frames and registered overlay assets), closes all cached
  `ImageBitmap`s, clears the autosave record, and resets editor/playback UI
  state. Verified live: loaded GIF A with an overlay, clicked New, confirmed,
  loaded GIF B — B loads correctly with zero leftover layers from A.
- **Non-destructive editing model** — the original decoded source frames
  never leave the worker's memory / never get overwritten; every tool writes
  to `EditOperations`/`Layer[]` and the pipeline re-renders from source on
  demand.
- **Coordinate system** — single image-space source of truth
  (`core/coordinates`), unit tested, used identically by the canvas drag
  handlers and the numeric inspector fields.
- **Code-split bundle** — the interactive editor canvas (`EditorCanvas.tsx`,
  which pulls in `react-konva`/`konva`, the largest dependency) is
  `React.lazy`-loaded behind a `<Suspense>` boundary, so the upload screen
  loads without it. Cut the main JS chunk from 600KB to 300KB minified (91KB
  gzip in the separately-loaded editor chunk, 98KB gzip in the main chunk),
  eliminating Vite's chunk-size warning. Verified live that the lazy chunk
  resolves correctly and the editor still works after the change.
- **Explicit full-quality preview** (`FullQualityPreview.tsx`) — a "Full
  Quality" button in the canvas toolbar renders the current frame through the
  exact same full-resolution worker pipeline used for export/optimize
  (`renderPreviewFrame`, bypassing the downscaled/Konva-transform preview
  path) and shows it in a lightbox. Verified live with a 90° rotation
  applied: the lightbox correctly rendered at the rotated 291×441 bounding
  box, not the un-rotated 441×291.
- **Frame-selection invert** (Timeline) — added alongside the existing
  select-all/clear. Verified live: inverting a `1-5` selection against 24
  frames correctly produced `6-24`.
- **Canvas toolbar shows real output dimensions**, not just the original
  source size — e.g. `221 × 146 (from 441 × 291)` after a 50% resize.
  Verified live.

# IN PROGRESS / PARTIAL

- **Timeline virtualization** is a simple windowed-range render (visible
  range ± a small buffer, recomputed on scroll), not
  `IntersectionObserver`-based. Works correctly and stays responsive in
  testing with a 44-frame fixture; not stress-tested with a
  many-thousand-frame GIF.
- **Performance Mode** currently only affects initial preview-bitmap
  resolution. It does not yet reduce thumbnail count/resolution independently
  or delay non-essential work beyond that.

# TODO (not implemented)

- MP4 / WebM export (explicitly optional for MVP per spec; not started —
  architecture keeps it isolable as a future lazy-loaded module since the
  export pipeline is already decoupled from the GIF codec specifically).
- ZIP export of multiple selected static frames (single-frame export only).
- APNG / WebP animation export, SRT subtitles, chroma key, stickers, batch
  processing/export, filters/effects, cloud integration — all explicitly
  deferred per spec's "don't implement now" list.
- A dedicated "compare original vs. cropped/edited" split-view — the
  Optimize panel's Before/After is numeric + a download link, not a visual
  side-by-side canvas.

# KNOWN LIMITATIONS

- **Export/optimize quantization always uses one shared palette across all
  frames** (sampled from every frame, bounded pixel budget). This avoids
  cross-frame palette flicker but means per-frame palette optimization
  (better color accuracy on frames very different from the rest of the
  animation) isn't available.
- **No built-in redundant-frame detection/skipping** for optimization beyond
  the explicit frame-rate-reduction search step — a GIF with many
  byte-identical consecutive frames isn't automatically deduplicated.
- **Dithering can increase file size** for naturally low-color, flat-graphic
  sources (confirmed while testing: a simple spinner icon's "Balanced"-preset
  optimized output was larger than the original despite a 4x pixel-count
  reduction from resize, because Floyd–Steinberg dithering destroys the
  long flat-color runs that made the original LZW-compress so well). This is
  a genuine, inherent GIF-compression tradeoff, not a bug — disabling
  dithering or using a lower-color preset resolves it for such sources.
- **No sub-rectangle frame-diffing on export** — every exported frame is
  encoded as a full-canvas image (gifenc's `writeFrame` doesn't expose a
  sub-rectangle image descriptor), so GifForge can't currently produce the
  "only encode the changed pixels" size optimization that some hand-tuned
  GIFs use. Correctness is unaffected; only a potential extra size-reduction
  opportunity is left on the table.
- **Large-file stress testing was not performed** beyond the memory-estimate
  math and a 1MB/44-frame real fixture. Behavior on genuinely huge
  (hundreds-of-MB) GIFs is based on the estimate-and-warn logic, not observed.
- **Only Chromium was tested** (via Playwright, headless). No manual
  cross-browser (Firefox/Safari) verification was performed.

# TECHNICAL DECISIONS

- **GIF codec**: `gifuct-js` (decode, MIT) + `gifenc` (quantize/encode, MIT),
  wrapped behind `GifDecoder`/`GifEncoder`-shaped internal modules
  (`core/gif/decoder.ts`, `core/gif/encoder.ts`) so either could be swapped
  later without touching the rest of the app. Chosen after a Phase-0 spike
  round-tripped two real GIF files (decode → composite → re-encode →
  re-decode) successfully before any UI was built. `gifenc` ships no
  TypeScript types; a minimal hand-written `.d.ts` covers only the functions
  actually used.
- **One unified worker**, not several — see ARCHITECTURE.md. Chosen to avoid
  transferring large per-frame RGBA buffers between multiple workers.
- **Dithering is hand-implemented** (Floyd–Steinberg, `quantize.ts`) since
  `gifenc` provides palette/quantize/apply-palette primitives but no
  dithering algorithm itself.
- **Interactive editor canvas uses react-konva**; the actual export/render
  pipeline uses raw `OffscreenCanvas` 2D APIs in the worker and has zero
  dependency on React or Konva, per the requirement that final rendering not
  depend on DOM rendering.
- **History stores full `Project` snapshots**, not diffs/patches. This is
  intentionally simple: `Project` never contains pixel data (that lives only
  in the worker, keyed by nothing more than "the current source" — GifForge
  is single-document), so a snapshot is cheap (typically a few KB of JSON),
  and `structuredClone` + snapshot equality is far simpler and more robust
  than a patch/diff system for a scope this size.
- **TypeScript pinned to 5.6.3** (not the newest 5.9.x that `npm install`
  initially resolved) after hitting a real build break: TS 5.7+ made typed
  arrays generic over `ArrayBufferLike`, which broke `new ImageData(...)`
  calls throughout the render/encode pipeline against `Uint8ClampedArray`
  buffers that are always plain `ArrayBuffer` in practice. Pinning avoided
  threading speculative generic type params through every buffer-handling
  function for a TS-version quirk unrelated to actual correctness.
- **Vite (classic, not the experimental rolldown-vite variant the scaffold
  defaulted to) + Vitest + ESLint 8**, chosen over the bleeding-edge versions
  `npm create vite@latest` initially installed, prioritizing build stability
  per the project's stated priorities.

# TEST STATUS

- **Unit tests**: 64 passing (`npx vitest run`), 7 files — frame-range
  parsing, coordinate math, crop/resize/rotate math, frame-order
  edit operations, the GIF disposal compositor (all 4 disposal types +
  transparency), target-size search config ordering (including two
  regression tests for the cartesian-explosion bug described below), and
  two real-file decode/encode/round-trip integration tests using actual
  downloaded GIF fixtures (`fixtures/rotating-earth.gif`, 44 frames;
  `fixtures/loading-icon.gif`, 24 frames).
- **Typecheck**: `npx tsc -b` — clean, zero errors.
- **Lint**: `npx eslint . --ext ts,tsx` — clean, zero errors/warnings.
- **Production build**: `npm run build` — succeeds.
- **Browser smoke tests**: performed with Playwright (headless Chromium)
  driving the real Vite dev server, checking console/page errors at every
  step and inspecting actual downloaded bytes / canvas pixel data (not just
  screenshots). Flows verified: upload → decode → preview → playback UI →
  timeline thumbnails → crop tool → export → re-decode exported file
  (correct dims/frame-count/**timing**); resize → speed → reverse → rotate →
  undo×2 → text layer + preset (pixel-verified on canvas) → optimize (real
  size/palette/dimension change) → download optimized file; image overlay
  upload with transparency (pixel-verified) → static PNG frame export
  (signature-verified); edit → reload → autosave restore (state-verified).
  Zero console errors or uncaught page errors across all runs.

## Bugs found and fixed (all caught by live-browser/real-file verification, not code review)

1. **10x playback speed bug**: `compositor.ts` was multiplying `gifuct-js`'s
   per-frame delay by 10 a second time (`gifuct-js` already converts the GIF
   spec's raw 1/100s units to milliseconds internally), causing every
   exported GIF to play 10x slower than its source. Caught by decoding an
   actual exported file and comparing its timing to the source's. Fixed in
   `compositor.ts`, covered by updated assertions in `compositor.test.ts`.
2. **Layer reorder buttons moved layers the wrong direction**: `LayerList.tsx`'s
   "Move up" button increased the layer's array index and "Move down"
   decreased it — backwards. Caught by scripting an actual click on "Move
   up" and asserting the panel order actually changed (it didn't). Fixed,
   and boundary cases (top/bottom item) now correctly disable the
   inapplicable button.
3. **Inverted layer z-order convention**: layers were drawn bottom-to-top in
   raw array order, meaning index 0 (rendered at the *top* of the Layers
   panel, and where new layers were being appended) was actually the
   *back-most* layer in both the interactive preview and the real export —
   the opposite of the standard design-tool convention (top of panel =
   front of stack) and the opposite of what "move up" should mean once bug
   #2 was fixed. Caught by adding two overlapping opaque solid-color
   overlays and checking the actual center pixel color, in both the live
   canvas and a re-decoded real export, against which one should be on top.
   Fixed by reversing draw order in both `pipeline.worker.ts` (export) and
   `EditorCanvas.tsx` (interactive preview), and by prepending (not
   appending) new layers in `projectStore.addLayer` — re-verified pixel-exact
   in both the canvas and a fresh real export after the fix.
4. **Target-size search silently failed to reach reachable targets**: a live
   test on a 44-frame/400×400 real GIF, targeting 256KB with every reduction
   flag enabled, only reached 356.5KB. Root cause: `buildCandidateConfigs`
   generated a full cartesian product (10 color steps × 2 dither states ×
   up to 4 frame steps × up to 5 scale steps = up to 400 configs), and the
   search's `maxAttempts` cap (24) sliced that list before frame-rate or
   resolution reduction — both explicitly enabled by the user — were ever
   reached; every attempt was spent re-trying color/dither combinations at
   100% scale and frame rate. Fixed by rewriting it as a linear, one-
   dimension-at-a-time walk (colors down → dither off → frame rate down →
   resolution down, matching the spec's stated priority order), which stays
   under ~18 steps even with everything enabled. Re-verified live on the
   same file/target/flags: now reaches 167.6KB, genuinely using frame-rate
   reduction (44→22 frames, confirmed by re-decoding the file). Two new
   regression tests added to `targetSizeSearch.test.ts` assert the walk
   reaches every allowed dimension's extreme within a bounded config count.
5. **Dithering had no color-lookup cache, making the target-size search
   impractically slow**: a live browser test hit a 60-second timeout running
   the target-size search on the same 44-frame/400×400 fixture. Direct
   Node-level measurement isolated the cause: `ditherFrameToPalette`'s
   nearest-palette-color search was a naive O(pixels × palette size) linear
   scan with no memoization, costing ~3.3 seconds per encode attempt at 128
   colors (worse at 256) — multiplied across up to 24 real-encode attempts,
   multi-minute searches were possible. Fixed by adding a coarse-bucketed
   (5 bits/channel) nearest-color cache shared across all frames in an
   encode (`createNearestColorCache` in `quantize.ts`), the same strategy
   `gifenc`'s own `applyPalette` already uses internally. Re-measured on the
   same fixture at the worst case (256 colors): 3.3s+ → 65ms, a 100% cache
   hit rate (only 255 unique color buckets across 7 million pixels on this
   image) — roughly a 50x speedup. The target-size search that previously
   timed out at 60s now completes well within it.
6. **Playback wraparound used a stale frame count after deleting/keeping
   frames**: `playbackStore.frameCount` was only ever set on initial load and
   on autosave restore — never after `deleteFrames`/`keepFrames`/`reverse`/
   `resetToOriginal`/undo/redo. The playback loop's `(currentFrameIndex + 1)
   % frameCount` therefore used the *original* frame count forever, and a
   `currentFrameIndex` left pointing past a newly-shortened frame list (e.g.
   scrub to frame 10, then delete frames 1–15) rendered a blank frame until
   manually scrubbed back into range. Root cause: no single place kept
   `frameCount`/`currentFrameIndex` in sync with `project.edits.frameOrder`,
   which can change via many different actions. Fixed with a subscription
   (`useSyncPlaybackFrameCount`) on `projectStore` that re-derives frame
   count from `frameOrder.length` on every project change — one general
   mechanism instead of patching each call site — which also reuses
   `setFrameCount`'s existing index-clamping. Verified live: deleting down to
   3 frames and playing wraps correctly within 1–3 with visible content;
   scrubbing to frame 10 then deleting frames 1–15 correctly clamps to the
   new last frame ("Frame 9 / 9") with visible content, not a blank frame;
   deleting *all* frames degrades gracefully (no crash, a clear "Cannot
   encode a GIF with zero frames" error if export is attempted anyway).
7. **Overlay-image assets were never freed from the worker, and only
   partially freed on the main thread**: deleting an overlay layer (or
   discarding it via "Reset to original", undo/redo past its creation, or
   autosave restore) removed the IndexedDB-persisted blob but never called
   the worker's `removeAsset`, and only the *explicit* delete-overlay button
   cleaned up the main-thread bitmap cache at all — every other path leaked
   both. Fixed generally, the same way as bug #6: a subscription
   (`useGarbageCollectAssets`) diffs the set of `assetId`s actually
   referenced by `project.layers` on every project change and frees any
   `assetId` that drops out, in both `frameCacheStore` and the worker.
   Verified live: delete an overlay → add a new one → both the live canvas
   and a fresh real export show only the new overlay's color, not the old
   one's; "Reset to original" with an overlay present cleanly removes it and
   the app remains fully functional afterward.

## Verification rounds

- **Round 1** (initial build): typecheck/lint/62 unit tests/build all clean;
  Playwright pass covering upload→decode→preview→timeline→crop→export→
  re-decode (dims/frame-count/timing); resize→speed→reverse→rotate→undo×2→
  text+preset (pixel-verified)→optimize (real size/palette/dimension
  change)→download; transparent overlay (pixel-verified)→static PNG export
  (signature-verified); edit→reload→autosave-restore (state-verified). Found
  and fixed bug #1 above.
- **Round 2** (code-splitting, invert-selection, toolbar dimension fix):
  re-ran the full clean suite; confirmed the lazy-loaded editor chunk
  resolves correctly, the toolbar shows real post-resize output dimensions,
  frame invert/delete work, and *actual simulated keyboard shortcuts*
  (Ctrl+Z, Ctrl+Shift+Z, Space, Delete — not just their button equivalents)
  work end-to-end.
- **Round 3** (MVP-checklist closure): verified drag-and-drop upload via a
  real synthetic `DataTransfer` drop event (not `setInputFiles`), invalid-file
  rejection, timeline click-to-scrub, and — pixel/byte-level, not just
  UI-level — that Speed and Reverse genuinely change exported output.
  Found and fixed bugs #2 and #3 above while verifying layer reordering,
  then re-verified pixel-exact after the fix, in both the live canvas and a
  fresh real export.
- **Round 4** (heavier-workload closure, using the 44-frame/400×400/~1MB
  `rotating-earth.gif` fixture instead of the 24-frame spinner, specifically
  to exercise code paths the smaller fixture couldn't): an aggressive
  target-size search (256KB target, every reduction flag on) hit a 60s
  timeout, which led to finding and fixing bugs #4 and #5 above. Re-ran the
  full clean suite (64 unit tests now) and re-verified live: the same
  search now completes well under the old timeout and genuinely reaches its
  target: 167.6KB (from a 978.2KB original), using real frame-rate reduction
  (confirmed 44→22 frames by re-decoding the downloaded file). Also verified
  JPEG static-frame export (valid `FFD8` signature) on this pass.
- **Round 5** (asked to specifically re-audit for anything real still
  missing — edge cases, error handling, memory lifecycle — rather than
  re-confirm what Round 1–4 already covered): found that there was no way to
  close a project and upload a different GIF at all (the "New" action didn't
  exist in the UI), that `playbackStore.frameCount` went stale after any
  frame-count-changing edit, that overlay-asset bitmaps leaked on every path
  except the one explicit delete button, and that there was no top-level
  error boundary (an uncaught render error would blank the whole page with
  no recovery). Implemented and fixed all four (New Project flow, bugs #6
  and #7 above, and `ErrorBoundary.tsx`), re-ran the full clean suite, and
  verified each live: New Project (close-with-overlay → confirm → load a
  different file → zero leftover layers); frame-count sync (delete-to-3-and-
  play wraps correctly with visible content; scrub-then-delete clamps to the
  new last frame; delete-all-frames degrades gracefully; zero-frame export
  fails with a clear message, not a crash); asset GC (delete overlay → add
  new one → both live canvas and a fresh real export show only the new
  color; "Reset to original" cleans up correctly); and the error boundary
  (intentionally threw from `App`, confirmed the recovery screen renders
  instead of a blank page, then reverted the test throw).

All five rounds: zero console errors or uncaught page errors.
