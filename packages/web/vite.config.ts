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
  },
  optimizeDeps: {
    include: ['isomorphic-git', '@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links', 'buffer'],
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
});