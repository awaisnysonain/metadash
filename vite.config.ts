import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  server: {
    port: 5000,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
    proxy: {
      '/api': { target: 'http://localhost:5011', changeOrigin: true },
      '/webhooks': { target: 'http://localhost:5011', changeOrigin: true },
      '/auth': { target: 'http://localhost:5011', changeOrigin: true },
    },
  },
}));
