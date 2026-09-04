# GifForge Architecture

## Overview

GifForge is a 100% client-side animated GIF editor. No user file or pixel data
ever leaves the browser tab. The app is a Vite + React + TypeScript SPA with a
single dedicated Web Worker doing all heavy image work.

## Layers

```
UI (React + Zustand)  --Comlink-->  Worker (GifPipeline)
       |                                    |
  project model                    decode / composite / render
  (types/project.ts)                quantize / encode / optimize
       |                                    |
  storage (Dexie/IndexedDB)          core/* (pure, unit-tested)
```

- **UI** — React components under `src/components`, `src/tools`, `src/editor`.
  Purely presentational + interaction; never does GIF decoding/encoding itself.
- **Project model** — `src/types/project.ts`. A serializable, non-destructive
  description of the edit ("recipe"), not pixel data.
- **Render engine** — `src/core/render`. Pure-ish canvas compositing
  (crop → resize → rotate → layers), driven by the project model. Runs only in
  the worker (`OffscreenCanvas`); never touches the DOM.
- **GIF codec** — `src/core/gif`. `decoder.ts` (gifuct-js + our own disposal
  compositor), `encoder.ts` (gifenc), `quantize.ts` (palette + dithering).
  The rest of the app depends on these modules' function signatures, not
  directly on gifuct-js/gifenc — swapping either library later only touches
  these two files.
- **Worker** — `src/workers/pipeline.worker.ts`. One unified worker exposing a
  `GifPipeline` class via Comlink. See "Why one worker" below.
- **State** — `src/state/*`, five separate Zustand stores (see below).
- **Storage** — `src/storage/db.ts`, a thin Dexie wrapper for autosave.

## GIF pipeline (decode → edit → export)

1. **Decode** (`core/gif/decoder.ts`): `gifuct-js` parses the GIF structure and
   LZW-decompresses each frame's raw sub-rectangle patch (`patch`, `dims`,
   `disposalType`, `delay`).
2. **Composite** (`core/gif/compositor.ts`): patches are NOT independent full
   frames — GIF frames can be partial, transparent, and depend on disposal of
   the previous frame. `compositeGifFrames` walks the frame list maintaining a
   running full-canvas buffer and applies disposal method 0/1 (leave as-is),
   2 (clear frame's rect to transparent after showing), or 3 (restore the
   rect to its pre-frame state) — this is the module most GIF bugs live in,
   so it's pure and has the heaviest unit test coverage (`compositor.test.ts`,
   covering all four disposal types plus partial-transparency compositing).
3. **Edit** (`types/project.ts` `EditOperations`): frame order (delete/keep/
   reverse are all just reorderings of a 0-based index array over the
   original decoded frames — nothing is ever destructively dropped from the
   worker's decoded buffer), crop, resize, rotate, speed factor. Stored as
   data, applied lazily at render time.
4. **Render** (`core/render/compositeFrame.ts`): for a given frame, runs
   source → crop → resize → rotate → text/overlay layers, in that order, onto
   an `OffscreenCanvas`. Text and image-overlay layers are filtered per-frame
   by `core/selection/frameRange.ts` (`"1-10,15,20-25"` syntax).
5. **Quantize + encode** (`core/gif/quantize.ts`, `core/gif/encoder.ts`): one
   shared palette is built from a bounded pixel sample across *all* frames
   (not per-frame), specifically to avoid the "different frames use different
   palettes → flicker" failure mode. Optional Floyd–Steinberg dithering (hand
   implemented — gifenc ships palette/quantize/encode primitives but no
   ditherer), with a coarse-bucketed nearest-color cache shared across every
   frame in an encode (the same strategy `gifenc`'s own `applyPalette` uses
   internally) — without it, dithering a 44-frame/400×400 animation against a
   256-color palette costs several seconds *per encode attempt*, which
   multiplies badly across the target-size search's up to 24 real attempts;
   the cache cut that to tens of milliseconds in testing (~50x). `gifenc`'s
   `GIFEncoder` writes the final byte stream.
