import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    clearMocks: true,
    // Los hashes Argon2 comparten memoria y CPU con Oracle durante la aceptación.
    maxWorkers: 2,
  },
});
