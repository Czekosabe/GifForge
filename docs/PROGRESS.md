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

---

## 2026-09-04 21:06 — Real bug: overlapping export/optimize jobs could race

While double-checking the previous entry's fix for other reachable edge
cases (not by accident): once export and optimize genuinely interleave in
the worker (a direct consequence of bug #9's yielding fix), nothing stops
a user from switching tools mid-job and starting a *second* heavy
operation — `LeftToolbar.tsx` only disables tool buttons when no project
is loaded, never based on job state.

### Fixed

* **Bug #10** (`docs/IMPLEMENTATION_STATUS.md`): export and optimize share
  one worker instance and one `abortController` field. Starting a second
  job while the first is still running silently overwrote that field, so
  Cancel would abort whichever job started most recently rather than the
  one the user meant, and `renderAllFrames`'s abort check (reading the
  live field, not a signal captured at that operation's own start) could
  observe the *other* job's cancellation. `abortController` was also only
  ever reset on the success path, never in a `finally`, leaving it stale
  after any cancellation or error. Fixed with a proper in-flight guard in
  both `exportGif` and `optimize`: throw a clear "Another export or
  optimization is already running." error if one is already in flight,
  and reset the controller in a `finally` so the guard always releases.

### Added

* `e2e/resilience.spec.ts`: starts a real ~8s target-size search, switches
  to the Export tool mid-search, clicks Export GIF, and asserts the clear
  rejection message appears (not a silent race or stuck UI). Then waits
  for the background search to finish and runs a *fresh* optimization to
  confirm the guard actually released afterward, not just that it blocked
  the second call.

### Verified

* `npx tsc -b`, `npx eslint . --ext ts,tsx`, `npx vitest run` (64/64),
  `npm run build`: all clean.
* `npx playwright test --project=chromium`: 28/28 (up from 27).
* `npx playwright test --project=firefox`: 28/28.
* `npx playwright test --project=webkit`: 18 passed + 10 skipped (new test
  skips there too, same OffscreenCanvas reason as the rest of this suite).

### Documentation

* `docs/IMPLEMENTATION_STATUS.md`: added bug #10 with the full root-cause
  and fix account.

### Git

* One commit (`fix(worker): guard against overlapping export/optimize
  jobs on the shared worker`), authored as the repository's configured
  identity, no AI attribution — verified via
  `git show -s --format="%an <%ae>" HEAD`.

---

## 2026-09-04 21:15 — Real bug: New Project mid-job left a frozen, undismissable toast

Kept auditing state-consistency-after-various-actions per this session's
brief rather than stopping after bug #10. Asked: what happens to a running
job if the project it belongs to gets discarded mid-flight? Verified with
a throwaway probe script before touching any source, to make sure this was
a real bug and not a false alarm.

### Fixed

* **Bug #11** (`docs/IMPLEMENTATION_STATUS.md`): `startNewProject()`
  terminates the worker but never touched the global job store. A job
  still `'running'` at that moment never resolves or rejects once its
  worker call is killed, so nothing ever marks it done — its toast stayed
  on screen forever, frozen at its last message/progress, and
  `JobStatusBar` only offers a dismiss button for `'failed'` jobs, so it
  could never be cleared by the user short of a full reload. Reproduced
  directly: started a target-size search, immediately started a New
  Project, watched the toast sit frozen 12+ seconds past when the search
  would have finished naturally. Fixed by cancelling every `'running'` job
  in the store before terminating the pipeline in `startNewProject()`.

### Added

* `e2e/resilience.spec.ts`: starts a real optimize job, triggers New
  Project mid-run, and asserts the toast disappears immediately and stays
  gone 9+ seconds later.

### Verified

* `npx tsc -b`, `npx eslint . --ext ts,tsx`, `npx vitest run` (64/64),
  `npm run build`: all clean.
* `npx playwright test --project=chromium`: 29/29 (up from 28).
* `npx playwright test --project=firefox`: 29/29.
* `npx playwright test --project=webkit`: 18 passed + 11 skipped (new test
  skips there too, same OffscreenCanvas reason as the rest of this suite).

### Documentation

* `docs/IMPLEMENTATION_STATUS.md`: added bug #11 with the full root-cause
  and fix account.

### Git

* One commit (`fix(app): starting New Project mid-job no longer leaves a
  stuck job toast`), authored as the repository's configured identity, no
  AI attribution — verified via `git show -s --format="%an <%ae>" HEAD`.

---

## 2026-09-04 21:52 — Documentation reconciliation + visual Before/After comparison

Two-part session: (1) audit every doc against the actual repository state
rather than trusting prior sessions' reports, fixing what had drifted; (2)
implement the top item from NEXT PRIORITIES — a real visual comparison for
Optimize, not just numbers.

### Fixed (documentation drift)

* `README.md` claimed `npm run test:e2e` was "if installed" — Playwright
  has been a real `devDependencies` entry and a persisted `e2e/` suite
  since 2026-09-04 19:04; corrected.
* `docs/IMPLEMENTATION_STATUS.md`'s "TEST STATUS" section (unit test count,
  e2e file/test count, the Browser test results table) still showed the
  25-test count from before the cancellation/concurrency/orphaned-toast
  bug-fix session added 5 more tests (25→29) — corrected to the actual,
  freshly re-run counts (see Tests below), including a second stale
  reference to "8 skipped" in NEXT PRIORITIES.
