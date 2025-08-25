/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  optimizeDeps: {
    include: [
      'isomorphic-git',
      '@xterm/xterm',
      '@xterm/addon-fit',
      '@xterm/addon-web-links',
      'buffer',
    ],
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      '@google/gemini-cli-core/dist/src/utils/getPty.js':
        './src/platform/stubs/getPty.ts',
      chalk: './src/platform/stubs/chalk.ts',
      'google-auth-library': './src/platform/stubs/google-auth-library.ts',
      'google-logging-utils': './src/platform/stubs/google-logging-utils.ts',
    },
  },
});
