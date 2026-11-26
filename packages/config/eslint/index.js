/**
 * Configuración compartida de ESLint (flat config) para DreamFive.
 *
 * Se expone como una función para que el `eslint.config.js` raíz decida qué
 * patrones de archivos reciben cada bloque de reglas. Usa linting con
 * información de tipos (`strictTypeChecked`) sobre todo el código TypeScript.
 */
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Directorios y archivos generados que nunca deben analizarse. */
export const defaultIgnores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.output/**',
  '**/.tanstack/**',
  '**/coverage/**',
  '**/test-results/**',
  '**/playwright-report/**',
  'packages/database/src/generated/**',
  'apps/web/src/routeTree.gen.ts',
];

/**
 * @param {object} options
 * @param {string} options.tsconfigRootDir Directorio raíz del monorepo.
 * @param {string[]} options.nodeFiles Patrones de código que se ejecuta en Node.js.
 * @param {string[]} options.nestFiles Patrones de código NestJS (decoradores).
 * @param {string[]} options.reactFiles Patrones de código React.
 * @returns {import('eslint').Linter.Config[]}
 */
export function createConfig({ tsconfigRootDir, nodeFiles, nestFiles, reactFiles }) {
  return [
    { ignores: defaultIgnores },

    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,

    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      linterOptions: {
        reportUnusedDisableDirectives: 'error',
      },
      rules: {
        '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        eqeqeq: ['error', 'always'],
        'no-console': 'error',
      },
    },

    // Los archivos JavaScript de configuración no forman parte de ningún
    // tsconfig: se analizan sin información de tipos.
    {
      files: ['**/*.{js,mjs,cjs}'],
      ...tseslint.configs.disableTypeChecked,
      languageOptions: {
        globals: globals.node,
        parserOptions: { projectService: false },
      },
    },

    {
      files: nodeFiles,
      languageOptions: { globals: globals.node },
    },

    {
      files: nestFiles,
      rules: {
        // Los módulos de NestJS son clases vacías decoradas con @Module().
        '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      },
    },

    {
      files: reactFiles,
      languageOptions: { globals: globals.browser },
      plugins: {
        'react-hooks': reactHooks,
        'react-refresh': reactRefresh,
      },
      rules: {
        ...reactHooks.configs.recommended.rules,
        'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      },
    },

    // TanStack Start / Router gestiona el code-splitting y HMR de los archivos
    // de ruta, que exportan `Route` junto con componentes locales.
    {
      files: ['apps/web/src/routes/**/*.{ts,tsx}'],
      rules: {
        'react-refresh/only-export-components': 'off',
      },
    },

    // Debe ir al final: desactiva reglas de formato que gestiona Prettier.
    prettier,
  ];
}
