import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
  return {
    // Capacitor serves the bundle from the filesystem root, so the GitHub Pages
    // subpath would 404 every asset. Build the app shell with BUILD_TARGET=capacitor.
    base: process.env.BUILD_TARGET === 'capacitor' ? './' : '/east-vs-west-game/',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