6. **Optimize / target size** (`core/optimization/targetSizeSearch.ts`): a
   bounded (≤24 by default) search over {palette size, dithering, frame-rate
   reduction, resolution reduction}, *actually encoding and measuring
   `Uint8Array.length`* at each step — no estimate/formula. The candidate list
   is a **linear, one-dimension-at-a-time walk** (colors down → dither off →
   frame rate down → resolution down), not a cartesian product of every
   combination — an earlier cartesian version was found live to exhaust the
   attempt budget re-trying color/dither combinations before ever reaching
   frame-rate/resolution reduction, even when the user explicitly allowed
   them (see `docs/IMPLEMENTATION_STATUS.md`). Stops at the first config that
   meets the target; otherwise returns the smallest real result found with an
   honest message.

## Why one worker, not several

Decode, render, optimize, and encode all operate on the same large per-frame
RGBA buffers. Splitting them into separate workers would mean transferring
tens of megabytes of pixel data between workers for every operation. A single
worker (`pipeline.worker.ts`) keeps the canonical decoded frames in one place
and does all buffer-heavy work in-process; only small results (thumbnails,
preview `ImageBitmap`s, the final encoded `Uint8Array`) cross back to the main
thread, using `Comlink.transfer` for zero-copy handoff.

**OffscreenCanvas feature detection.** The worker's pixel-level rendering
(final-quality frame composition, thumbnail/preview downscaling, static-frame
export) is built on `OffscreenCanvas`. Not every engine implements it — this
was found directly this session, not assumed: the WebKit build used for this
project's Playwright tests has no `OffscreenCanvas` at all, on the main
thread or in a worker. `assertOffscreenCanvasSupport()` in `pipeline.worker.ts`
checks this once (`typeof OffscreenCanvas !== 'undefined'`) and is called at
the entry point of every OffscreenCanvas-dependent method, so a browser
lacking it gets one clear, actionable error ("Your browser does not support
OffscreenCanvas...") instead of a native `ReferenceError` mid-operation.
Two paths that don't strictly need full-resolution downscaling degrade
gracefully instead of failing outright: `getPreviewBitmaps` and
`getThumbnail` fall back to full-resolution `createImageBitmap` (more
per-frame memory, but the app stays usable) when OffscreenCanvas is
unavailable. Export, optimize, and static-frame export have no such
fallback — they hard-fail with the clear message, since silently degrading
export correctness/quality would be worse than an honest error.

## Job lifecycle: cooperative cancellation and heavy-job exclusivity

**Why a worker can't just "receive" a cancel message mid-operation.** A Web
Worker is single-threaded: it can only process an incoming `postMessage` —
including the Comlink RPC call that `cancel()` sends to trigger
`AbortController.abort()` — in between synchronous stretches of its own JS.
A render/encode loop that runs start-to-finish with no `await` inside it
therefore can't be interrupted by anything, including its own cancellation;
the abort message just sits queued until the loop finishes on its own. This
was a real, previously-shipped bug (Cancel visibly changed the UI but the
operation kept running to completion regardless) before being fixed.

**The fix: bounded cooperative yielding.** `encodeGif` (`core/gif/
encoder.ts`), `runTargetSizeSearch` (`core/optimization/targetSizeSearch.ts`),
and `renderAllFrames` (`pipeline.worker.ts`) are `async` and `await
yieldToEventLoop()` (`core/util/yieldToEventLoop.ts` — a `setTimeout(resolve,
0)` wrapper) every few frames/attempts, immediately followed by an abort
check. This gives a queued cancel message a real chance to be delivered and
observed mid-operation, at the cost of a small, bounded latency (a handful
of frames' worth of work) before cancellation actually takes effect — this
tradeoff is intentional and should stay bounded, not removed: yielding on
every single frame would add needless overhead on large GIFs, and yielding
too rarely would make Cancel feel unresponsive again for the same reason it
was broken before.

**Heavy-job exclusivity.** `exportGif` and `optimize` are the only two
operations that hold large frame buffers for the worker's single shared
`AbortController`. Nothing in the UI stops a user from switching tools
mid-job and starting a *second* heavy operation — so both methods check
`this.abortController` at entry and throw a clear "Another export or
optimization is already running. Cancel it or wait for it to finish first."
error if one is already set, rather than silently letting the second call's
`new AbortController()` overwrite the first job's controller (which
previously meant Cancel could abort whichever job started most recently,
not the one the user meant). Both methods run their body in a `try`/`finally`
that always resets `this.abortController = null`, so the guard reliably
releases once an operation ends — successfully, by cancellation, or by a
real error — rather than getting permanently stuck rejecting every
subsequent attempt.

**New Project + an active job.** Starting a New Project needs to reconcile
two independent things that both change on it: any job still `'running'`
in the global `jobStore`, and the worker itself. The actual order in
`startNewProject()` (`useLoadGif.ts`), verified against the code, not
assumed:

1. Pause playback.
2. Cancel every currently-`'running'` job in `jobStore` — necessary because
   terminating the worker (next step) kills any in-flight Comlink call
   without ever resolving or rejecting it, so nothing would otherwise mark
   that job done; its toast would stay on screen forever, frozen at its
   last progress, with no way to dismiss it (`JobStatusBar` only offers a
   dismiss button for `'failed'` jobs, not `'running'` ones).
3. Terminate the worker outright (`terminatePipeline()`) — the simplest way
   to guarantee its decoded frames and every registered overlay asset are
   actually freed, rather than trying to incrementally undo its state.
4. Clear `frameCacheStore` (closes every cached preview/thumbnail/asset
   `ImageBitmap`).
5. Close the project in `projectStore` (clears `project`/`sourceBlob`/
   undo history).
6. Reset `editorStore` (active tool, zoom/pan, selection, Performance Mode).
7. Reset the playback frame index.
8. Clear the autosave record (best-effort — a storage failure here doesn't
   block the reset).

The next upload lazily spins up a fresh worker via `getPipeline()`.

## Coordinate system

All layer/crop coordinates in `Project` are in **image space**: pixels of the
current *output* canvas (source size, or post-crop/resize/rotate size — see
`computeOutputDimensions`), never CSS/viewport pixels. `src/core/coordinates/
coordinates.ts` is the single place that converts between image space and the
on-screen `<Stage>` viewport (accounting for fit-to-screen scale, zoom, and
pan). The editor canvas (`EditorCanvas.tsx`) and every tool panel's numeric
fields both read/write the same image-space values, so dragging a crop handle
and typing an X value in the inspector stay in sync automatically.

## Preview vs. final-quality rendering

Two different rendering paths exist on purpose:

- **Interactive preview** (main thread): `EditorCanvas.tsx` draws a cached,
  possibly-downscaled `ImageBitmap` (fetched once from the worker after
  decode) through Konva, applying crop/resize/rotate as cheap Konva node
  props (`crop`, `width/height`, `rotation`) — no worker round-trip, no
  quantization. Text/overlay layers are separate interactive Konva nodes on
  top. This is what makes dragging/typing feel immediate.
- **Final-quality render** (worker): `renderFrame` in `core/render/
  compositeFrame.ts`, invoked only for export, optimize, and static-frame
  export. Runs the full pixel pipeline against the original full-resolution
  decoded frames, then quantizes/encodes. This is the only path that produces
  the bytes a user actually downloads — the preview is never used as the
  export source, so "looks right in the editor" and "is right in the export"
  can't silently diverge from mismatched code paths (though of course a
  genuine bug in the shared render logic would still show up in both).

