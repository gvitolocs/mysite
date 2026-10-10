/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// BASE_PATH=/poko/ serves the site from a sub-path (see docs/DEPLOYMENT.md).
export default defineConfig(({ isSsrBuild }) => ({
  base: process.env.BASE_PATH ?? '/',
  plugins: [solid({ ssr: true })],
  build: {
    target: 'es2022',
    // The client build emits hashed, immutable assets; the SSR build is only used by the prerenderer.
    outDir: isSsrBuild ? 'dist-ssr' : 'dist',
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: isSsrBuild
      ? undefined
      : {
          input: { main: 'index.html' },
          output: {
            // Keep three.js in its own long-lived chunk: it changes far less often than app code.
            manualChunks(id: string) {
              if (id.includes('node_modules/three')) return 'three';
              return undefined;
            },
          },
        },
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
}));
