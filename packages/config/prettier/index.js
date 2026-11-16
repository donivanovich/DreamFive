/**
 * Configuración base de Prettier para todo el monorepo.
 * Los plugins (p. ej. Tailwind) se añaden en el `prettier.config.js` raíz
 * para que se resuelvan desde el workspace.
 *
 * @type {import('prettier').Config}
 */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',
};

export default config;
