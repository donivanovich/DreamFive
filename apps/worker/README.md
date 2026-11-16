# `@dream5/worker` — Procesador Asíncrono 24/7

Aplicación **NestJS standalone** (sin servidor HTTP) encargada de ejecutar las tareas en segundo plano de DREAM5 de forma continua e independiente de los usuarios conectados.

## Responsabilidad

- Mantener la conexión de consumidor con Redis/BullMQ para procesar trabajos asíncronos.
- Alojar los futuros planificadores (_schedulers_) y procesadores (_processors_) de simulación, mercado, lesiones, progresión, clasificaciones y temporadas.
- Invocar `@dream5/simulation-engine` sin acoplar el motor deportivo a NestJS ni a BullMQ.
- Emitir un latido periódico (`HeartbeatService`) verificado por `healthcheck.ts` para supervisión de contenedores.

## Organización interna

```text
src/
├── config/         # Validación de entorno del worker y configuración de pino
├── queues/         # Conexión BullMQ (consumidor, `maxRetriesPerRequest: null`)
├── health/         # Latido periódico tras comprobar ping a Redis
├── processors/     # Carpetas preparadas por cola (simulation, market, injuries, progression, rankings, seasons)
├── schedulers/     # Reservado para jobs recurrentes (cron/repeatables) por liga
├── jobs/           # Reservado para definición de payloads y nombres de trabajo
├── worker.module.ts# Módulo raíz sin HTTP
├── main.ts         # Arranque con createApplicationContext y shutdown hooks
└── healthcheck.ts  # Script ligero para Docker HEALTHCHECK
```

## Normas del paquete

- **Proceso desacoplado:** puede arrancarse, reiniciarse y escalarse por separado de `apps/api`.
- **Cierre ordenado:** `app.enableShutdownHooks()` garantiza que BullMQ espere a finalizar los trabajos activos ante `SIGTERM`/`SIGINT`.
- **Sin HTTP:** nunca abras puertos HTTP en el worker; la salud se comprueba mediante `node dist/healthcheck.js`.
- **Aislamiento:** cada job deberá incluir `leagueId` en su payload para operar únicamente sobre los datos de esa liga.