## Visual Before/After comparison (Optimize)

A third rendering path, added alongside the two above: `decodeForCompare`
(`pipeline.worker.ts`) decodes a standalone GIF byte buffer — independent of
`this.sourceFrames`/`this.metadata`, so it never disturbs the currently-open
project — into full-resolution `ImageBitmap`s via `createImageBitmap` (no
`OffscreenCanvas` dependency, unlike the render path above). It's called
twice per optimization result: once on the real uploaded source bytes
(`Blob.arrayBuffer()`), once on the real optimized output bytes (a sliced
*copy* of `result.bytes` — Comlink would otherwise transfer/detach the same
buffer the "Download optimized GIF" button needs). Both sides are therefore
genuinely decoded pixels from real GIF data, not a CSS filter or estimate,
so quantization/dithering/palette/resolution/frame-reduction artifacts
actually show up.

`useOptimizeComparison` (`src/tools/`) owns the decode-and-cleanup lifecycle,
keyed on the `optimize()` result and `sourceBlob` object identity — both are
stable React state that only change when something real happens, so
re-renders that don't (dragging the comparison split, switching Animated/
Frame mode) never re-decode. Every `ImageBitmap` is `.close()`d — mirroring
`frameCacheStore`'s existing pattern — when superseded by a new result, when
the owning `OptimizePanel` unmounts, or when the result is invalidated (see
below); an in-flight decode superseded by a newer one before it resolves
closes what it just decoded instead of adopting it.

