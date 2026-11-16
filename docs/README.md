# Documentación técnica de DREAM5

Documentación oficial en español del prototipo Full Stack **DREAM5**.

## Índice general

- **Arquitectura (`architecture/`)**
  - [Visión general del sistema](./architecture/overview.md): topología completa entre frontend, API NestJS, Worker BullMQ, motor deportivo, PostgreSQL y Redis.
  - [Decisiones de arquitectura (ADR)](./architecture/decisions.md): justificación de cada decisión técnica clave y parámetros provisionales.
  - [Aislamiento de datos entre ligas](./architecture/data-isolation.md): diseño relacional y de autorización para garantizar ligas 100 % independientes.
- **Base de datos (`database/`)**
  - [Esquema de base de datos y migraciones](./database/schema.md): tablas de catálogo, instancias por liga, restricciones compuestas e índice único parcial.
- **Diseño y mecánicas del juego (`gameplay/`)**
  - [Reglas oficiales y parámetros provisionales](./gameplay/rules.md): v0.3 vs reglas abiertas de `PROVISIONAL_GAME_CONFIG`.
  - [Simulación deportiva y Worker 24/7](./gameplay/simulation.md): algoritmo determinista, 58 jornadas, lesiones, expulsiones y progresión.
  - [Economía y mercado dinámico](./gameplay/economy.md): valoración de jugadores, límites de mercado y recalculo periódico.
  - [Sistema de traspasos](./gameplay/transfers.md): validaciones ACID, 18 jugadores, 5 posiciones, regla del 50 % e idempotencia.
- **API y tiempo real (`api/`)**
  - [Endpoints REST y eventos Socket.IO](./api/endpoints.md): contrato de rutas, autenticación, cookies y canales WebSocket.
- **Desarrollo y operación (`development/`)**
  - [Puesta en marcha local](./development/local-setup.md): arranque paso a paso en Windows/Linux, variables de entorno y Docker Compose.
  - [Guía de pruebas](./development/testing.md): Vitest (unitarias, PostgreSQL real y Fastify HTTP) y Playwright E2E.
  - [Resolución de problemas](./development/troubleshooting.md): errores frecuentes, puertos, validación de usuario y diagnóstico.
- **Seguridad (`security/`)**
  - [Política de seguridad](./security/security-policy.md)
  - [Auditoría de dependencias](./security/dependency-audit.md)
