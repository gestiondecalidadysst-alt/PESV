import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emite la metadata de decoradores que necesita la inyección de dependencias de NestJS.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], fileParallelism: false, testTimeout: 20000 },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
