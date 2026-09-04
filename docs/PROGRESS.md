# GifForge Development Progress

This file is the chronological development diary for GifForge: what changed,
and when. It is append-only — old entries are not rewritten or deleted when
they become outdated; a later entry records the correction instead. For "what
is the current state of the project," see `docs/IMPLEMENTATION_STATUS.md`.
For "how does it work," see `docs/ARCHITECTURE.md`.

Entry format: only the sections that apply to that unit of work are included.

---

## 2026-09-04 18:55 — Project history baseline established

This is the first entry in this file. It was introduced after substantial
development had already happened in prior sessions (no `docs/PROGRESS.md`
existed before now), so it does not — and cannot — reconstruct a detailed
timeline of every change made before this point. What follows is a factual
summary of the verified state at the moment this file was created, confirmed
by actually running the project's checks today rather than trusting earlier
session reports.

### Added

* Initialized this repository as a Git repository (`git init`, default
  branch `main`). No version control existed before this entry — the
  project had been developed entirely as an uncommitted working directory.
* Added `docs/PROGRESS.md` (this file).

### Verified (re-run today, not assumed from prior reports)

* `npx tsc -b` — clean, zero errors.
* `npx eslint . --ext ts,tsx` — clean, zero errors/warnings.
* `npx vitest run` — 64/64 tests passing across 7 files.
* `npm run build` — succeeds; production bundle emits
  `pipeline.worker` (33.5KB), a lazy-loaded `EditorCanvas` chunk (299KB,
  92KB gzip) split from the main chunk (305KB, 98KB gzip).
* Spot-checked several specific fixes described in prior session reports
  directly against source rather than trusting the reports: confirmed
  `ErrorBoundary` is imported and wraps `<App />` in `main.tsx`; confirmed
  `useSyncPlaybackFrameCount` and `useGarbageCollectAssets` are both called
  from `App.tsx`; confirmed `startNewProject` is wired to the top bar's
  "New" button; confirmed `compositor.ts`'s frame delay is used as-is
  (`frame.delay`) rather than re-multiplied by 10. All matched what prior
  reports claimed.

### Known state at baseline (see `docs/IMPLEMENTATION_STATUS.md` for detail)

* Core editing pipeline (decode, disposal-aware reconstruction, playback,
  timeline, crop, resize, speed, reverse, rotate, text layers, image
  overlays, layer ordering, optimization, target-size search, export,
  static frame export, undo/redo, autosave/restore) is implemented and was
  browser-verified in prior sessions via ad hoc Playwright scripts.
* Those Playwright scripts were **never part of this repository** — they
  lived in a session-local scratch directory outside the project and are
  gone. `docs/IMPLEMENTATION_STATUS.md`'s "Test Status" section describing
  prior browser verification rounds is accurate as a record of testing that
  happened, but none of it is currently reproducible from this repo. This
  is addressed later in this same working session — see the next entry.
* No CI configuration existed before this session.
* No `.gitignore` coverage for test/coverage output or env files existed
  before this session (added alongside git initialization).

### Documentation

* This file created to begin persistent, append-only development history
  going forward.

---

## 2026-09-04 19:04 — Persisted the browser regression suite; added CI

Addresses the gap flagged in the previous entry: prior sessions' browser
verification existed only as throwaway scripts outside the repository.

### Added

* Installed `@playwright/test` as a real project dev dependency (previously
  only present in an out-of-tree scratch directory) and its Chromium,
  Firefox, and WebKit browser binaries.
* Added `playwright.config.ts` and `e2e/` with 23 tests across 5 files
  (`core-editing`, `frame-operations`, `layers`, `optimize`, `resilience`),
  each written to guard a specific regression an earlier session found
  manually: GIF timing round-trip, disposal reconstruction (via the
  existing unit tests), layer z-order, layer reorder direction, target-size
  search actually using frame-rate/resolution reduction when allowed,
  frame-count sync after delete/undo/reset, overlay resource cleanup,
  error-boundary recovery, and autosave restore.
