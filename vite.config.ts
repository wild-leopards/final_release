import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the heavy vendor libraries out of the app bundle: the
        // browser downloads them in parallel instead of one multi-MB
        // file (nothing paints until that single bundle is parsed),
        // and they cache independently of app-code changes.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('maplibre-gl')) return 'vendor-maplibre';
          if (id.includes('gsap')) return 'vendor-gsap';
          if (id.includes('three')) return 'vendor-three';
          if (id.includes('react')) return 'vendor-react';
          return 'vendor-misc';
        },
      },
    },
  },
})