* The "Job system"/"Cancellation" DONE bullets and `docs/ARCHITECTURE.md`'s
  "Lifecycle sync and cleanup" section predated the cooperative-yielding,
  heavy-job-exclusivity, and orphaned-job-toast fixes from the prior
  session and didn't mention any of them — added a new "Job lifecycle"
  section to ARCHITECTURE.md documenting why a worker can't receive a
  cancel message during an uninterrupted synchronous block, the bounded
  cooperative-yield mechanism that fixes it, the heavy-job-exclusivity
  guard and why the `AbortController` belongs to one operation at a time,
  and the verified actual ordering `startNewProject()` uses (cancel running
  jobs → terminate worker → clear caches → reset state → clear autosave).
* Removed the completed TODO item ("a dedicated compare original vs.
  edited split-view") and moved it to DONE now that it's real; re-ranked
  NEXT PRIORITIES against the actual current state instead of carrying the
  old list forward unchanged.

### Added (visual Before/After comparison)

* `pipeline.worker.ts`: `decodeForCompare(buffer)` — decodes a standalone
  GIF byte buffer into `ImageBitmap`s, deliberately independent of the
  currently-loaded project's state, so viewing a comparison never disturbs
  the live editing session. No `OffscreenCanvas` dependency (uses
  `createImageBitmap` directly).
* `src/tools/useOptimizeComparison.ts`: decodes both the real original
  upload and the real optimized output whenever a new result appears,
  keyed on stable object identity so UI-only interactions never re-decode;
  closes every `ImageBitmap` on replacement, unmount, or invalidation.
* `src/tools/BeforeAfterCompare.tsx`: draggable, keyboard-accessible
  (arrow keys/Home/End, `role="slider"`) split-view comparison. Animated
  mode drives both sides from one shared clock but each side independently
  wraps at its own frame count/rate — an honest sync, not a faked 1:1
  frame correspondence, correct even when target-size search used
  frame-rate reduction (different frame counts per side). Frame mode
  reuses the editor's current timeline frame (proportionally mapped if
  frame counts differ) instead of inventing a separate frame picker. Shows
  size/%-saved/dimensions/frame-count/duration for both sides.
* `OptimizePanel.tsx`: wired in; also added stale-result invalidation
  (tracks the `Project` a result was produced from via a ref, clears the
  result if the live project changes afterward) and replaced the old
  numeric-only "Before/After" block with the visual one.
* `e2e/before-after-compare.spec.ts`: one comprehensive test covering the
  full checklist — no comparison before a result exists; real optimization
  produces a real comparison; displayed sizes match the real downloaded
  file; **a pixel-exact check that the comparison canvas's decoded pixel
  data matches the real downloaded file's decoded pixel data**, proving
  the "after" view is the actual optimizer output; dragging the split /
  switching Frame↔Animated mode does not re-run optimization (sizes stay
  identical, no new job toast); running a second optimization replaces the
  comparison cleanly; New Project removes it; zero page errors throughout.

### Fixed (caught during this implementation, before shipping)

* The comparison split-divider handle was a plain white circle — nearly
  invisible against light-colored source frames (caught via a manual
  screenshot check, not just the automated assertions, which don't verify
  contrast). Changed to a colored (accent) fill with a white border and a
  dark outline shadow, visible against both light and dark image content.

