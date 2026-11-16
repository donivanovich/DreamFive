import baseConfig from '@dream5/config/prettier';

/** @type {import('prettier').Config} */
export default {
  ...baseConfig,
  plugins: ['prettier-plugin-tailwindcss'],
  // Ruta a la hoja de estilos de Tailwind v4 para ordenar clases correctamente.
  tailwindStylesheet: './apps/web/src/styles/app.css',
  tailwindFunctions: ['cn', 'cva'],
};