* Added `npm run test:e2e` / `test:e2e:ui` scripts.
* Added `tsconfig.e2e.json` (typechecks `e2e/` and `playwright.config.ts`)
  and wired it into the root `tsconfig.json` project references.
* Added `.github/workflows/ci.yml`: a `quality` job (typecheck, lint, unit
  tests, build) and an `e2e` job (Playwright/Chromium), both via `npm ci`
  against the committed lockfile, on push/PR to `main`. No secrets required.
* Extended `.gitignore` for test/coverage output, env files, and the
  Claude Code session-local `.claude/` directory.
* Rewrote `README.md` to the project's now-standard simple, user-facing
  format (features, Privacy, Development commands) and expanded
  `docs/ARCHITECTURE.md`'s optimization section with the color-cache and
  linear-search-walk design decisions from earlier sessions that hadn't
  been written down yet.

### Fixed

* `tsconfig.json` briefly referenced `tsconfig.e2e.json` in a commit before
  that file was actually committed (a staging-order mistake while building
  the first two commits), which would have broken `tsc -b` for anyone
  checking out that commit alone. Caught by checking each commit's content
  after creating it, not just the final working tree; corrected in the same
  commit that added the e2e config, since unpushed local history.

### Verified

* `npx playwright test` (Chromium): 23/23 passed.
* `npx vitest run`: 64/64 (unaffected).
* `npm run build`: succeeds.
* `npm ci` against the committed `package-lock.json`, run in an isolated
  temp directory (not the live project) to confirm the lockfile is
  genuinely reproducible without disturbing local `node_modules`: succeeded
  cleanly, 360 packages.
* CI workflow YAML validated for syntax (`python -c "import yaml; ..."`);
  not yet run on GitHub Actions itself — no remote is configured this
  session (see Git section below).

### Git

* Two commits so far this session, both authored as the repository's
  configured identity (`git config user.name`/`user.email`), no AI
  attribution: `chore: establish version control for existing GifForge
  application`, `test: add persisted Playwright e2e regression suite`
  (which also carries the `tsconfig.json` fix above).
* No remote configured, no GitHub CLI (`gh`) installed, no SSH keys found,
  no global git credential helper configured. Commits are local-only; there
  is currently no way for this session to push. This is reported here
  rather than assumed away — see the end-of-session report for the full
  authentication-state account.

---

## 2026-09-04 19:57 — Cross-browser + stress-test audit: two real bugs found and fixed

A fresh audit per this session's brief, explicitly not trusting the
previous session's "only Chromium was tested" / "large-file stress testing
was not performed" caveats — both were actually tested this time, for real.

### Fixed

* **WebKit could not persist overlay assets or autosave at all**: running
  the newly-persisted e2e suite against a real WebKit build surfaced
  `UnknownError: Error preparing Blob/File data to be stored in object
  store` — WebKit's IndexedDB, in this build, rejects storing a raw
  `Blob`/`File` directly in an object store, though an `ArrayBuffer` works
  fine. Fixed in `src/storage/db.ts` by converting `Blob` → `ArrayBuffer`
  (+ stored MIME type) at the storage boundary and reconstructing a `Blob`
  on read; the public API is unchanged, so no callers needed updating.
  Also made overlay-asset persistence best-effort (a storage failure no
  longer blocks the layer from being usable in the current session).
* **WebKit has no OffscreenCanvas support at all** (verified directly, not
  assumed: `typeof OffscreenCanvas` is `undefined` on both the main thread
  and inside a Worker in this build), which broke export, optimize, and
  static-frame export with a native `ReferenceError` and, for optimize
  specifically, a 30-60s hang before the error surfaced. Added
  `assertOffscreenCanvasSupport()` in `pipeline.worker.ts`, called at the
  entry point of every OffscreenCanvas-dependent method, so unsupported
  browsers fail in ~2s with a clear, actionable message instead. Preview
  bitmaps and thumbnails additionally fall back to full-resolution
  `createImageBitmap` (more memory, but keeps upload/decode/playback/
  timeline working) rather than failing at all.

### Added