### Performance / Resource lifecycle

* Comparison decoding only happens when a genuinely new optimize result
  (or source) appears — verified via the e2e test's slider-drag and
  mode-toggle assertions showing identical displayed sizes and no new
  "Optimizing…" toast, i.e. no re-encode, no re-decode.
* The optimized side's bytes are sliced (copied) before being sent to the
  worker for comparison decoding, specifically because Comlink would
  otherwise transfer (detach) the same `ArrayBuffer` the "Download
  optimized GIF" button needs — verified the download still works after
  viewing the comparison first.
* All `ImageBitmap`s from both sides are `.close()`d on replacement,
  `OptimizePanel` unmount, and stale-result invalidation — mirrors
  `frameCacheStore`'s existing close-on-replace/close-on-clear pattern
  rather than introducing a new resource-lifecycle convention.

### Tests

* `npx vitest run`: 64/64 (unaffected — no core logic touched).
* `npx tsc -b`, `npx eslint . --ext ts,tsx`, `npm run build`: all clean.
* `npx playwright test --project=chromium`: **30/30** (29 prior + 1 new
  comprehensive Before/After test).
* `npx playwright test --project=firefox`: **30/30**.
* `npx playwright test --project=webkit`: **18 passed + 12 skipped** (the
  new test skips there too, same OffscreenCanvas reason as the rest of the
  optimize/export suite — optimize itself can't run in this WebKit build,
  so there's never a result to compare).

### Documentation

* `README.md`: fixed the stale Playwright wording; added a one-line
  feature mention.
* `docs/IMPLEMENTATION_STATUS.md`: rewrote the "Before/After" DONE bullet
  for the real visual comparison; added "Heavy-job exclusivity" as its own
  DONE bullet; updated "Job system"/"Cancellation" bullets to reference the
  cooperative-yield and exclusivity mechanisms; removed the now-complete
  TODO item; corrected TEST STATUS counts/table; added a Known Limitations
  note on the "Original = raw upload, not a re-encoded baseline" design
  choice; re-ranked NEXT PRIORITIES.
* `docs/ARCHITECTURE.md`: added "Job lifecycle: cooperative cancellation
  and heavy-job exclusivity" and "Visual Before/After comparison
  (Optimize)" sections; trimmed the older "Lifecycle sync and cleanup"
  paragraph to point at the new, more detailed one instead of duplicating it.

### Git

* Two commits this session (code+tests, then the docs that describe them —
  reversed from the task's suggested docs-first order, deliberately: the
  IMPLEMENTATION_STATUS.md/ARCHITECTURE.md updates describe the comparison
  feature itself, so committing them before the feature they describe
  exists would leave an inconsistent intermediate checkout), both authored
  as the repository's configured identity, no AI attribution — verified
  individually via `git show -s --format="%an <%ae>" HEAD` after each. See
  the git log for exact hashes/messages.
* No remote configured (`git remote -v` empty at both start and end of
  session) — commits remain local, consistent with every prior session.

---

## 2026-09-04 22:11 — Closed two real gaps in the Before/After feature's own test coverage

Continued auditing the just-shipped visual comparison rather than treating
the previous entry's verification as final — two scenarios the earlier
tests didn't actually exercise.

### Verified (live, via throwaway probe scripts before committing anything)

* **Differing frame counts in animated playback**: the comparison's design
  (each side independently clocked, wrapping at its own frame count) had
  only ever been exercised against presets that don't change frame count.
  Ran a real target-size search (44→22 frames via frame-rate reduction)
  and watched the live comparison: both sides report identical 4.0s
  durations (confirms `applyFrameStep`'s duration-preservation holds all
  the way through to playback, not just at encode time) and 3 seconds of
  real animated playback produced zero page errors.
* **"Reset to original" invalidation**: stale-result invalidation had only
  been verified against New Project. Confirmed live that Reset to original
  — a distinct real action that also produces a new `Project` reference —
  correctly clears a previously-shown comparison too.

### Added

* `e2e/before-after-compare.spec.ts`: a new permanent test for the
  Reset-to-original case (the frame-count case wasn't promoted to a
  permanent test — the existing target-size search e2e test already
  covers the encode-side behavior it depends on, and repeating a full
  ~15s target-size search purely to re-watch 3 seconds of canvas playback
  wasn't worth the added suite runtime for what a one-time live check
  already confirmed).

### Tests

* `npx vitest run`: 64/64.
* `npx tsc -b`, `npx eslint . --ext ts,tsx`, `npm run build`: all clean.
* `npx playwright test --project=chromium`: **31/31** (30 prior + 1 new).
* `npx playwright test --project=firefox`: **31/31**.
* `npx playwright test --project=webkit`: **18 passed + 13 skipped** (new
  test skips there too, same OffscreenCanvas reason as the rest of the
  optimize/export suite).

### Documentation

* `docs/IMPLEMENTATION_STATUS.md`: updated TEST STATUS counts (31 e2e
  tests, updated Browser test results table) to the actual re-run numbers.

### Git

* One commit (`test: verify the comparison viewer against differing frame
  counts and Reset to original`), authored as the repository's configured
  identity, no AI attribution — verified via
  `git show -s --format="%an <%ae>" HEAD`.

---

## 2026-09-04 22:23 — Real gap: the comparison decode had no memory safeguard

Kept auditing the Before/After feature for the one remaining unverified
angle: resource lifecycle under a large GIF, matching this project's
established pattern of stress-testing rather than assuming correctness.

### Fixed

* **`decodeForCompare` had no memory cap at all**, unlike the rest of the
  app's load path (`loadGif` refuses above 2GB, `getPreviewBitmaps`
  downscales above 300MB). It always decoded at full resolution, twice per
  optimize result (original + optimized), on top of whatever the live
  project already held resident. Fixed by downscaling above the same
  `MEMORY_WARN_BYTES` (300MB) threshold `getPreviewBitmaps` already uses,
  via the same `OffscreenCanvas`-resize pattern.

