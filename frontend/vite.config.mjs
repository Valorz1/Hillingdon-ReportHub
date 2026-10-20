import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// Vite dev config. The proxy maps /api/* on the dev server to the
// FastAPI backend (uvicorn on :8000 by default), so `npm run dev`
// opens http://localhost:5173 and any fetch('/api/…') transparently
// hits BACKEND_URL. Only used when VITE_USE_BACKEND=true.
//
// In prod, nginx serves the built bundle and proxies /api/ to
// uvicorn on the same origin, so no proxy is needed.
export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
