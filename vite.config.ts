import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  build: { target: 'esnext' },
  server: loadEnv(mode, process.cwd(), '').VITE_DATA_SOURCE === 'http' ? { proxy: { '/api': 'http://localhost:3000' } } : undefined,
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
}));