### Verified (measured, not assumed)

* The fix only bounds resolution-driven memory growth, not
  frame-count-driven growth — regenerated this project's own
  600-frame/480×360/~415MB synthetic stress fixture (`scripts/
  generate-stress-fixture.cjs`, not committed, generated outside the
  project root per the established lesson from earlier this session) and
  confirmed directly: since 480×360 stays under the downscale threshold's
  800px cap, no downscaling triggers despite 600 frames driving estimated
  memory to ~415MB per side. Rather than leave that as an unverified
  caveat, measured the actual worst case: decoding both comparison sides
  at full resolution against that fixture (~830MB combined) completed
  cleanly in ~12s with zero page errors — a real, documented, but
  currently non-manifesting limitation at the scale this app has actually
  been tested against.
* Normal-size comparisons are unaffected: the `scale === 1` code path is
  byte-identical to before the fix, confirmed by re-running the existing
  Before/After e2e tests with no changes in behavior.

### Tests

* `npx tsc -b`, `npx eslint . --ext ts,tsx`, `npx vitest run` (64/64),
  `npm run build`: all clean.
* `npx playwright test --project=chromium`: 31/31 (no new tests — the
  stress-fixture check was a one-time verification, not promoted to the
  permanent suite, consistent with how this project's earlier large-file
  stress testing was handled).
* `npx playwright test --project=firefox`: 31/31.
* `npx playwright test --project=webkit`: 18 passed + 13 skipped.

### Documentation

* `docs/ARCHITECTURE.md`: updated the "Visual Before/After comparison"
  section — corrected the "no OffscreenCanvas dependency" claim (now
  conditionally true only below the downscale threshold) and documented
  the fix plus its measured frame-count caveat.
* `docs/IMPLEMENTATION_STATUS.md`: added a Known Limitations entry for the
  frame-count-vs-resolution distinction, with the actual measured numbers.

### Git

* One commit (`fix(worker): bound decodeForCompare's memory usage above
  the existing warn threshold`), authored as the repository's configured
  identity, no AI attribution — verified via
  `git show -s --format="%an <%ae>" HEAD`.

---

## 2026-09-04 23:19 — Product polish: pixel-level zoom/pan inspector + autosave-failure warning

A focused product-polish session per this session's brief: fix remaining
doc drift, add pixel-level zoom/pan to the Before/After Frame-mode viewer,
and give storage failures a real user-facing (not just `console.warn`)
signal. Explicitly did not touch MP4/WebM/APNG/ZIP/subtitles/batch/
filters, Performance Mode's design, or a Safari-specific rendering
fallback, per the session's own scope limits.

### Fixed (documentation drift)

