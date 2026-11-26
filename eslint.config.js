import { createConfig } from '@dreamfive/config/eslint';

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  nodeFiles: ['apps/api/**', 'apps/worker/**', 'packages/**', 'apps/web/*.config.ts'],
  nestFiles: ['apps/api/src/**/*.ts', 'apps/worker/src/**/*.ts'],
  reactFiles: ['apps/web/src/**/*.{ts,tsx}'],
});
