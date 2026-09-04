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

---

## 2026-09-04 20:33 — Resolved the npm audit debt: Vite 5 -> 7, Vitest 2 -> 3

Continued auditing per this session's brief rather than treating the
previous entry's report as final. The `TECHNICAL DEBT` section written in
the last entry claimed the `esbuild` advisory could only be fixed by
force-installing the experimental rolldown-based Vite 8. That claim was
never actually tested against the real Vite 6/7 release history — it was
investigated properly this time.

### Fixed

* **`npm audit`'s 5 vulnerabilities** (one advisory chain,
  [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99),
  a dev-server-only esbuild issue) — confirmed via direct research that
  Vite 7.x is still the stable, Rollup-based lineage (rolldown is Vite
  8/9, a separate opt-in rewrite) and pulls a patched `esbuild`. Upgraded
  `vite` `^5.4.11` -> `^7.3.6`, `vitest` `^2.1.8` -> `^3.2.4` (resolved to
  `3.2.7`), `@vitejs/plugin-react` `^4.3.4` -> `^4.7.0` (the versions that
  support Vite 7 without forcing plugin-react 5/6 or Vitest 5, which
  require Vite 8). Also removed `vite-plugin-static-copy`, confirmed
  unused via `grep -rn "vite-plugin-static-copy" src/ vite.config.ts`
  (no matches) — a leftover from the original project scaffold.

### Verified

* `npx tsc -b`, `npx eslint . --ext ts,tsx`: both clean after the upgrade.
* `npx vitest run`: 64/64 passed (now under vitest 3.2.7).
* `npm run build`: succeeds, bundle sizes near-identical to pre-upgrade.
* `npx playwright test` across all three configured projects, matching
  pre-upgrade results exactly: chromium 25/25, firefox 25/25, webkit
  17/25 passed + 8 skipped + 0 failed. (First chromium run showed 1
  transient failure from Vite's one-time "re-optimizing dependencies"
  cold start after the lockfile changed; an immediate re-run with a warm
  cache passed 25/25, ruling out a real regression.)
* `npm ci` against the new `package-lock.json`, run in an isolated scratch
  directory separate from the live project: succeeded cleanly, 361
  packages, 0 vulnerabilities.
* `npm audit`: **0 vulnerabilities** (down from 5).

### Documentation

* `docs/IMPLEMENTATION_STATUS.md`: struck through and corrected the
  `TECHNICAL DEBT` entry that had claimed this required Vite 8.

### Git

* One commit this session (`build: upgrade Vite 5 -> 7 and Vitest 2 -> 3
  to resolve npm audit findings`), authored as the repository's configured
  identity, no AI attribution — verified via
  `git show -s --format="%an <%ae>" HEAD` after committing, same as every
  prior commit this session.

---

## 2026-09-04 20:36 — Removed two unused dependencies

Continued auditing rather than stopping after the previous entry.
Checked every entry in `package.json` `dependencies` against actual usage
with a repo-wide grep (not just `src/`) instead of assuming the dependency
list was accurate.

### Fixed

* **`clsx` and `dexie-react-hooks`** were listed as direct dependencies
  but never imported anywhere in the repository (`src/`, `e2e/`,
  `scripts/`, or config files) — confirmed via
  `grep -rln "clsx\|dexie-react-hooks" --include="*.ts" --include="*.tsx" .`
  returning no matches outside `node_modules`. Removed both from
  `package.json`; `npm install` dropped 2 packages, `npm audit` still
  reports 0 vulnerabilities.

### Verified

* `npx tsc -b`, `npx eslint . --ext ts,tsx`: clean.
* `npx vitest run`: 64/64 passed.
* `npm run build`: succeeds; output bundle byte sizes identical to the
  pre-removal build (`index-Ddw6CwFn.js` 306.38 kB,
  `EditorCanvas-_d1AelZr.js` 301.85 kB) — confirms neither package was
  contributing to the shipped bundle even indirectly.

### Git

* One commit (`chore: remove unused clsx and dexie-react-hooks
  dependencies`), authored as the repository's configured identity, no
  AI attribution — verified via `git show -s --format="%an <%ae>" HEAD`.

---

## 2026-09-04 20:42 — Closed an untested error-handling path: corrupt GIF upload

Checked `e2e/resilience.spec.ts` against `src/app/useLoadGif.ts` and
`src/core/gif/decoder.ts`'s `GifDecodeError` cases. The decoder's signature/
structure/dimension/frame-decode error paths were already unit-tested
directly (`decoder.test.ts`), but nothing exercised the path a real user
hits: dropping a bad file onto the actual running app and seeing what
happens in a browser.

### Added