* `docs/IMPLEMENTATION_STATUS.md`'s NEXT PRIORITIES still said "12 skipped"
  for WebKit while the Browser test results table above it already
  correctly said 13 (updated when the prior session's Reset-to-original
  test was added) — corrected.

### Added

* **Before/After pixel-level zoom/pan inspector** (Frame mode only, by
  design — Animated mode is untouched): Fit/100%/200%/400%/800% zoom with
  pointer-drag pan, linked between Original and Optimized via one shared
  normalized pan center (`src/tools/beforeAfterViewport.ts`, pure and unit
  tested — 10 new tests) so the same visual region stays aligned even when
  optimization reduced resolution, without stretching either source into
  the other's pixel coordinate system. Purely a CSS-position/size + a
  targeted `image-rendering: pixelated` change over the *already-decoded*
  native-resolution canvases — no redraw, no re-decode, no worker call, so
  it cannot trigger a re-optimize. The existing split divider got its own
  independent pointer handlers so it keeps working correctly regardless of
  zoom state, instead of fighting the new pan-drag handling on the same
  container. A lightweight hover readout shows the inspected source-pixel
  coordinate for both sides (no `getImageData`, so no throttling needed);
  the optional RGBA color readout from the brief was deliberately skipped
  — it would need a throttled `getImageData` call, adding real complexity/
  risk for a "nice to have" — and is recorded in NEXT PRIORITIES instead of
  silently dropped.
* **Storage-health warning**: a small dedicated `storageHealthStore.ts`
  (deliberately not folded into `jobStore` — storage health is a standing
  condition, not an async operation) now surfaces a non-blocking,
  deduplicated banner when autosave/asset persistence fails, instead of
  only a `console.warn`. Deduplication: a failure only transitions out of
  a *healthy* state, so repeated failures during the same outage (every
  1.5s autosave retry) don't re-notify; a later success clears it so a
  genuinely new failure can notify again; dismissing hides it without
  curing the condition. Wired into `saveProjectAutosave` (both the
  debounced save and the startup restore-read) and `saveAsset`. Editing
  and export are fully unaffected by a storage failure — both are
  independent of IndexedDB.

### Bugs Found

* **A self-caught test-authoring mistake, not an app bug**: the first
  WebKit run after adding the storage-health tests showed 18 skipped
  instead of the expected ~16 — both new tests had a
  `test.skip(browserName === 'webkit', ...)` copied from a neighboring
  test, but the second test ("does not show when storage is healthy")
  never touches export/optimize and has no OffscreenCanvas dependency at
  all. Removed the unnecessary skip and verified live that it actually
  passes on WebKit — it does. Not counted as a product bug (nothing
  shipped was wrong), but recorded since it changed the real, verified
  WebKit skip count.

### Performance

* Zoom/pan verified cheap in practice, not just by design: the e2e test
  changes zoom level and drags to pan, then asserts the displayed
  "Optimized" size text is byte-identical to before and no new
  "Optimizing…" toast appears — confirming no re-encode/re-decode is
  triggered by any zoom/pan interaction.

### Tests

* `npx vitest run`: **74/74** (64 prior + 10 new
  `beforeAfterViewport.test.ts` geometry tests).
* `npx tsc -b`, `npx eslint . --ext ts,tsx`, `npm run build`: all clean.
* `npx playwright test --project=chromium`: **36/36** (31 prior + 3 zoom +
  2 storage-health).
* `npx playwright test --project=firefox`: **36/36**.
* `npx playwright test --project=webkit`: **19 passed + 17 skipped + 0
  failed** (one of the two new storage-health tests correctly runs there
  too, per the "Bugs Found" fix above).

### Documentation

* `docs/IMPLEMENTATION_STATUS.md`: fixed the 12-vs-13 WebKit count drift;
  rewrote the Before/After DONE bullet's zoom/pan coverage; added a
  Storage-health-warning DONE bullet; resolved the matching Technical Debt
  item; corrected TEST STATUS counts/table to the actual re-run numbers;
  re-ranked NEXT PRIORITIES against the actual new state (WebKit
  verification still #1; the deliberately-skipped RGBA color readout and
  deeper Performance Mode work are the new #2/#4, not carried-over stale
  items).
* `docs/ARCHITECTURE.md`: added the zoom/pan linked-normalized-mapping
  architecture to the existing "Visual Before/After comparison" section,
  and a new "Storage-health notice" paragraph under "Storage (autosave)".
