import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: Number(process.env['WEB_PORT'] ?? 3000),
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Solo las variables con prefijo VITE_ llegan al navegador. Nunca uses este
  // prefijo para secretos.
  envDir: '../..',
  envPrefix: 'VITE_',
  plugins: [
    tailwindcss(),
    tanstackStart({
      router: {
        // Las carpetas de rutas previstas contienen .gitkeep hasta que se
        // desarrollen; el generador de rutas debe ignorarlos.
        routeFileIgnorePattern: '\\.gitkeep$',
      },
    }),
    // El plugin de React debe ir después del de TanStack Start.
    viteReact(),
  ],
});