* `e2e/resilience.spec.ts`: new test uploads a file named and MIME-typed as
  a `.gif` but containing garbage bytes (passes `useLoadGif`'s
  extension/MIME/size validation, fails the decoder's own signature check).
  Asserts: the exact "not a valid GIF" error renders, the app stays on the
  upload screen (not stuck spinning), a real GIF can still be loaded
  immediately afterward (app isn't left in a broken state), and zero
  `pageerror` events fired (no unhandled exception reached the page).

### Fixed

* First run hit a `strict mode violation` — `text=/not a valid GIF/i`
  matched both the persistent inline error `<p>` and a transient job-toast
  with the same message. Same class of ambiguity as earlier selectors in
  this suite; fixed with `.first()`.

### Verified

* `npx playwright test --project=chromium`: 26/26 (up from 25).
* `npx playwright test --project=firefox`: 26/26.
* `npx playwright test --project=webkit`: 18 passed + 8 skipped (new test
  included in the pass count; skip count unchanged — this path doesn't
  touch OffscreenCanvas).
* `npx tsc -b`, `npx eslint . --ext ts,tsx`, `npx vitest run` (64/64): all
  clean afterward.

---

## 2026-09-04 20:52 — Real bug: Cancel didn't actually cancel

Writing the e2e test above led directly into a second, more significant
finding: nothing had ever tested the Cancel button on export/optimize
jobs, and it turned out not to work.

### Fixed

* **Cancel was a no-op for any operation slower than instant** (bug #9 in
  `docs/IMPLEMENTATION_STATUS.md`). `renderAllFrames`, `encodeGif`, and
  `runTargetSizeSearch` ran as one fully synchronous block in the worker.
  A Worker can only process an incoming `postMessage` — including the
  Comlink call that triggers `AbortController.abort()` — between
  synchronous stretches of JS, so the cancel request itself was never
  delivered until the operation had already finished on its own. Fixed by
  making all three functions `async` and yielding to the event loop every
  4 frames/attempts via a new `yieldToEventLoop` helper
  (`src/core/util/yieldToEventLoop.ts`), so a pending cancel actually gets
  observed mid-operation.
* **A cancelled job displayed as a red "failed" error toast.** Once the
  above made cancellation real, the aborted operation's rejected
  `EncodeCancelledError` promise still reached each panel's `catch` block
  and called `failJob()`, overwriting the `'cancelled'` status the cancel
  button had just set back to `'failed'`. `ExportPanel` additionally never
  called `cancelJob()` at all (unlike `OptimizePanel`), so its cancel
  button didn't mark the job cancelled client-side either. Fixed in both
  panels: check the job's current status before calling `failJob`, and
  `ExportPanel` now tracks its job id the same way `OptimizePanel` already
  did.

### Changed

* `encodeGif` (`src/core/gif/encoder.ts`) and `runTargetSizeSearch`
  (`src/core/optimization/targetSizeSearch.ts`) are now `async`
  (`Promise`-returning) instead of synchronous. Their only unit-test
  caller, `encoder.test.ts`, updated to `await` each call (and the
  zero-frames rejection test changed from `expect(() => ...).toThrow()` to
  `await expect(...).rejects.toThrow()`, since the function no longer
  throws synchronously). `targetSizeSearch.test.ts` needed no changes — it
  only exercises the pure `buildCandidateConfigs`/`applyFrameStep` helpers.

### Added

* `e2e/optimize.spec.ts`: a new test clicks Cancel ~300ms into a real
  ~8-second target-size search and asserts no red failed-job toast, no
  leftover "Encoding was cancelled." error text, the Run button reappears
  promptly (not stuck showing "Cancel"), the worker is still usable for a
  follow-up run afterward, and zero unhandled `pageerror` events fired.

### Verified

* `npx tsc -b`, `npx eslint . --ext ts,tsx`: clean.
* `npx vitest run`: 64/64 passed.
* `npm run build`: succeeds, bundle sizes effectively unchanged.
* `npx playwright test --project=chromium`: 27/27 (up from 26). The new
  cancel test itself dropped from timing out (previously waited the full
  operation to completion) to 3.0s once the fix landed — direct evidence
  cancellation is now actually responsive, not just passing coincidentally.
* `npx playwright test --project=firefox`: 27/27.
* `npx playwright test --project=webkit`: 18 passed + 9 skipped (the new
  cancel test skips there too, same OffscreenCanvas reason as the rest of
  this suite).

### Known Issues

* `ExportPanel`'s identical cancel-state fix was not separately
  e2e-tested: a plain export of this repo's committed fixtures completes
  in well under a second, too fast to reliably intercept mid-flight
  without introducing e2e flakiness. It shares the exact same
  `renderAllFrames`/`encodeGif` code path already proven end-to-end by the
  optimize cancel test above, and is typecheck/lint/unit-test clean, but a
  dedicated live reproduction of *this specific panel's* cancel button was
  not constructed. Worth revisiting if a large committed fixture ever
  becomes available for e2e use.

### Documentation

* `docs/IMPLEMENTATION_STATUS.md`: added bug #9 with the full root-cause
  and fix account above.

### Git

* One commit (`fix(worker): cancel actually stops in-progress
  export/optimize instead of running to completion`), authored as the
  repository's configured identity, no AI attribution — verified via
  `git show -s --format="%an <%ae>" HEAD`.
