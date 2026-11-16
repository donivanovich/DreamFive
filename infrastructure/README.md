# `infrastructure/` — Contenedores, Scripts y Monitorización

Agrupa los artefactos operativos e infraestructura como código del proyecto.

## Contenido

- `docker/node.Dockerfile`: _Dockerfile_ multi-etapa único que genera las imágenes de producción `api`, `worker`, `web` y la imagen auxiliar `migrate` a partir de `node:24.22.3-alpine3.24`, ejecutando los servicios como usuario `node` sin privilegios y con `tini` como PID 1.
- `scripts/`: reservado para scripts operativos y de automatización del entorno (actualmente con `.gitkeep`).
- `monitoring/`: reservado para configuraciones futuras de métricas, alertas o tableros de observabilidad (actualmente con `.gitkeep`).

## Normas del directorio

- **Sin secretos ni credenciales:** nunca almacenes contraseñas, certificados ni `.env` aquí.
- **Versiones fijadas:** toda imagen base en `docker/` o en los archivos Compose de la raíz debe usar una etiqueta de versión específica (prohibido `latest`).
- **Contexto raíz:** `node.Dockerfile` espera ejecutarse con la raíz del monorepo como contexto de build (tal como configura `docker-compose.yml`).
