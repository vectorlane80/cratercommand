import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^phaser$/, replacement: fileURLToPath(new URL('./tests/stubs/phaser.ts', import.meta.url)) }
    ]
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
