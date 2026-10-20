import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emite la metadata de decoradores que necesita la inyección de dependencias de NestJS.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: { DISABLE_WORKERS: 'true', STORAGE_DIR: './.storage-test' },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
