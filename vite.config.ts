import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // relative asset paths: dist/ works from a domain root or any sub-folder (GitHub Pages)
  base: './',
  plugins: [react()],
  // Phaser's loader treats data: URIs as base64; keep art as real files (also easier to swap).
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      output: {
        advancedChunks: { groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }] },
      },
    },
  },
})
