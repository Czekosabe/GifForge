import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves this project below /GifForge/, not at the domain root — only the
// GitHub Pages deploy step sets GITHUB_PAGES=true, so `npm run dev`, a plain local
// `npm run build`, and `npm run preview` are all unaffected and stay at "/".
const base = process.env.GITHUB_PAGES === 'true' ? '/GifForge/' : '/'

export default defineConfig({
  base,
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