`BeforeAfterCompare.tsx` is purely presentational: a draggable/keyboard-
accessible split view, driven by two independent per-side playback clocks
(sharing one `requestAnimationFrame` loop, each wrapping at its own frame
count) so a result with a different original/optimized frame count — e.g.
from target-size search's frame-rate reduction — stays honestly
synchronized instead of faking a 1:1 frame correspondence that doesn't
exist. A Frame mode reuses the editor's current timeline frame (proportionally
mapped if frame counts differ) rather than inventing a separate frame
picker.

**Stale-result invalidation**: `OptimizePanel` keeps a ref to the `Project`
a result was produced from; if the live `project` reference changes
afterward (further edits, different optimize settings, Reset to original, a
New Project — anything that produces a new `Project` object) the result is
cleared, hiding the comparison rather than letting it keep looking current
against a project it no longer describes.

## State stores (`src/state`)

Split by concern, not one global store, so unrelated UI doesn't re-render:

- `projectStore` — the `Project` model + undo/redo history. History entries
  are full `Project` snapshots (cheap: no pixel data lives in `Project`), with
  a `beginInteraction`/`updateDuringInteraction`/`endInteraction` pattern so a
  multi-second drag or a multi-keystroke text edit produces exactly one
  history entry, not one per pointermove/keystroke.
