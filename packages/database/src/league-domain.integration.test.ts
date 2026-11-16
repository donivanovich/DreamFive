import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import {
  advanceSeasonForLeague,
  createAndEvaluateTransferOffer,
  createPrismaClient,
  ensureCatalogSeeded,
  executeAcceptedTransferInTx,
  hashPassword,
  instantiateLeague,
  joinLeagueWithRandomTeamInTx,
  pickDefaultLineupForTeam,
  type PrismaClient,
  repriceLeagueMarket,
  simulateRoundForLeague,
  TransferValidationError,
} from './index.js';

const rootEnvFile = resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const databaseUrl = process.env['DATABASE_URL'];
const describeIfDb = databaseUrl ? describe : describe.skip;

describeIfDb(
  'Dominio multi-liga DREAM5 en PostgreSQL (aislamiento, alineación, traspasos y temporada)',
  () => {
    let prisma: PrismaClient;
    const createdLeagueIds: string[] = [];
    const createdUserIds: string[] = [];

    beforeAll(async () => {
      prisma = createPrismaClient({ connectionString: databaseUrl ?? '' });
      await ensureCatalogSeeded(prisma);
    }, 60_000);

    afterAll(async () => {
      if (createdLeagueIds.length > 0) {
        await prisma.league.deleteMany({ where: { id: { in: createdLeagueIds } } });
      }
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
      await prisma.$disconnect();
    }, 30_000);

    async function createTestUser(
      suffix: string,
    ): Promise<{ readonly id: string; readonly tag: string }> {
      const email = `it-domain-${suffix}-${String(Date.now())}@dream5.local`;
      const tag = `#D5-${String(Math.floor(1000 + Math.random() * 8999))}`;
      const user = await prisma.user.create({
        data: {
          email,
          emailVerifiedAt: new Date(),
          passwordHash: await hashPassword('Dream5Test!2026'),
          role: 'USER',
          profile: {
            create: {
              username: `Manager ${suffix}`,
              tag,
              initials: suffix.slice(0, 2).toUpperCase(),
              preferencesJson: {
                tradeAlerts: true,
                injuryAlerts: true,
                lineupReminder: true,
                compactTables: false,
                themeMode: 'dark',
                accentColor: 'orange',
                language: 'en',
              },
            },
          },
        },
      });
      createdUserIds.push(user.id);
      return { id: user.id, tag };
    }

    it('crea ligas aisladas con 30 equipos, 540 jugadores, 58 jornadas y limita 1 presidencia activa por usuario', async () => {
      const presidentA = await createTestUser('PA');
      const presidentB = await createTestUser('PB');

      const leagueA = await instantiateLeague(prisma, {
        name: `IT Liga A ${String(Date.now())}`,
        presidentUserId: presidentA.id,
        simulationSeed: 'it-seed-a',
      });
      createdLeagueIds.push(leagueA.leagueId);

      const leagueB = await instantiateLeague(prisma, {
        name: `IT Liga B ${String(Date.now())}`,
        presidentUserId: presidentB.id,
        simulationSeed: 'it-seed-b',
      });
      createdLeagueIds.push(leagueB.leagueId);

      // Segundo intento de presidencia activa para presidentA debe fallar en índice único parcial
      await expect(
        instantiateLeague(prisma, {
          name: `IT Liga A Duplicada ${String(Date.now())}`,
          presidentUserId: presidentA.id,
        }),
      ).rejects.toThrow();

      const teamsA = await prisma.leagueTeam.count({ where: { leagueId: leagueA.leagueId } });
      const playersA = await prisma.playerInstance.count({ where: { leagueId: leagueA.leagueId } });
      const matchesA = await prisma.match.count({ where: { leagueId: leagueA.leagueId } });

      expect(teamsA).toBe(30);
      expect(playersA).toBe(540);
      expect(matchesA).toBe(58 * 15);
    }, 60_000);

    it('solo los 5 titulares suman FantasyScore, respeta aislamiento estricto y hereda puntos al unirse tarde', async () => {
      const presA = await createTestUser('SA');
      const presB = await createTestUser('SB');
      const lateJoiner = await createTestUser('LJ');

      const leagueA = await instantiateLeague(prisma, {
        name: `IT Sim A ${String(Date.now())}`,
        presidentUserId: presA.id,
        simulationSeed: 'it-sim-a',
      });
      createdLeagueIds.push(leagueA.leagueId);

      const leagueB = await instantiateLeague(prisma, {
        name: `IT Sim B ${String(Date.now())}`,
        presidentUserId: presB.id,
        simulationSeed: 'it-sim-b',
      });
      createdLeagueIds.push(leagueB.leagueId);

      const pricesBeforeB = await prisma.playerInstance.findMany({
        where: { leagueId: leagueB.leagueId },
        select: { id: true, priceMillions: true, currentTeamId: true, seasonGamesPlayed: true },
        orderBy: { id: 'asc' },
      });

      const round1Result = await simulateRoundForLeague(prisma, {
        leagueId: leagueA.leagueId,
        roundNumber: 1,
      });
      expect(round1Result.matchesSimulated).toBe(15);

      // Recalculo de mercado automático al cerrar la jornada
      const autoMarketCount = await prisma.marketHistory.count({
        where: { leagueId: leagueA.leagueId },
      });
      expect(autoMarketCount).toBeGreaterThan(0);

      // Verificar premio por victoria (FP jornada del ganador x 1.000 créditos) sin duplicar
      const sampleMatch = await prisma.match.findFirst({
        where: { leagueId: leagueA.leagueId, roundNumber: 1, status: 'FINAL' },
      });
      if (!sampleMatch) {
        throw new Error('No se encontró ningún partido finalizado en la jornada 1.');
      }
      const winnerTeamId =
        (sampleMatch.homeScore ?? 0) >= (sampleMatch.awayScore ?? 0)
          ? sampleMatch.homeTeamId
          : sampleMatch.awayTeamId;
      const loserTeamId =
        winnerTeamId === sampleMatch.homeTeamId ? sampleMatch.awayTeamId : sampleMatch.homeTeamId;
      const [winnerScore, winnerTeam, loserTeam] = await Promise.all([
        prisma.fantasyScore.findFirst({
          where: { leagueId: leagueA.leagueId, roundNumber: 1, leagueTeamId: winnerTeamId },
        }),
        prisma.leagueTeam.findUnique({ where: { id: winnerTeamId } }),
        prisma.leagueTeam.findUnique({ where: { id: loserTeamId } }),
      ]);
      const expectedWinMillions = Math.round(((winnerScore?.totalFp ?? 0) * 1000) / 100) / 10_000;
      expect(sampleMatch.winRewardPaid).toBe(true);
      expect(sampleMatch.winRewardMillions ?? 0).toBeCloseTo(expectedWinMillions, 4);
      expect(winnerTeam?.budgetMillions ?? 0).toBeCloseTo(25 + expectedWinMillions, 4);
      expect(loserTeam?.budgetMillions ?? 0).toBeCloseTo(25, 4);

      await repriceLeagueMarket(prisma, {
        leagueId: leagueA.leagueId,
        reason: 'Recalculo post jornada 1 test',
      });

      // Verificar que FantasyScore del equipo presidente coincide EXACTAMENTE con suma de sus 5 titulares
      const presLineup = await prisma.lineup.findFirst({
        where: {
          leagueId: leagueA.leagueId,
          seasonId: leagueA.seasonId,
          leagueTeamId: leagueA.assignedTeamId,
          roundNumber: 1,
        },
      });
      expect(presLineup).not.toBeNull();

      const starterIds = [
        presLineup?.pgPlayerId,
        presLineup?.sgPlayerId,
        presLineup?.sfPlayerId,
        presLineup?.pfPlayerId,
        presLineup?.cPlayerId,
      ].filter((id): id is string => typeof id === 'string');
      expect(starterIds).toHaveLength(5);

      const starterMatchStats = await prisma.playerMatchStat.findMany({
        where: {
          leagueId: leagueA.leagueId,
          seasonId: leagueA.seasonId,
          roundNumber: 1,
          playerInstanceId: { in: starterIds },
        },
      });
      const expectedFpSum =
        Math.round(starterMatchStats.reduce((sum, s) => sum + s.fantasyPoints, 0) * 10) / 10;

      const presFantasyScore = await prisma.fantasyScore.findFirst({
        where: {
          leagueId: leagueA.leagueId,
          seasonId: leagueA.seasonId,
          roundNumber: 1,
          leagueTeamId: leagueA.assignedTeamId,
        },
      });
      expect(presFantasyScore).not.toBeNull();
      expect(Math.abs((presFantasyScore?.totalFp ?? -1) - expectedFpSum)).toBeLessThanOrEqual(0.2);

      // Liga B sigue completamente intacta tras simular y recalcular Liga A
      const seasonB = await prisma.season.findUnique({ where: { id: leagueB.seasonId } });
      expect(seasonB?.currentRoundNumber).toBe(0);
      const pricesAfterB = await prisma.playerInstance.findMany({
        where: { leagueId: leagueB.leagueId },
        select: { id: true, priceMillions: true, currentTeamId: true, seasonGamesPlayed: true },
        orderBy: { id: 'asc' },
      });
      expect(pricesAfterB).toEqual(pricesBeforeB);

      // Un usuario que acepta invitación tras haberse jugado J1 hereda los puntos acumulados del equipo CPU
      const joinResult = await prisma.$transaction((tx) =>
        joinLeagueWithRandomTeamInTx(tx, {
          leagueId: leagueA.leagueId,
          userId: lateJoiner.id,
        }),
      );
      const assignedStanding = await prisma.standing.findUnique({
        where: {
          leagueId_seasonId_leagueTeamId: {
            leagueId: leagueA.leagueId,
            seasonId: leagueA.seasonId,
            leagueTeamId: joinResult.leagueTeamId,
          },
        },
      });
      expect(assignedStanding).not.toBeNull();
      expect(assignedStanding?.fantasyPoints).toBeGreaterThan(0);
    }, 60_000);

    it('aplica traspasos ACID con 18 jugadores, 5 posiciones, >=50% valor, idempotencia y cambio de temporada', async () => {
      const pres = await createTestUser('TR');
      const otherMember = await createTestUser('TM');

      const league = await instantiateLeague(prisma, {
        name: `IT Traspasos ${String(Date.now())}`,
        presidentUserId: pres.id,
        simulationSeed: 'it-trades',
      });
      createdLeagueIds.push(league.leagueId);

      // Añadir segundo usuario humano para probar también oferta humana -> humana e idempotencia
      const secondJoin = await prisma.$transaction((tx) =>
        joinLeagueWithRandomTeamInTx(tx, {
          leagueId: league.leagueId,
          userId: otherMember.id,
        }),
      );

      const presRoster = await prisma.playerInstance.findMany({
        where: { leagueId: league.leagueId, currentTeamId: league.assignedTeamId },
        orderBy: { priceMillions: 'asc' },
      });
      const secondRoster = await prisma.playerInstance.findMany({
        where: { leagueId: league.leagueId, currentTeamId: secondJoin.leagueTeamId },
        orderBy: { priceMillions: 'desc' },
      });

      const cheapestOut = presRoster[0];
      const topStarIn = secondRoster[0];
      if (!cheapestOut || !topStarIn) {
        throw new Error('Plantillas vacías inesperadas en test');
      }

      // 1) Rechaza oferta por debajo del 50% si topStarIn vale más del doble que cheapestOut
      if (cheapestOut.priceMillions < topStarIn.priceMillions * 0.5) {
        await expect(
          createAndEvaluateTransferOffer(prisma, {
            leagueId: league.leagueId,
            userId: pres.id,
            receivingTeamId: secondJoin.leagueTeamId,
            offeredPlayerIds: [cheapestOut.id],
            requestedPlayerIds: [topStarIn.id],
            cashOfferedMillions: 0,
            cashRequestedMillions: 0,
          }),
        ).rejects.toBeInstanceOf(TransferValidationError);
      }

      // 2) Rechaza romper la plantilla de 18 jugadores (2 por 1 sin equilibrio numérico)
      const secondP = presRoster[1];
      const reqLow = secondRoster.at(-1);
      if (!secondP || !reqLow) {
        throw new Error('Jugadores insuficientes');
      }
      await expect(
        createAndEvaluateTransferOffer(prisma, {
          leagueId: league.leagueId,
          userId: pres.id,
          receivingTeamId: secondJoin.leagueTeamId,
          offeredPlayerIds: [cheapestOut.id, secondP.id],
          requestedPlayerIds: [reqLow.id],
          cashOfferedMillions: 0,
          cashRequestedMillions: 0,
        }),
      ).rejects.toBeInstanceOf(TransferValidationError);

      // 3) Ejecuta un traspaso válido equivalente (misma posición abundante para asegurar cobertura 5 posiciones)
      const presPgs = presRoster.filter((p) => p.position === 'PG');
      const secPgs = secondRoster.filter((p) => p.position === 'PG');
      const validOut = presPgs.at(-1);
      const validIn = secPgs.at(-1);
      if (!validOut || !validIn) {
        throw new Error('No se encontraron bases de prueba');
      }

      const cashTopUp =
        validOut.priceMillions < validIn.priceMillions
          ? Math.ceil(validIn.priceMillions - validOut.priceMillions)
          : 0;

      const createdOffer = await createAndEvaluateTransferOffer(prisma, {
        leagueId: league.leagueId,
        userId: pres.id,
        receivingTeamId: secondJoin.leagueTeamId,
        offeredPlayerIds: [validOut.id],
        requestedPlayerIds: [validIn.id],
        cashOfferedMillions: cashTopUp,
        cashRequestedMillions: 0,
      });
      expect(createdOffer.status).toBe('PENDING');

      // Aceptar por primera vez ejecuta atómicamente
      const idemKey = `it-idem-${String(Date.now())}`;
      await prisma.$transaction((tx) =>
        executeAcceptedTransferInTx(tx, {
          leagueId: league.leagueId,
          offerId: createdOffer.offerId,
          idempotencyKey: idemKey,
        }),
      );

      // Intentar aceptar dos veces con la misma oferta ya ACCEPTED lanza 409 sin duplicar movimientos
      await expect(
        prisma.$transaction((tx) =>
          executeAcceptedTransferInTx(tx, {
            leagueId: league.leagueId,
            offerId: createdOffer.offerId,
            idempotencyKey: `${idemKey}-dup`,
          }),
        ),
      ).rejects.toThrow();

      // Confirmar invariante de 18 jugadores + 5 posiciones en ambos equipos
      const afterPresRoster = await prisma.playerInstance.findMany({
        where: { leagueId: league.leagueId, currentTeamId: league.assignedTeamId },
      });
      const afterSecRoster = await prisma.playerInstance.findMany({
        where: { leagueId: league.leagueId, currentTeamId: secondJoin.leagueTeamId },
      });
      expect(afterPresRoster).toHaveLength(18);
      expect(afterSecRoster).toHaveLength(18);
      expect(afterPresRoster.some((p) => p.id === validIn.id)).toBe(true);
      expect(afterSecRoster.some((p) => p.id === validOut.id)).toBe(true);

      const lineupCheck = pickDefaultLineupForTeam(afterPresRoster);
      expect(lineupCheck.pgPlayerId).toBeTruthy();

      // 3b) Rechazo CPU bloquea 1 partido tanto al jugador propuesto como al deseado,
      // y un traspaso aceptado bloquea 5 partidos al jugador adquirido.
      const cpuTeam = await prisma.leagueTeam.findFirst({
        where: { leagueId: league.leagueId, isCpuControlled: true },
      });
      if (!cpuTeam) {
        throw new Error('No se encontró ningún equipo CPU disponible para el test.');
      }
      const cpuRoster = await prisma.playerInstance.findMany({
        where: { leagueId: league.leagueId, currentTeamId: cpuTeam.id },
        orderBy: { priceMillions: 'desc' },
      });
      let cooldownPair:
        | {
            readonly outPlayer: (typeof afterPresRoster)[number];
            readonly inPlayer: (typeof cpuRoster)[number];
          }
        | undefined;
      for (const reqCandidate of cpuRoster) {
        const matchOut = afterPresRoster.find(
          (p) =>
            p.position === reqCandidate.position &&
            p.priceMillions < reqCandidate.priceMillions * 0.85,
        );
        if (matchOut) {
          cooldownPair = { outPlayer: matchOut, inPlayer: reqCandidate };
          break;
        }
      }
      if (!cooldownPair) {
        throw new Error('No se encontró pareja de jugadores compatible para el test de rechazo.');
      }
      const { outPlayer, inPlayer } = cooldownPair;
      const otherCpuCandidate = cpuRoster.find((p) => p.id !== inPlayer.id);
      const otherPresCandidate = afterPresRoster.find((p) => p.id !== outPlayer.id);
      const lowballCash = Math.max(
        0,
        Math.round((inPlayer.priceMillions * 0.6 - outPlayer.priceMillions) * 10) / 10,
      );
      const rejectedCpu = await createAndEvaluateTransferOffer(prisma, {
        leagueId: league.leagueId,
        userId: pres.id,
        receivingTeamId: cpuTeam.id,
        offeredPlayerIds: [outPlayer.id],
        requestedPlayerIds: [inPlayer.id],
        cashOfferedMillions: lowballCash,
        cashRequestedMillions: 0,
      });
      expect(rejectedCpu.status).toBe('REJECTED');

      // Reintentar pedir al mismo jugador deseado antes de jugar 1 partido falla con 409
      await expect(
        createAndEvaluateTransferOffer(prisma, {
          leagueId: league.leagueId,
          userId: pres.id,
          receivingTeamId: cpuTeam.id,
          offeredPlayerIds: [outPlayer.id],
          requestedPlayerIds: [inPlayer.id],
          cashOfferedMillions: Math.max(
            0,
            Math.round((inPlayer.priceMillions - outPlayer.priceMillions) * 10) / 10,
          ),
          cashRequestedMillions: 0,
        }),
      ).rejects.toThrow(/1 partido/);

      // También queda bloqueado el jugador propuesto (offeredPlayerIds) para evitar abusos contra CPU
      if (otherCpuCandidate) {
        await expect(
          createAndEvaluateTransferOffer(prisma, {
            leagueId: league.leagueId,
            userId: pres.id,
            receivingTeamId: cpuTeam.id,
            offeredPlayerIds: [outPlayer.id],
            requestedPlayerIds: [otherCpuCandidate.id],
            cashOfferedMillions: 20,
            cashRequestedMillions: 0,
          }),
        ).rejects.toThrow(/1 partido/);
      }

      // Simular 1 jornada desbloquea tanto al jugador propuesto como al deseado
      await simulateRoundForLeague(prisma, { leagueId: league.leagueId, roundNumber: 1 });
      const [freshOut, freshIn] = await Promise.all([
        prisma.playerInstance.findUniqueOrThrow({ where: { id: outPlayer.id } }),
        prisma.playerInstance.findUniqueOrThrow({ where: { id: inPlayer.id } }),
      ]);
      const acceptedAfterCooldown = await createAndEvaluateTransferOffer(prisma, {
        leagueId: league.leagueId,
        userId: pres.id,
        receivingTeamId: cpuTeam.id,
        offeredPlayerIds: [outPlayer.id],
        requestedPlayerIds: [inPlayer.id],
        cashOfferedMillions:
          Math.round(
            (Math.ceil(Math.max(0, freshIn.priceMillions - freshOut.priceMillions)) + 1.4) * 10,
          ) / 10,
        cashRequestedMillions: 0,
      });
      expect(acceptedAfterCooldown.status).toBe('ACCEPTED');

      // El jugador adquirido (inPlayer) queda bloqueado 5 partidos antes de poder volver a tradearlo
      if (otherCpuCandidate && otherPresCandidate) {
        await expect(
          createAndEvaluateTransferOffer(prisma, {
            leagueId: league.leagueId,
            userId: pres.id,
            receivingTeamId: cpuTeam.id,
            offeredPlayerIds: [inPlayer.id],
            requestedPlayerIds: [otherCpuCandidate.id],
            cashOfferedMillions: 10,
            cashRequestedMillions: 0,
          }),
        ).rejects.toThrow(/5 partidos/);

        // Tras simular 4 partidos más (faltando 1), sigue bloqueado
        for (const r of [2, 3, 4, 5]) {
          await simulateRoundForLeague(prisma, { leagueId: league.leagueId, roundNumber: r });
        }
        const cpuTargetR5 = await prisma.playerInstance.findFirstOrThrow({
          where: {
            leagueId: league.leagueId,
            currentTeamId: cpuTeam.id,
            position: inPlayer.position,
            id: { not: inPlayer.id },
          },
        });
        await expect(
          createAndEvaluateTransferOffer(prisma, {
            leagueId: league.leagueId,
            userId: pres.id,
            receivingTeamId: cpuTeam.id,
            offeredPlayerIds: [inPlayer.id],
            requestedPlayerIds: [cpuTargetR5.id],
            cashOfferedMillions: 10,
            cashRequestedMillions: 0,
          }),
        ).rejects.toThrow(/1 partido/);

        // Al completar el 5º partido desde la incorporación, se desbloquea
        await simulateRoundForLeague(prisma, { leagueId: league.leagueId, roundNumber: 6 });
        const cpuTargetR6 = await prisma.playerInstance.findFirstOrThrow({
          where: {
            leagueId: league.leagueId,
            currentTeamId: cpuTeam.id,
            position: inPlayer.position,
            id: { not: inPlayer.id },
          },
        });
        const reTradeResult = await createAndEvaluateTransferOffer(prisma, {
          leagueId: league.leagueId,
          userId: pres.id,
          receivingTeamId: cpuTeam.id,
          offeredPlayerIds: [inPlayer.id],
          requestedPlayerIds: [cpuTargetR6.id],
          cashOfferedMillions: 0,
          cashRequestedMillions: 0,
        });
        expect(['ACCEPTED', 'REJECTED']).toContain(reTradeResult.status);
      }

      // Verificar que las jornadas simuladas generaron traspasos autónomos CPU <-> CPU y ofertas CPU -> Usuario
      const [allHistoryCount, cpuToHumanPending, nonCpuAutonomousOffers] = await Promise.all([
        prisma.transferHistory.count({ where: { leagueId: league.leagueId } }),
        prisma.transferOffer.count({
          where: {
            leagueId: league.leagueId,
            proposedByUserId: null,
            status: 'PENDING',
          },
        }),
        prisma.transferOffer.count({
          where: {
            leagueId: league.leagueId,
            proposedByUserId: null,
            proposingTeam: { isCpuControlled: false },
          },
        }),
      ]);
      expect(allHistoryCount).toBeGreaterThanOrEqual(2);
      expect(cpuToHumanPending).toBeGreaterThanOrEqual(1);
      expect(nonCpuAutonomousOffers).toBe(0);

      // Verificamos que la jornada 1 generó correo de resultado en bandeja humana
      const season1MailCount = await prisma.leagueMail.count({
        where: { leagueId: league.leagueId, seasonId: league.seasonId },
      });
      expect(season1MailCount).toBeGreaterThanOrEqual(1);

      // Forzamos un veterano humano de edad >= 39 para comprobar envejecimiento (+1), retiro y reemplazo por rookie
      const veteran = await prisma.playerInstance.findFirstOrThrow({
        where: {
          leagueId: league.leagueId,
          currentTeamId: league.assignedTeamId,
          isRetired: false,
        },
        orderBy: { overallRating: 'asc' },
      });
      await prisma.playerInstance.update({
        where: { id: veteran.id },
        data: { age: 39 },
      });

      // Simulamos la jornada 58 (marcando las anteriores FINAL para cerrar la temporada) y comprobamos +1 de edad sin doble envejecimiento en rollover
      await prisma.match.updateMany({
        where: {
          leagueId: league.leagueId,
          seasonId: league.seasonId,
          roundNumber: { lt: 58 },
          status: 'SCHEDULED',
        },
        data: { status: 'FINAL', homeScore: 100, awayScore: 95, winRewardPaid: true },
      });
      await simulateRoundForLeague(prisma, { leagueId: league.leagueId, roundNumber: 58 });

      const sampleOtherPlayer = await prisma.playerInstance.findFirstOrThrow({
        where: { leagueId: league.leagueId, id: { not: veteran.id }, isRetired: false },
      });
      const expectedAgeAfterR58 = sampleOtherPlayer.age;

      const agedVeteran = await prisma.playerInstance.findUniqueOrThrow({
        where: { id: veteran.id },
      });
      expect(agedVeteran.age).toBe(40);

      // 4) Cambio de temporada: no vuelve a envejecer (+1 único), borra mails viejos, retira >=40, crea rookie y avisa en nueva temporada
      const rollover = await advanceSeasonForLeague(prisma, { leagueId: league.leagueId });
      expect(rollover.newSeasonNumber).toBe(2);

      const sampleAfterRollover = await prisma.playerInstance.findUniqueOrThrow({
        where: { id: sampleOtherPlayer.id },
      });
      expect(sampleAfterRollover.age).toBe(expectedAgeAfterR58);

      const retiredVeteran = await prisma.playerInstance.findUniqueOrThrow({
        where: { id: veteran.id },
      });
      expect(retiredVeteran.isRetired).toBe(true);
      expect(retiredVeteran.retiredSeasonNumber).toBe(1);

      const preservedPlayers = await prisma.playerInstance.count({
        where: { leagueId: league.leagueId, isRetired: false },
      });
      const humanActiveRosterCount = await prisma.playerInstance.count({
        where: {
          leagueId: league.leagueId,
          currentTeamId: league.assignedTeamId,
          isRetired: false,
        },
      });
      const replacementRookie = await prisma.playerInstance.findFirst({
        where: {
          leagueId: league.leagueId,
          currentTeamId: league.assignedTeamId,
          isRetired: false,
          templatePlayerId: null,
          role: 'ROOKIE',
        },
      });
      const season1RemainingMails = await prisma.leagueMail.count({
        where: { leagueId: league.leagueId, seasonId: league.seasonId },
      });
      const season2RetirementMails = await prisma.leagueMail.count({
        where: {
          leagueId: league.leagueId,
          seasonId: rollover.newSeasonId,
          leagueTeamId: league.assignedTeamId,
          category: 'RETIREMENT_REPLACEMENT',
        },
      });
      const preservedTransfers = await prisma.transferHistory.count({
        where: { leagueId: league.leagueId },
      });
      const season2Matches = await prisma.match.count({
        where: { leagueId: league.leagueId, seasonId: rollover.newSeasonId, status: 'SCHEDULED' },
      });

      expect(preservedPlayers).toBe(540);
      expect(humanActiveRosterCount).toBe(18);
      expect(replacementRookie).not.toBeNull();
      expect(replacementRookie?.position).toBe(veteran.position);
      expect(replacementRookie?.age).toBeGreaterThanOrEqual(19);
      expect(replacementRookie?.age).toBeLessThanOrEqual(21);
      expect(season1RemainingMails).toBe(0);
      expect(season2RetirementMails).toBeGreaterThanOrEqual(1);
      expect(preservedTransfers).toBeGreaterThanOrEqual(1);
      expect(season2Matches).toBe(58 * 15);
    }, 60_000);
  },
);
