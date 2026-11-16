# `@dream5/config` — Configuración Compartida de Calidad y Compilación

Paquete interno privado que centraliza las configuraciones base de **TypeScript**, **ESLint** y **Prettier** para todo el monorepo.

## Contenido

- `typescript/base.json`: configuración estricta común (`strict`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.).
- `typescript/node-library.json`: perfil `NodeNext` ESM con emisión de declaraciones `.d.ts` para librerías en `packages/*`.
- `typescript/nestjs.json`: perfil `NodeNext` para `apps/api` y `apps/worker` con `experimentalDecorators` y `emitDecoratorMetadata`.
- `typescript/react-app.json`: perfil `ESNext` + `Bundler` + `react-jsx` para `apps/web`.
- `eslint/index.js`: factoría de _flat config_ con `typescript-eslint` (`strictTypeChecked` + `stylisticTypeChecked`), reglas de React Hooks/Refresh, `no-console` y `eslint-config-prettier`.
- `prettier/index.js`: reglas base de formato (el `prettier.config.js` raíz añade `prettier-plugin-tailwindcss`).

## Normas del paquete

- **No relajar reglas estrictas:** cualquier ajuste debe mantener activas las comprobaciones de nulabilidad, tipado implícito y variables sin uso.
- **Solo herramientas de desarrollo:** este paquete no se incluye en los despliegues de producción (`pnpm deploy --prod` de `api`, `worker` y `web`).
