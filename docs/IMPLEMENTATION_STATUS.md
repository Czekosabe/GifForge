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
- **Before/After** — real visual comparison (`BeforeAfterCompare.tsx`), not
  just numbers: both sides are actual decoded frames (the real uploaded
  source bytes vs. the real optimized GIF bytes the download button sends —
  never a CSS filter or guessed effect), draggable split view with
  keyboard-accessible divider (arrow keys/Home/End), an Animated mode
  (independently-clocked per side so differing frame counts/rates from
  frame-rate reduction stay honestly in sync rather than faking a 1:1 frame
  correspondence) and a Frame mode (reuses the editor's current timeline
  frame, proportionally mapped if frame counts differ), plus size/%
  saved/dimensions/frame count/duration for both sides. The result
  invalidates itself (hides, releases its decoded bitmaps) if the project
  changes after it was produced, so a stale result can't keep looking
  current. Verified live, including a pixel-exact check: the comparison
  canvas's decoded pixel data matches the real downloaded file's decoded
  pixel data exactly, confirming the "after" view is the actual optimizer
  output, not an approximation.
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
  report real (not synthetic) progress fractions from the worker. Starting a
  New Project while a job is still `'running'` cancels it in the store
  before terminating the worker, so its toast can't get orphaned mid-flight
  (see bug #11) — see `docs/ARCHITECTURE.md`'s "Job lifecycle" section for
  the full ordering.
- **Cancellation** — `AbortController`-based, wired for optimize and export.
  The worker's render/encode loops cooperatively yield to the event loop
  every few frames/attempts (`yieldToEventLoop`) specifically so a queued
  Comlink cancel message actually gets a chance to be delivered and observed
  mid-operation — see bug #9; without this, a synchronous worker call can't
  receive any incoming message, including its own cancellation, until it
  finishes on its own. Only one export/optimize can be in flight at a time
  per project — see "Heavy-job exclusivity" below and bug #10.
- **Heavy-job exclusivity** — `exportGif`/`optimize` share one worker
  instance and one `AbortController`; starting a second heavy operation
  while one is already running throws a clear "Another export or
  optimization is already running." error instead of silently racing on
  that shared controller (which previously meant Cancel could abort the
  wrong job). The controller is always reset in a `finally` block so the
  guard reliably releases once an operation ends, however it ends — see
  bug #10.
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
- **Visual Before/After comparison for Optimize** — see the "Before/After"
  bullet above. Was the top item in NEXT PRIORITIES; done as of this entry.

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
- **Large-file stress testing**: performed this session with a synthetic
  600-frame, 480×360 GIF (estimated decoded memory ~415MB, above the 300MB
  Performance Mode threshold; generated via `scripts/generate-stress-fixture.cjs`,
  not committed — see that script's header for why). Results, measured, not
  estimated: load (decode + composite + preview bitmaps) completed in ~5.2s;
  Performance Mode's badge correctly appeared; the timeline stayed windowed
  (19–23 DOM thumbnail nodes rendered at any time, not 600) and scrolling
  stayed responsive (~300ms to scroll and settle); playback and tool-panel
  switching stayed responsive throughout; export completed in ~10.4s,
  producing a real, 27.6MB, correctly-dimensioned, correctly-framed,
  re-decodable GIF; zero console/page errors. Not tested: files in the
  hundreds-of-MB-compressed or multi-GB-decoded range (the 2GB hard-cap
  refusal path is implemented but this session did not construct a fixture
  large enough to exercise it).
- **Browser compatibility — WebKit's OffscreenCanvas gap**: the WebKit build
  used for this project's Playwright tests has **no OffscreenCanvas support
  at all**, on the main thread or in a Worker (verified directly:
  `typeof OffscreenCanvas` is `undefined` in both contexts) — real, current
  Safari's support was not independently verified, since no actual Safari
  was available to test against. GifForge's worker-side render pipeline
  (export, optimize, static-frame export, and downscaled thumbnails/preview
  bitmaps) depends on OffscreenCanvas; a capability check
  (`assertOffscreenCanvasSupport` in `pipeline.worker.ts`) now makes these
  fail fast with a clear, actionable message instead of a native
  `ReferenceError`, and preview bitmaps/thumbnails fall back to
  full-resolution `createImageBitmap` (more memory, but the app stays
  usable) rather than failing outright. Upload, decode, playback, timeline,
  and interactive crop/resize/rotate/text/overlay preview (all Konva/main-
  thread, no OffscreenCanvas needed) are unaffected and fully verified
  working in this WebKit build. See "Browser test results" below for exact
  numbers.
- **Before/After's "Original" side is the raw uploaded file, not a
  full-quality re-encode of the current edits**: a deliberate choice, for
  consistency with the numeric size comparison's pre-existing semantics
  (`project.metadata.sourceFileSizeBytes`, unchanged by this session) and
  to avoid the cost of an extra full-quality encode on every optimize run.
  If the user crops/resizes/rotates/adds layers/deletes frames *before*
  running Optimize, the comparison legitimately shows those edits too, not
  only quantization/dithering/palette/resolution effects in isolation —
  still real, honest data (never synthetic), just a coarser comparison than
  a hypothetical edits-held-constant baseline would give. Worth revisiting
  only if this specific framing turns out to confuse real users in
  practice.

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
- **Browser regression tests (`e2e/`, Playwright, `npm run test:e2e`)**: 30
  persisted tests across 6 files, actually part of this repository (unlike
  prior sessions' ad hoc scratch scripts — see `docs/PROGRESS.md`'s
  2026-09-04 20:13 entry). Each real-browser-only regression case earlier
  sessions found manually (layer z-order, layer reorder direction, target-
  size search reduction ordering, frame-count sync after delete, error-
  boundary recovery, cancel-doesn't-cancel, overlapping-job races, orphaned
  job toasts, the visual comparison's real-data guarantee, etc.) now has a
  permanent test guarding it. CI runs the chromium project on every
  push/PR; the full cross-browser run (`npm run test:e2e`, all three
  engines) is run periodically/manually.

  ### Browser test results (last run 2026-09-04, this repo's actual `e2e/` suite)

  | Browser  | Passed | Skipped | Failed | Notes |
  |----------|-------:|--------:|-------:|-------|
  | Chromium | 30/30  | 0       | 0      | CI default (`npm run test:e2e -- --project=chromium`) |
  | Firefox  | 30/30  | 0       | 0      | Run manually this session; not in CI |
  | WebKit   | 18/30  | 12      | 0      | 12 tests skip with an explicit reason: export/optimize/static-frame-export/before-after-compare need OffscreenCanvas, unavailable in this WebKit build (see "Known Limitations") |

  "TESTED" below means an assertion in this table or in `e2e/` actually ran
  and passed against that engine this session — not inferred or assumed.

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
8. **Overlay assets and autosave silently failed to persist in WebKit**:
   running the newly-persisted e2e suite against a real WebKit build (see
   "Browser compatibility" in Known Limitations) surfaced
   `UnknownError: Error preparing Blob/File data to be stored in object
   store` — a real WebKit IndexedDB limitation: raw `Blob`/`File` objects
   cannot be `put()` directly into an object store in this build, though a
   plain `ArrayBuffer` can. This broke two things at once, both going
   through the same `db.ts` storage layer: adding an image overlay (which
   silently never got added as a layer at all — `OverlayPanel.tsx`'s error
   handling aborted before `addLayer`) and autosave (the warning was visible
   in the console but the project was never actually persisted). Fixed by
   converting `Blob`s to `ArrayBuffer` (plus a stored MIME type) at the
   `db.ts` storage boundary and reconstructing a `Blob` on read — the public
   `saveAsset`/`loadAssets`/`saveProjectAutosave`/`loadProjectAutosave` API
   (and every caller) is unchanged. Also made overlay-asset persistence
   best-effort: a storage failure no longer prevents the overlay from being
   usable for the rest of the current session, only from surviving a
   reload. Verified live in WebKit: overlay upload, "Reset to original",
   and autosave/restore all went from failing to passing after this fix
   (see the before/after counts in "Browser test results" below), with zero
   change to Chromium/Firefox behavior (still 25/25 after the fix).
9. **Cancel did not actually stop an in-progress export or optimization**:
   `renderAllFrames`/`encodeGif`/`runTargetSizeSearch` ran as one fully
   synchronous block inside the worker with no `await` points. A Worker can
   only process an incoming `postMessage` — including the Comlink RPC call
   that triggers `AbortController.abort()` — between synchronous stretches
   of JS, so clicking "Cancel" never actually got delivered to the worker
   until the operation had already run to completion on its own; the
   button changed labels but the work kept running regardless. Caught while
   writing a new e2e test for the cancel button (there had been zero
   coverage of it before): the test's 5-second wait for the UI to return to
   "Run optimization" after cancelling timed out, because the ~8-second
   search was still running uninterrupted underneath. Fixed by making
   `encodeGif`/`runTargetSizeSearch`/`renderAllFrames` `async` and yielding
   to the event loop every few frames/attempts (`yieldToEventLoop` in
   `src/core/util/`), so a pending cancel is actually observed mid-operation
   instead of only before it starts or after it finishes. This also
   uncovered a second, related bug: the aborted operation's rejected
   `EncodeCancelledError` promise still reached the panel's `catch` block
   and called `failJob()`, overwriting the job's `'cancelled'` status back
   to `'failed'` and showing a red "Encoding was cancelled." error toast for
   a routine user action — and `ExportPanel`'s cancel button never called
   `cancelJob()` at all (unlike `OptimizePanel`'s), so it hit the same
   symptom from a different path. Both panels now check the job's current
   status before calling `failJob`, and `ExportPanel` tracks its job id the
   same way `OptimizePanel` already did. Verified live: the new e2e test
   clicks Cancel ~300ms into a real ~8s target-size search and confirms no
   error toast, the Run button reappears promptly, and the worker is still
   usable for a follow-up run afterward — passes on Chromium and Firefox
   (skipped on WebKit, consistent with the rest of this suite, since it
   needs OffscreenCanvas). `ExportPanel`'s identical fix was not separately
   e2e-tested: a plain export of this repo's committed fixtures completes
   in well under a second, too fast to reliably intercept mid-flight
   without flaky timing — it shares the exact same `renderAllFrames`/
   `encodeGif` code path already proven by the optimize test.
10. **Overlapping export/optimize jobs could race and cancel the wrong
    one**: nothing in the UI (`LeftToolbar.tsx`) stops a user from
    switching tools mid-job and starting a *second* heavy operation while
    one is already running — export and optimize share a single worker
    instance and a single `abortController` field. Concretely: start an
    export, switch to Optimize before it finishes, start a target-size
    search — after bug #9's fix made both operations genuinely
    interleave (each yields periodically), the second call's
    `this.abortController = new AbortController()` silently overwrote the
    first job's controller. Clicking Cancel on either job would then abort
    whichever one started most recently, not the one intended, and
    `renderAllFrames`'s abort check (`this.abortController?.signal.aborted`
    — reading the live field rather than a signal captured at that
    operation's start) could observe the *other* job's cancellation
    entirely. Separately, `abortController` was only ever reset to `null`
    on the success path, never in a `finally`, so it stayed stale after any
    cancellation or real error until the next call happened to overwrite
    it. Found while double-checking bug #9's fix for exactly this kind of
    reachable edge case, not by accident. Fixed by giving `exportGif`/
    `optimize` a proper in-flight guard: each throws a clear "Another
    export or optimization is already running." error if
    `this.abortController` is already set at entry, and both now reset it
    in a `finally` block so the guard reliably releases once an operation
    ends, however it ends. Verified live: a new e2e test starts a real ~8s
    target-size search, switches tools, and clicks Export mid-search —
    confirms the clear rejection message appears (not a silent race or a
    stuck UI) and that a fresh optimization still completes normally
    afterward, proving the guard actually releases rather than getting
    permanently stuck.
11. **A running job's toast survived New Project, frozen forever**:
    `startNewProject()` (`useLoadGif.ts`) terminates the worker to free
    memory but never touched the global job store. A job still `'running'`
    at that moment — e.g. an optimize search abandoned by starting a new
    project before it finished — has its Comlink call terminated without
    ever resolving or rejecting, so nothing ever marked it done; its
    progress toast stayed on screen forever, frozen at whatever
    message/progress it last had. Worse, `JobStatusBar` only renders a
    dismiss button for `'failed'` jobs, so a stuck `'running'` one could
    never be cleared by the user at all short of a full page reload.
    Reproduced directly with a throwaway probe script (not committed):
    started a target-size search, immediately started a New Project, and
    watched the "Trying 256 colors…" toast sit frozen on screen 12+
    seconds after the search would have finished on its own. Fixed by
    cancelling every currently-`'running'` job in the store before
    terminating the pipeline in `startNewProject()` — the same resolution
    a user-clicked Cancel already provides for a single job, just applied
    to whatever job(s) happen to be in flight when the project itself is
    discarded. Verified live: a new e2e test starts a real optimize job,
    triggers New Project mid-run, and confirms the toast disappears
    immediately and stays gone 9+ seconds later (ruling out a delayed
    progress callback resurrecting it).

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
- **Round 6** (this session — repository/process maintenance + another
  independent audit; see `docs/PROGRESS.md`'s 2026-09-04 entries for the
  full account): converted the prior sessions' ad hoc, non-repository
  Playwright scripts into 25 persisted `e2e/` tests; ran them for real
  against Chromium, Firefox, *and* WebKit (previously only Chromium had
  ever actually been run) and found and fixed bug #8 above (WebKit
  IndexedDB Blob storage) and added graceful OffscreenCanvas feature
  detection; stress-tested a synthetic 600-frame/480×360/~415MB-estimated
  GIF (see "Large-file stress testing" above for the real measured
  numbers); along the way, discovered and corrected a *process* issue, not
  an app bug — leaving large generated stress-test binaries sitting in the
  Vite-watched project root destabilized the dev server itself (intermittent
  hangs/timeouts unrelated to GifForge's own code), which had produced
  misleading results earlier in this same session until traced to its
  actual cause; `scripts/generate-stress-fixture.cjs` now documents writing
  such fixtures outside the project root.

All six rounds: zero console errors or uncaught page errors (except where a
test intentionally exercises an error path, which is asserted on directly).

# TECHNICAL DEBT

Shortcuts and workarounds taken deliberately, that should be revisited if
they start costing more than they saved:

- ~~**`npm audit` reports 5 vulnerabilities**~~ — **Resolved 2026-09-04.**
  The earlier note here claimed fixing this required the experimental
  rolldown-based Vite 8 and left it as accepted debt. That was wrong: Vite
  7.x is still the stable Rollup-based lineage and pulls a patched esbuild,
  so it resolves
  [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
  without touching the experimental rewrite. Upgraded `vite` 5→7,
  `vitest` 2→3, `@vitejs/plugin-react` 4.3→4.7 (the versions that support
  Vite 7 without forcing Vite 8), and removed the unused
  `vite-plugin-static-copy` dependency. `npm audit` now reports 0
  vulnerabilities; full verification (typecheck/lint/unit tests/build/all
  three Playwright browser projects/`npm ci` reproducibility) all matched
  pre-upgrade results exactly. See `docs/PROGRESS.md` for the full record.
- **The full three-browser e2e suite is not in CI**, only Chromium is (see
  `.github/workflows/ci.yml` and `playwright.config.ts`) — a deliberate
  runtime/complexity tradeoff (WebKit alone takes ~40s–8min depending on
  pass/fail mix; all three would meaningfully slow every PR). Firefox and
  WebKit are still first-class, easily-runnable local projects
  (`npm run test:e2e -- --project=firefox`), just not automated per-push.
  Revisit if WebKit support becomes a real product priority (see Next
  Priorities) — at that point the failing/skipped WebKit tests would need
  to actually pass, and adding a WebKit CI job would be worth the time cost.
- **Overlay-asset persistence is now explicitly best-effort** (see bug #8):
  a `saveAsset` failure is caught and logged rather than blocking the user.
  This is the right tradeoff for a *storage* failure, but it does mean a
  systemic IndexedDB problem (quota exhausted, private browsing in a
  browser that fully disables it, etc.) degrades silently-ish (a
  `console.warn`, no user-facing toast) rather than surfacing clearly. A
  one-time "autosave isn't working" notice would be a reasonable follow-up
  if this turns out to matter in practice.
- **No sub-rectangle frame-diffing on export** (already listed under Known
  Limitations) is technical debt as much as a limitation — the encoder
  interface (`core/gif/encoder.ts`) was intentionally kept simple pending
  evidence that output size actually needs it for real users' GIFs.

# NEXT PRIORITIES

Ranked by expected value given the current state — highest first:

1. **Get WebKit's 12 skipped tests passing**, if real Safari/WebKit support
   turns out to matter for the target audience. Requires either confirming
   real Safari *does* support OffscreenCanvas (in which case the gap is
   specific to Playwright's bundled WebKit test build, not a real product
   problem, and the fix is just re-verifying against real Safari) or, if
   real Safari genuinely lacks it too, implementing a non-OffscreenCanvas
   fallback render path for the export/optimize pipeline specifically —
   a real architectural addition, not a quick fix, so worth confirming the
   premise first.
2. **A pixel-level zoom/magnifier for the Before/After viewer's Frame
   mode** — the viewer already renders at full native resolution (no
   worker-side downscale) specifically so dithering/quantization texture
   isn't blurred away, but there's currently no in-app way to zoom in on it
   beyond the browser's own page zoom. A natural, contained follow-up to
   what shipped this session, not a new subsystem.
3. **Sub-rectangle frame diffing on export**, *only* if a real GIF's output
   size becomes a concrete complaint — correctness must not regress, so
   this needs its own disposal-correctness test coverage before shipping.
4. **A one-time "autosave isn't working" notice** if overlay-asset/autosave
   persistence fails (currently a caught, logged, best-effort failure with
   no user-facing signal — see Technical Debt) — worth it if silent storage
   failures turn out to actually confuse users in practice.
5. Everything explicitly deferred per the original spec (MP4/WebM, ZIP
   export, APNG/WebP, subtitles, batch processing, filters) remains
   correctly out of scope until requested.
