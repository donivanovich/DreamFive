# Economía y mercado dinámico

Cada liga privada posee un mercado financiero propio que evoluciona en función del rendimiento real de los 540 jugadores **dentro de esa liga**, manteniendo su aislamiento total respecto al resto de ligas.

## Reglas económicas implementadas

1. **Valoración inicial y presupuesto de franquicia:**
   - Cada jugador parte del `basePriceMillions` definido en el catálogo base según su valoración global (`overallRating`) y rol inicial.
   - Al crearse una liga, los 30 equipos parten con el presupuesto inicial configurado en `PROVISIONAL_GAME_CONFIG.economyAndMarket.initialTeamBudgetMillions` (`25 M$`).
2. **Premio económico por partido ganado:**
   - Al finalizar cada encuentro de la liga, el club ganador recibe **`Dream Points de la jornada × 1.000` créditos** (`winRewardPerFantasyPoint: 1000`, equivalente a `roundDp * 0.001 M$`) sumados directamente a `LeagueTeam.budgetMillions`.
   - El abono se registra de forma idempotente en `Match.winRewardPaid` y `Match.winRewardMillions` para evitar duplicados aunque se recalcule la clasificación.
3. **Recálculo de precios (`recalculateMarketPrices` / `repriceLeagueMarket`):**
   - Al completarse cada jornada se ejecuta automáticamente `repriceLeagueMarketInTx` sobre la liga, además de los recalculos periódicos o manuales desde Simulación.
   - Se compara el rendimiento reciente de la última jornada y el promedio de temporada en la liga con la valoración actual, aplicando un factor de sensibilidad (`hourlyRepriceSensitivity: 0.06`).
   - El precio nunca baja de `minPlayerPriceMillions` (`0.5 M$`) ni supera `maxPlayerPriceMillions` (`45 M$`).
   - Cada variación significativa genera un registro trazable en `market_history` con `priceMillions`, `deltaMillions`, `reason` y marca temporal; variaciones neutras ponen a cero `priceDeltaMillions` para reflejar correctamente la última jornada.
4. **Consulta y auditoría económica:**
   - Desde la página **Mercado** (`/market`) o `GET /leagues/:leagueId/market` se visualizan las mayores revalorizaciones (_gainers_), depreciaciones (_fallers_), jugadores más cotizados y el historial reciente de variaciones.
   - Los movimientos en efectivo acordados en traspasos actualizan atómicamente `LeagueTeam.budgetMillions` de ambos clubes implicados.