* `scripts/generate-stress-fixture.cjs`: generates a synthetic
  high-frame-count GIF for stress testing on demand (not committed —
  output is several MB and its exact pixel content doesn't matter).
* 2 more e2e tests (25 total, up from 23): `layers.spec.ts`'s combined
  z-order/reorder tests were split into a "live preview" test (works
  everywhere) and an "export" test (`test.skip` on WebKit with a documented
  reason), preserving real coverage on WebKit instead of losing it to a
  blanket skip.
* Promoted `firefox` and `webkit` to permanent projects in
  `playwright.config.ts` (previously only `chromium`) — `npm run test:e2e`
  now covers all three engines locally by default; CI stays
  chromium-only for fast PR feedback (`--project=chromium`).

### Changed

* 8 of the 25 e2e tests now skip (not fail) on WebKit via
  `test.skip(browserName === 'webkit', reason)`, with the reason naming the
  OffscreenCanvas gap above — correct test hygiene for a known, external,
  per-engine limitation.

### Tests

* **Stress test** (synthetic 600-frame, 480×360 GIF, ~415MB estimated
  decoded memory, generated via the new script, kept outside the
  Vite-watched project root — see Known Issues below): load completed in
  ~5.2s; Performance Mode's badge correctly activated; the timeline stayed
  windowed (19–23 DOM thumbnail nodes rendered at any time, not 600) and
  scroll stayed responsive (~300ms to settle); playback and tool-panel
  switching stayed responsive; export completed in ~10.4s, producing a
  real, valid, 27.6MB, correctly-dimensioned, correctly-framed,
  re-decodable GIF; zero console/page errors throughout.
* **Cross-browser** (this repo's actual 25-test `e2e/` suite, not a
  one-off manual pass): Chromium 25/25, Firefox 25/25, WebKit 17/25 passed
  + 8 skipped (documented reason) + 0 failed. Full lifecycle chain (upload
  A → edit → export → New Project → upload B → edit → undo → reset →
  reload → restore) re-verified end-to-end in Chromium with zero errors.
* `npx vitest run`: 64/64 (unaffected by the storage/OffscreenCanvas
  changes — confirmed, not assumed).
* `npx tsc -b`, `npx eslint . --ext ts,tsx`, `npm run build`: all clean
  after every change in this entry.

### Known Issues

* Diagnosing the stress-test load time cost real time this session:
  leaving the generated stress-test `.gif` files sitting in the
  Vite-watched project root (rather than an out-of-tree scratch directory)
  measurably destabilized the Vite dev server itself — intermittent
  request hangs and slow cold starts unrelated to any GifForge application
  code — and produced misleading "the app hangs on large files" symptoms
  until traced to the actual cause. Not an app bug; recorded here (and in
  the stress-fixture generator script's own header) so it isn't
  rediscovered the hard way in a future session.
* One earlier diagnostic misstep in this same session, self-corrected:
  while investigating the (at-the-time-unexplained) stress-test hang, a
  temporary `await import('gifuct-js')` dynamic-import probe was added to
  `pipeline.worker.ts` for diagnosis and briefly broke GIF loading
  entirely, including for the small, previously-reliable test fixture.
  Caught immediately by re-running the existing sanity checks, reverted
  before proceeding, confirmed back to the exact committed baseline via
  `git diff` before continuing.
* Real Safari was not available to test against — "WebKit lacks
  OffscreenCanvas" is verified true for the Playwright-bundled WebKit build
  used here, not confirmed (or ruled out) for current shipping Safari.
  See `docs/IMPLEMENTATION_STATUS.md`'s Next Priorities.

### Documentation

* `docs/IMPLEMENTATION_STATUS.md`: added bug #8 (WebKit Blob storage);
  rewrote the "Browser compatibility" and "Large-file stress testing"
  Known Limitations entries with the real measured results above; added
  a "Browser test results" table under Test Status; added the previously
  missing `TECHNICAL DEBT` and `NEXT PRIORITIES` sections.
* `docs/ARCHITECTURE.md`: documented the `Blob`→`ArrayBuffer` storage
  conversion, the `OffscreenCanvas` feature-detection/fallback design, and
  added a "Testing architecture" section describing the unit/e2e split and
  why CI only runs Chromium.
