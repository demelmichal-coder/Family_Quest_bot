import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Absolutní cesta pro produkci v kořeni domény
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