* `README.md`: one-line addition noting pixel-level zoom/pan inspection,
  no internals.

### Git

* Four commits this session, all authored as the repository's configured
  identity, no AI attribution — verified individually via
  `git show -s --format="%an <%ae>" HEAD` after each:
  1. `docs: fix stale WebKit skip count in NEXT PRIORITIES (12 -> 13)`
  2. `feat(optimize): add pixel-level zoom/pan to the Before/After Frame mode`
  3. `feat(storage): add a non-blocking, deduplicated autosave-failure warning`
  4. (this documentation entry)
* No remote configured (`git remote -v` empty at both start and end of
  session) — commits remain local, consistent with every prior session.

---

## 2026-09-05 00:39 — Native MP4/WebM video export

The first substantial post-MVP capability: exporting the same edited
project GIF export produces as a real MP4 or WebM video file. Additive to
the existing GIF pipeline throughout — `renderAllFrames`, GIF
quantization/timing/disposal handling, and target-size search were not
touched.

### Technical spike

* Investigated the current environment before choosing an architecture,
  per this session's brief, rather than assuming the suggested library.
  Confirmed via `npm view`: `mediabunny` v1.55.7, published the same day
  as this evaluation, MPL-2.0 licensed, effectively zero runtime
  dependencies (two `@types/*` ambient packages only), real TypeScript
  definitions (read directly from `node_modules/mediabunny/dist/modules/
  src/*.d.ts` to derive this session's actual usage — `Output`,
  `Mp4OutputFormat`/`WebMOutputFormat`, `BufferTarget`, `VideoSampleSource`,
  `VideoSample`, `canEncodeVideo`, `Quality`), and the direct, actively-
  recommended successor to the same author's older `mp4-muxer`/
  `webm-muxer` — used the successor, not the packages it superseded.
