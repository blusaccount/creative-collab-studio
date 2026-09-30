import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    // three.js is inherently large; keep the warning from firing on the vendor chunk.
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        // Split the heavy 3D engine, PSD codec and React out of the app chunk.
        manualChunks(id) {
          if (id.indexOf('node_modules/three') !== -1) return 'three';
          if (id.indexOf('node_modules/ag-psd') !== -1) return 'psd';
          if (id.indexOf('node_modules/react') !== -1) return 'react';
        },
      },
    },
  },
});
