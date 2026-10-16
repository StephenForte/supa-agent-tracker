import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // The root config is a container. Web tests stay in jsdom; server tests run in Node.
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          restoreMocks: true,
        },
      },
      {
        extends: false,
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts'],
          restoreMocks: true,
        },
      },
    ],
  },
});
