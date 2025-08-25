/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.d.ts'],
    },
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: [
      {
        find: '@lvce-editor/ripgrep',
        replacement: path.resolve(__dirname, 'src/test/stubs/ripgrep.ts'),
      },
      {
        find: 'isomorphic-git/http/web',
        replacement: path.resolve(
          __dirname,
          'src/test/stubs/isomorphic-git-http-web.ts',
        ),
      },
      {
        find: 'isomorphic-git',
        replacement: path.resolve(
          __dirname,
          'src/test/stubs/isomorphic-git.ts',
        ),
      },
      {
        find: 'path-browserify',
        replacement: path.resolve(
          __dirname,
          'src/test/stubs/path-browserify.ts',
        ),
      },
    ],
  },
});