- `editorStore` — UI-only: active tool, zoom/pan, selection, Performance Mode.
- `playbackStore` — `isPlaying` + `currentFrameIndex`. The actual per-frame
  image swap during playback is imperative (`usePlaybackController.ts`, a
  `requestAnimationFrame` loop that calls `konvaNode.image(bitmap)` directly);
  the store's `currentFrameIndex` is only updated once per logical GIF frame
  (bounded by the GIF's own frame rate, not the display refresh rate), so the
  timeline/frame-counter re-render is cheap and infrequent, not React-driven
  animation.
- `jobStore` — the unified background-task list (progress/status/cancel) that
  `JobStatusBar.tsx` renders as toasts.
- `frameCacheStore` — decoded-frame `ImageBitmap`s, thumbnails, and overlay
  asset bitmaps. Deliberately kept *out* of `projectStore` (and out of history
  snapshots) since these are large, re-derivable from the worker, and change
  on a different cadence (once per load / once per scroll) than project edits.

## Storage (autosave)

`src/storage/db.ts` (Dexie): one row for the current project (`Project` JSON +
the original source `Blob`) and one table for overlay-image asset blobs.
Autosave is debounced 1.5s after the last edit (`useAutosave.ts`) — not on
every keystroke/drag tick. On startup, `useAutosaveRestore.ts` offers to
restore: it re-runs `loadGif` against the saved source blob (the worker's
decoded state doesn't survive a reload) and re-registers saved overlay assets.

**Binary data is stored as `ArrayBuffer`, not `Blob`.** The public API
(`saveAsset`/`loadAssets`/`saveProjectAutosave`/`loadProjectAutosave`) still
deals entirely in `Blob` — callers never see this — but `db.ts` converts to
`ArrayBuffer` (plus a stored MIME type) immediately before every `put()` and
reconstructs a `Blob` immediately after every read. This exists because a
real WebKit IndexedDB limitation was found this session: some WebKit builds
throw `UnknownError: Error preparing Blob/File data to be stored in object
store` when a raw `Blob`/`File` is put directly into an object store, while
an `ArrayBuffer` has no such problem in any tested browser. Overlay-asset
persistence is additionally best-effort — a `saveAsset` failure is caught
and logged rather than blocking the layer from being usable for the rest of
the current session (only autosave-restore-after-reload is affected).

## Lifecycle sync and cleanup (`src/app/use*.ts`)

Two things need to stay correct across *every* action that can change a
project — not just the ones that existed when that code was first written.
Both are implemented as a `useProjectStore.subscribe(...)` in an app-level
hook rather than a call inline in each action, specifically because the
first attempt at each (patching individual call sites) missed cases and
shipped a real bug — see `docs/IMPLEMENTATION_STATUS.md`'s "Bugs found and
fixed" #6 and #7:

- **`useSyncPlaybackFrameCount`**: keeps `playbackStore.frameCount` (and, via
  its existing clamp, `currentFrameIndex`) equal to the current
  `project.edits.frameOrder.length`, so the playback loop's wraparound
  modulus and the current scrub position never point past a frame list that
  just got shorter (delete, keep, reverse, reset-to-original, undo/redo, ...).
- **`useGarbageCollectAssets`**: diffs the set of overlay `assetId`s actually
  referenced by `project.layers` on every project change, and frees any
  bitmap (both `frameCacheStore` and the worker's registry) that drops out —
  covering explicit delete, undo/redo, reset-to-original, and restore with
  one mechanism.

Closing a project entirely (`startNewProject` in `useLoadGif.ts`, wired to
the top bar's "New" button) is handled separately and more bluntly:
terminate the worker outright (simplest way to guarantee its decoded frames
and every registered asset are actually freed) rather than trying to
incrementally undo its state, then clear every main-thread cache and reset
UI/playback state — see "Job lifecycle" above for the exact ordering,
including why any still-running job needs to be cancelled *before* the
worker is terminated.

A top-level `ErrorBoundary` (wrapping `<App />` in `main.tsx`) is the last
line of defense: an uncaught render error shows a plain "GifForge needs to
restart" screen with a reload button instead of silently blanking the page.

## Testing architecture

Two layers, deliberately not overlapping in what they cover:

- **Unit tests** (`src/**/*.test.ts`, Vitest, `npm test`) — pure logic that
  doesn't need a browser: frame-range parsing, coordinate math,
  crop/resize/rotate math, frame-order edit operations, the GIF disposal
  compositor, target-size search config ordering, and full decode → encode
  → re-decode round-trips against real downloaded GIF fixtures
  (`fixtures/*.gif`). Runs in Node via `jsdom`.
- **Browser regression tests** (`e2e/*.spec.ts`, Playwright, `npm run
  test:e2e`) — everything that needs a real rendering engine: canvas pixel
  content, file upload/download, IndexedDB, Worker/OffscreenCanvas behavior.
  `playwright.config.ts` defines all three engines (chromium/firefox/webkit)
  as projects; CI (`.github/workflows/ci.yml`) runs chromium only for fast
  PR feedback, the full three-engine run is manual/periodic
  (`npm run test:e2e` with no `--project` filter runs all three locally).
  `e2e/helpers.ts` centralizes fixture paths and shared assertions
  (decoding an exported file, reading a specific canvas's pixel data) so
  each spec file stays focused on one flow.

Each `e2e/` test exists because a real regression was found manually in an
earlier session and is now guarded permanently — see
`docs/IMPLEMENTATION_STATUS.md`'s "Bugs found and fixed" for the specific
incident each one traces back to. A small number of tests
(`test.skip(browserName === 'webkit', ...)`) are skipped, not failed, in
WebKit for the documented `OffscreenCanvas` gap above — skip with a reason
is the correct outcome for a known, external, per-engine limitation, not a
red failure that would need re-investigating every run.

## Dependency policy

`gifuct-js` (decode) and `gifenc` (quantize/encode) are wrapped by
`core/gif/decoder.ts` and `core/gif/encoder.ts` respectively — nothing else in
the app imports them directly. `gifenc` ships no TypeScript types; see
`src/types/gifenc.d.ts` for the (intentionally minimal — only what GifForge
actually calls) hand-written declarations. Both are MIT-licensed.
`react-konva`/`konva` are used only in the interactive editor canvas, never in
the render/export path (`compositeFrame.ts` uses raw `OffscreenCanvas` 2D
APIs), per the requirement that the export pipeline not depend on React DOM
rendering.
