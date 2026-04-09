import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Tauri dev server config
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5174,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    outDir: 'dist',
    // Tauri expects a fixed output directory
    emptyOutDir: true,
    // Tauri uses Chromium on Windows — target modern browsers
    target: ['es2021', 'chrome100', 'safari13'],
    // Don't minify during debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce source maps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
