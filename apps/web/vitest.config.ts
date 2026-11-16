import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

// Configuración de Vitest independiente de vite.config.ts para que las
// pruebas unitarias no carguen los plugins de TanStack Start.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
  },
});
