# Sistema de traspasos entre equipos

El sistema de traspasos de **DREAM5** (`packages/database/src/services/transfer-engine.ts`) garantiza la integridad deportiva y contable de cada operación mediante validación previa + transacción PostgreSQL ACID.

## Invariantes obligatorias en todo intercambio

1. **Pertenencia y aislamiento en la misma liga:** ambos equipos (`proposingTeamId`, `receivingTeamId`) y todos los jugadores ofrecidos o solicitados deben pertenecer actualmente a sus respectivos clubes dentro de la misma `leagueId`.
2. **Plantilla exacta de 18 jugadores:** el número de jugadores salientes y entrantes debe mantener exactamente **18 jugadores** en ambas plantillas resultantes.
3. **Cobertura de las 5 posiciones:** una vez aplicado el intercambio hipotético, tanto tu equipo como el equipo receptor deben conservar al menos **1 jugador** en cada una de las cinco posiciones (`PG`, `SG`, `SF`, `PF`, `C`). Los traspasos entre posiciones diferentes están permitidos siempre que se cumpla esta condición.
4. **Valoración mínima del 50 %:**
   $$\text{Paquete entregado} = \sum \text{Precio(jugadores ofrecidos)} + \text{Efectivo ofrecido}$$
   $$\text{Paquete deseado} = \sum \text{Precio(jugadores pedidos)} + \text{Efectivo pedido}$$
   El paquete entregado debe ser mayor o igual al **50 %** del paquete deseado (`LEAGUE_RULES.minTradeValueRatio = 0.5`).
5. **Suficiencia de caja:** ningún club puede ofrecer ni entregar más millones que su `budgetMillions` disponible.
6. **Bloqueo por partidos tras oferta rechazada (`1` partido):** cuando una propuesta de traspaso termina rechazada (`REJECTED`), **tanto los jugadores propuestos como los solicitados** quedan bloqueados durante **1 partido** de su equipo (`rejectionCooldownMatches: 1`) para evitar abusos contra la CPU o repetición inmediata.
7. **Bloqueo tras fichaje completado (`5` partidos):** cuando un jugador cambia de franquicia en un traspaso aceptado, queda bloqueado en su nuevo club durante **5 partidos** (`acquiredPlayerLockMatches: 5`) antes de poder volver a incluirse en otro intercambio. Mientras siga activo cualquier bloqueo, la API responde `409 Conflict` y el jugador aparece etiquetado en `blockedPlayers` (`LOCKED 1 MATCH` / `BLOQUEADO 1 PARTIDO` o `LOCKED X MATCHES` / `BLOQUEADO X PARTIDOS`).

## Ejecución ACID, CPU e idempotencia

- **Traspaso contra equipo CPU:** si el equipo receptor tiene `isCpuControlled = true`, el sistema evalúa automáticamente el ratio de valoración según el criterio provisional (`cpuAcceptMinRatio = 0.96`). Si se alcanza el umbral, la oferta queda aceptada y ejecutada en la misma transacción; en caso contrario se marca como rechazada con nota explicativa.
- **Traspaso entre mánagers humanos:** se registra en estado `PENDING` para que el receptor la acepte o rechace (`POST /leagues/:leagueId/transfers/:offerId/accept` o `/reject`), o el proponente la retire (`/cancel`).
- **Control idempotente ante concurrencia:** al aceptar una oferta se reclama condicionalmente (`WHERE status = 'PENDING'`) y se persiste una transacción con `idempotencyKey` único en `transactions` más su auditoría en `transfer_history`. Una doble aceptación concurrente responde `409 Conflict` sin duplicar movimientos ni efectivo.
- **Reparación automática de alineaciones abiertas:** si un jugador traspasado figuraba como titular en jornadas aún no bloqueadas, `transfer-engine.ts` repara el _slot_ correspondiente con un sustituto válido de esa posición.
