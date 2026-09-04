# GifForge

**Edit. Optimize. Export.**

GifForge is a browser-based animated GIF editor. Upload a GIF, edit it, and
export it — all in one page.

## Features

* GIF import (upload or drag-and-drop), with real metadata (dimensions,
  frame count, loop count, duration)
* Playback with a scrubbable frame timeline
* Frame selection (range syntax like `1-10,15,20-25`), delete/keep/reverse
* Crop, resize, and rotate
* Playback speed adjustment
* Text layers and image overlay layers, with drag/resize/rotate and
  per-frame visibility
* Real GIF optimization, including a target-file-size mode
* Static frame export to PNG/JPEG
* Undo/redo and local autosave

## Privacy

GIF decoding, editing, optimization, and encoding all happen locally in
your browser. Your files are not intentionally uploaded to any external
server.

## Development

Requires Node.js `^20.19.0` or `>=22.12.0` (Vite 7's minimum). Plain "Node
20" or Node 22.0–22.11 will run with a warning but are not officially
supported.

```bash
npm install
npm run dev         # start the dev server
```

```bash
npm run build        # production build to dist/
npm run typecheck    # TypeScript project check
npm run lint         # ESLint
npm test              # unit tests (Vitest)
npm run test:e2e      # browser tests (Playwright), if installed — see docs/ARCHITECTURE.md
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it's built,
[`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) for exactly
what's implemented and verified, and [`docs/PROGRESS.md`](docs/PROGRESS.md)
for development history.
