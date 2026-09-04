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
