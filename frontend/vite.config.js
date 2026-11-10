import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      manifest: false, // manifest.webmanifest is hand-written in public/
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  base: '/', // Absolutní cesta pro produkci v kořeni domény
  server: {
    proxy: {
      // Keep the /api prefix intact (do not strip it): the backend serves most
      // routers both with and without /api, but /api/auth/* (secure_auth) and
      // /api/push/* only exist under /api. Matches how production calls the
      // backend directly at an /api-suffixed URL (see frontend/.env.production).
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
