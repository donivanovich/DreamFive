import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env['WEB_PORT'] ?? 3000);
const baseURL = process.env['PLAYWRIGHT_BASE_URL'] ?? `http://localhost:${String(port)}`;

/**
 * Pruebas end-to-end. Por defecto construyen la aplicación y la sirven con el
 * servidor de producción; si PLAYWRIGHT_BASE_URL está definido se prueba
 * contra un entorno ya levantado (p. ej. Docker Compose).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(process.env['PLAYWRIGHT_BASE_URL']
    ? {}
    : {
        webServer: {
          command: 'pnpm run build && pnpm run start',
          url: baseURL,
          reuseExistingServer: !process.env['CI'],
          timeout: 180_000,
          env: { PORT: String(port) },
        },
      }),
});
