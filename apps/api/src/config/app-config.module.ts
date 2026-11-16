import { type DynamicModule, Global, Module } from '@nestjs/common';

import type { ApiEnv } from './env.schema.js';

/** Token de inyección de la configuración validada. */
export const API_ENV = Symbol('API_ENV');

/**
 * Módulo global de configuración.
 *
 * Recibe el entorno ya validado en `main.ts` y lo expone como valor
 * inmutable inyectable con `@Inject(API_ENV)`.
 */
@Global()
@Module({})
export class AppConfigModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [{ provide: API_ENV, useValue: Object.freeze({ ...env }) }],
      exports: [API_ENV],
    };
  }
}
