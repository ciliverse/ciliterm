import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_PORT = process.env.CILITERM_PORT ?? '8787';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@tweenjs/tween.js', 'pusher.color', 'vec2'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', 'three-globe'],
          xterm: [
            '@xterm/xterm',
            '@xterm/addon-fit',
            '@xterm/addon-search',
            '@xterm/addon-web-links',
            '@xterm/addon-webgl',
          ],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5273,
    proxy: {
      '/pty': { target: `ws://127.0.0.1:${BACKEND_PORT}`, ws: true },
      '/control': { target: `ws://127.0.0.1:${BACKEND_PORT}`, ws: true },
      '/sys': { target: `ws://127.0.0.1:${BACKEND_PORT}`, ws: true },
      '/api': { target: `http://127.0.0.1:${BACKEND_PORT}` },
    },
  },
});
