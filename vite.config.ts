import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()], test: { exclude: [...configDefaults.exclude, 'spike/**'], environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], restoreMocks: true } });