* Recorded the MPL-2.0 licensing decision explicitly (see
  `docs/IMPLEMENTATION_STATUS.md`'s Technical Decisions) rather than
  silently introducing a non-permissive dependency — MPL-2.0 permits
  closed-source commercial use, and only mediabunny's own files carry it.
* Evaluated `ffmpeg.wasm` as the task required, and deliberately did not
  add it: `@ffmpeg/core` is ~65MB unpacked (checked via `npm view`, not
  estimated), needs its own worker model that sits awkwardly against this
  project's one-worker architecture, and its fast build requires
  `SharedArrayBuffer`/COOP-COEP headers this project doesn't otherwise
  need. Full reasoning recorded under Technical Debt.

### Added

* `src/core/video/` — `types.ts`, `timestamps.ts`, `bitrate.ts`,
  `dimensions.ts` (all pure, unit tested — 22 new tests), `capabilities.ts`
  (runtime codec probing via `canEncodeVideo`, dynamically imports
  mediabunny), `exportVideo.ts` (the actual encode/mux, also dynamically
  imported, only from inside the worker).
* `pipeline.worker.ts`: new `exportVideo()` method, reusing the exact same
  private `renderAllFrames` GIF export/optimize already call, and sharing
  their existing heavy-job-exclusivity guard (same `abortController`
  check/`finally` reset) rather than adding a second lock.
* `ExportPanel.tsx`: a Format selector (GIF/MP4/WebM); GIF-only settings
  (palette size, dithering, loop count) hidden when a video format is
  selected. Video settings: quality preset (High Quality/Balanced/Small
  File), output scale, background color (Black/White/Custom, composited
  onto transparent pixels — video formats don't reliably support alpha),
  and an Advanced custom-bitrate override. A capability badge per format
  ("Available" / a plain-language reason why not), checked when the user
  selects that format tab specifically — not merely when the Export panel
  opens, so exporting a GIF (the far more common path) never loads any
  video-specific code.

### Bugs Found

* None in already-shipped code — this was new-feature work. Caught and
  fixed during the feature's own implementation: an ESLint
  `no-control-regex` violation in a hand-rolled filename-sanitizer regex
  (dropped the unneeded control-character range rather than suppress the
  rule); a Playwright test author error (two heavy-job-exclusivity test
  designs that couldn't actually reach the race they meant to test,
  because `ExportPanel`'s GIF/video export share one `exporting` boolean —
  the real, reachable race is Optimize vs. video export, since those are
  separate panels with independent local state; rewritten and verified).

### Tests

* `npx vitest run`: **96/96** (74 prior + 22 new: `timestamps.test.ts`,
  `bitrate.test.ts`, `dimensions.test.ts`).
* New `e2e/video-export.spec.ts` (8 tests, capability-aware rather than
  blanket-skipped by browser name):
  1. Capability detection shows a real Available/Unavailable state for
     both formats, no raw codec string in the primary message, without
     exporting anything.
  2. A real WebM file downloads and loads/plays in an actual `<video>`
     element — correct padded dimensions (441×291 source → 442×292) and
     correct duration (24 frames × 50ms = 1.2s, matched exactly).
  3. A real project edit (image overlay, centered by default) is
     genuinely present when the exported video is decoded and its center
     pixel sampled — not just correct timing/dimensions.
  4. A newly-generated tiny (10×10, 4-frame) fixture with variable delays
     (40/80/20/120ms) produces the exact correct total duration (260ms),
     not an assumed frame rate — generated at test time via `gifenc`
     directly (not committed, per this session's own "don't commit media
     fixtures" instruction).
  5. Odd source dimensions (441×291) are padded to even (442×292), not
     distorted, with a user-facing notice.
  6. Cancelling a video export stops cleanly (no red error toast) and a
     fresh export afterward still works.
  7. Starting a video export while Optimize is running is rejected with
     the shared heavy-job-exclusivity message, and both remain usable
     afterward once Optimize finishes.
  8. New Project clears video export state; GIF export still works
     normally afterward.
* Full three-browser run: **chromium 44/44**, **firefox 44/44** (WebM
  verified working on both), **webkit 20/44 passed + 24 skipped + 0
  failed** (capability-aware self-skips: WebM encoding is genuinely
  unavailable in this WebKit build, same class of gap as its
  already-documented OffscreenCanvas absence).
* `npm run build`: bundle impact verified directly from build output, not
  assumed — see the Documentation section's IMPLEMENTATION_STATUS.md
  summary for the exact chunk sizes.

### Performance / real findings

* **H.264/AVC encoding was unavailable everywhere tested this session** —
  Chromium, Firefox, and WebKit's Playwright builds, *and* real installed
  Google Chrome on the development machine (checked via `channel: 'chrome'`
  specifically to rule out "Playwright's bundled Chromium isn't real
  Chrome" as the explanation). This is consistent with WebCodecs H.264
  *encoding* commonly depending on a hardware encoder the current
  device/VM doesn't expose (unlike *decoding*, far more universal).
  GifForge's capability gating correctly disabled MP4 export with a clear
  message in every case — verified this is the correct, intended behavior
  for a genuinely unavailable codec, not a bug to chase further this
  session. MP4 is therefore recorded as implemented-but-unverified, not
  DONE, until run on a machine with confirmed H.264 hardware encode.
* WebM export of the 24-frame loading-icon fixture completed in ~2.5-3s
  end-to-end (click to download) in manual measurement during
  development — fast enough that no loading-state UX beyond the existing
  job-progress toast was needed.

### Documentation

* `README.md`: one-line feature mention.
* `docs/ARCHITECTURE.md`: new "Video export (MP4/WebM)" section — native
  WebCodecs + mediabunny strategy, runtime codec probing, lazy-loading
  boundary (with verified bundle numbers), timing model, frame
  creation/background compositing, even-dimension padding, backpressure/
  `VideoFrame` lifecycle, no-audio/one-loop-cycle scope decisions.
* `docs/IMPLEMENTATION_STATUS.md`: added WebM (DONE) and MP4
  (implemented-but-unverified) to the DONE section; removed the
  now-superseded "MP4/WebM export" TODO item; added Known Limitations
  entries for the MP4 hardware-encode gap and the no-audio/one-loop/
  composited-background scope decisions; added the mediabunny licensing
  decision to Technical Decisions; added the full `ffmpeg.wasm` evaluation
  to Technical Debt; corrected TEST STATUS to the actual re-run counts;
  re-ranked NEXT PRIORITIES (MP4 hardware verification is now #1).

### Git

* Commits this session, all authored as the repository's configured
  identity, no AI attribution — verified individually via
  `git show -s --format="%an <%ae>" HEAD` after each. See the git log for
  exact hashes/messages.
* No remote configured (`git remote -v` empty at both start and end of
  session) — commits remain local, consistent with every prior session.
