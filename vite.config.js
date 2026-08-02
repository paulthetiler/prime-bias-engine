import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split large, stable vendor groups into their own long-cacheable chunks
        // so app-code updates don't bust the vendor cache. The `charts` group
        // (Recharts + d3 + lodash) is only imported by the lazy Journal / Stats
        // routes, so it stays out of the initial Login / Dashboard load.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
            return 'react-vendor';
          }
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('framer-motion')) return 'motion';
        },
      },
    },
  },
});
