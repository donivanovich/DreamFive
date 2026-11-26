import { randomInt, randomUUID } from 'node:crypto';

import {
  DEFAULT_LEAGUE_TIME_ZONE,
  LEAGUE_RULES,
  type MarketMode,
  type Position,
  PROVISIONAL_GAME_CONFIG,
} from '@dream5/shared';
import {
  generateDoubleRoundRobinFixtures,
  generateInitialUniverseCatalog,
  getDaysInCalendarMonth,
  INITIAL_TEAMS,
  LEGACY_TEAM_CODES_IN_SLOT_ORDER,
  resolveZonedDateIso,
} from '@dream5/simulation-engine';

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';

const SPANISH_MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

export function resolveLeagueTimeZone(): string {
  const envTz = process.env['TZ']?.trim();
  return envTz && envTz.length > 0 ? envTz : DEFAULT_LEAGUE_TIME_ZONE;
}

export function formatSpanishSeasonName(seasonNumber: number, year: number, month: number): string {
  const monthLabel = SPANISH_MONTH_NAMES[month - 1] ?? `Mes ${String(month)}`;
  return `Temporada ${String(seasonNumber)} — ${monthLabel} ${String(year)}`;
}

/**
 * Inserta o actualiza de forma idempotente el catálogo global inicial de 30 equipos y 540 jugadores ficticios.
 */
export async function ensureCatalogSeeded(prisma: PrismaClient): Promise<void> {
  const existingTeams = await prisma.team.findMany({ orderBy: { id: 'asc' } });
  const existingPlayers = await prisma.player.count();
  if (existingTeams.length === LEAGUE_RULES.totalTeams && existingPlayers === 540) {
    const teamByCode = new Map(existingTeams.map((t) => [t.code, t]));
    const alreadySynced = INITIAL_TEAMS.every((tpl) => {
      const row = teamByCode.get(tpl.code);
      return (
        row?.name === tpl.name &&
        row.shortName === tpl.shortName &&
        row.city === tpl.city &&
        row.conference === tpl.conference &&
        row.primaryColor === tpl.primaryColor
      );
    });
    if (alreadySynced) {
      return;
    }

    const legacyToBlueprint = new Map<string, (typeof INITIAL_TEAMS)[number]>();
    for (let i = 0; i < INITIAL_TEAMS.length; i += 1) {
      const legacyCode = LEGACY_TEAM_CODES_IN_SLOT_ORDER[i];
      const targetBlueprint = INITIAL_TEAMS[i];
      if (legacyCode && targetBlueprint) {
        legacyToBlueprint.set(legacyCode, targetBlueprint);
      }
    }

    await prisma.$transaction(async (tx) => {
      const matchedPairs: {
        readonly teamId: string;
        readonly blueprint: (typeof INITIAL_TEAMS)[number];
      }[] = [];
      const matchedTeamIds = new Set<string>();

      for (const existing of existingTeams) {
        const directMatch = INITIAL_TEAMS.find((tpl) => tpl.code === existing.code);
        const mapped = legacyToBlueprint.get(existing.code) ?? directMatch;
        if (mapped) {
          matchedPairs.push({ teamId: existing.id, blueprint: mapped });
          matchedTeamIds.add(existing.id);
        }
      }

      if (matchedPairs.length < INITIAL_TEAMS.length) {
        const unmatchedTeams = existingTeams.filter((t) => !matchedTeamIds.has(t.id));
        const usedTargetCodes = new Set(matchedPairs.map((p) => p.blueprint.code));
        const remainingTargets = INITIAL_TEAMS.filter((t) => !usedTargetCodes.has(t.code));
        for (let i = 0; i < unmatchedTeams.length && i < remainingTargets.length; i += 1) {
          const team = unmatchedTeams[i];
          const blueprint = remainingTargets[i];
          if (team && blueprint) {
            matchedPairs.push({ teamId: team.id, blueprint });
          }
        }
      }

      // Fase 1: Códigos temporales únicos para evitar colisiones si algún código coincide (p. ej. IND)
      for (let i = 0; i < matchedPairs.length; i += 1) {
        const pair = matchedPairs[i];
        if (!pair) {
          continue;
        }
        const tempCode = `_${String(i).padStart(2, '0')}`;
        await tx.team.update({
          where: { id: pair.teamId },
          data: { code: tempCode },
        });
        await tx.leagueTeam.updateMany({
          where: { templateTeamId: pair.teamId },
          data: { code: tempCode },
        });
      }

      // Fase 2: Asignar códigos, nombres y colores definitivos en catálogo y ligas activas
      for (const pair of matchedPairs) {
        await tx.team.update({
          where: { id: pair.teamId },
          data: {
            code: pair.blueprint.code,
            city: pair.blueprint.city,
            name: pair.blueprint.name,
            shortName: pair.blueprint.shortName,
            conference: pair.blueprint.conference,
            primaryColor: pair.blueprint.primaryColor,
          },
        });
        await tx.leagueTeam.updateMany({
          where: { templateTeamId: pair.teamId },
          data: {
            code: pair.blueprint.code,
            name: pair.blueprint.name,
            shortName: pair.blueprint.shortName,
          },
        });
      }
    });
    return;
  }

  const catalog = generateInitialUniverseCatalog('dream5-catalog-v1');

  await prisma.$transaction(async (tx) => {
    const teamIdByCode = new Map<string, string>();
    for (const blueprint of catalog.teams) {
      const savedTeam = await tx.team.upsert({
        where: { code: blueprint.code },
        update: {
          city: blueprint.city,
          name: blueprint.name,
          shortName: blueprint.shortName,
          conference: blueprint.conference,
          primaryColor: blueprint.primaryColor,
        },
        create: {
          code: blueprint.code,
          city: blueprint.city,
          name: blueprint.name,
          shortName: blueprint.shortName,
          conference: blueprint.conference,
          primaryColor: blueprint.primaryColor,
        },
      });
      teamIdByCode.set(blueprint.code, savedTeam.id);
    }

    for (const p of catalog.players) {
      const templateTeamId = teamIdByCode.get(p.templateTeamCode);
      if (!templateTeamId) {
        throw new Error(`Equipo plantilla no encontrado para código ${p.templateTeamCode}`);
      }

      await tx.player.upsert({
        where: { slug: p.slug },
        update: {
          firstName: p.firstName,
          lastName: p.lastName,
          fullName: p.fullName,
          initials: p.initials,
          position: p.position,
          initialRole: p.initialRole,
          age: p.age,
          basePriceMillions: p.basePriceMillions,
          overallRating: p.overallRating,
          offense: p.offense,
          defense: p.defense,
          playmaking: p.playmaking,
          rebounding: p.rebounding,
          athleticism: p.athleticism,
          iq: p.iq,
          templateTeamId,
        },
        create: {
          slug: p.slug,
          firstName: p.firstName,
          lastName: p.lastName,
          fullName: p.fullName,
          initials: p.initials,
          position: p.position,
          initialRole: p.initialRole,
          age: p.age,
          basePriceMillions: p.basePriceMillions,
          overallRating: p.overallRating,
          offense: p.offense,
          defense: p.defense,
          playmaking: p.playmaking,
          rebounding: p.rebounding,
          athleticism: p.athleticism,
          iq: p.iq,
          templateTeamId,
        },
      });
    }
  });
}

export interface LineupCandidatePlayer {
  readonly id: string;
  readonly position: Position;
  readonly overallRating: number;
  readonly status: string;
}

export interface SelectedLineupIds {
  readonly pgPlayerId: string;
  readonly sgPlayerId: string;
  readonly sfPlayerId: string;
  readonly pfPlayerId: string;
  readonly cPlayerId: string;
}

/**
 * Selecciona 5 titulares válidos (1 por posición) dando prioridad a jugadores disponibles
 * y mejor media general.
 */
export function pickDefaultLineupForTeam(
  roster: readonly LineupCandidatePlayer[],
): SelectedLineupIds {
  const selectForPosition = (pos: Position): string => {
    const candidates = roster
      .filter((player) => player.position === pos)
      .sort((a, b) => {
        const aHealthy = a.status !== 'INJURED' && a.status !== 'SUSPENDED' ? 1 : 0;
        const bHealthy = b.status !== 'INJURED' && b.status !== 'SUSPENDED' ? 1 : 0;
        if (bHealthy !== aHealthy) {
          return bHealthy - aHealthy;
        }
        return b.overallRating - a.overallRating;
      });
    const chosen = candidates[0];
    if (!chosen) {
      throw new Error(`La plantilla carece de jugadores en la posición ${pos}`);
    }
    return chosen.id;
  };

  return {
    pgPlayerId: selectForPosition('PG'),
    sgPlayerId: selectForPosition('SG'),
    sfPlayerId: selectForPosition('SF'),
    pfPlayerId: selectForPosition('PF'),
    cPlayerId: selectForPosition('C'),
  };
}

export interface InstantiateLeagueParams {
  readonly name: string;
  readonly presidentUserId: string;
  readonly marketMode?: MarketMode;
  readonly calendarYear?: number;
  readonly calendarMonth?: number;
  readonly simulationSeed?: string;
  readonly forcedPresidentTeamCode?: string;
}

export interface InstantiatedLeagueResult {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly assignedTeamId: string;
  readonly assignedTeamCode: string;
}

/**
 * Crea una liga completamente aislada dentro de una transacción Prisma:
 * 30 equipos propios, 540 instancias de jugador propias, plantilla asignada al azar al presidente,
 * temporada #1 de 58 jornadas (870 partidos) y clasificaciones iniciales.
 */
export async function instantiateLeagueInTx(
  tx: Prisma.TransactionClient,
  params: InstantiateLeagueParams,
): Promise<InstantiatedLeagueResult> {
  const templateTeams = await tx.team.findMany({ orderBy: { code: 'asc' } });
  const templatePlayers = await tx.player.findMany({ orderBy: { slug: 'asc' } });

  if (templateTeams.length !== LEAGUE_RULES.totalTeams || templatePlayers.length !== 540) {
    throw new Error(
      `El catálogo base es incompleto (${String(templateTeams.length)} equipos, ${String(templatePlayers.length)} jugadores). Ejecuta db:seed.`,
    );
  }

  const now = new Date();
  const timeZone = resolveLeagueTimeZone();
  const calendarYear = params.calendarYear ?? now.getFullYear();
  const calendarMonth = params.calendarMonth ?? now.getMonth() + 1;
  const daysInMonth = getDaysInCalendarMonth(calendarYear, calendarMonth);
  const simulationSeed = params.simulationSeed ?? `league-${randomUUID()}`;
  const leagueId = randomUUID();
  const seasonId = randomUUID();
  const initialClock = new Date(
    resolveZonedDateIso({
      year: calendarYear,
      month: calendarMonth,
      dayOfMonth: 1,
      hour: 7,
      minute: 30,
      timeZone,
    }),
  );

  await tx.league.create({
    data: {
      id: leagueId,
      name: params.name,
      presidentUserId: params.presidentUserId,
      status: 'ACTIVE',
      maxParticipants: LEAGUE_RULES.maxParticipants,
      marketMode: params.marketMode ?? 'LEAGUE_ISOLATED',
      gameClockAt: initialClock,
      simulationSeed,
      scoringConfigJson: PROVISIONAL_GAME_CONFIG.scoringWeights,
      marketScale: 3,
    },
  });

  await tx.season.create({
    data: {
      id: seasonId,
      leagueId,
      seasonNumber: 1,
      name: formatSpanishSeasonName(1, calendarYear, calendarMonth),
      calendarYear,
      calendarMonth,
      daysInMonth,
      totalRounds: LEAGUE_RULES.seasonTotalRounds,
      currentRoundNumber: 0,
      status: 'ACTIVE',
      startedAt: initialClock,
    },
  });

  const forcedIndex = params.forcedPresidentTeamCode
    ? templateTeams.findIndex((t) => t.code === params.forcedPresidentTeamCode)
    : -1;
  const assignedIndex = forcedIndex >= 0 ? forcedIndex : randomInt(0, templateTeams.length);

  const leagueTeamIdByTemplateId = new Map<string, string>();
  const createdTeamIds: string[] = [];
  let assignedTeamId = '';
  let assignedTeamCode = '';

  const teamRows: Prisma.LeagueTeamCreateManyInput[] = templateTeams.map((tpl, index) => {
    const teamId = randomUUID();
    const isCreatorTeam = index === assignedIndex;
    leagueTeamIdByTemplateId.set(tpl.id, teamId);
    createdTeamIds.push(teamId);
    if (isCreatorTeam) {
      assignedTeamId = teamId;
      assignedTeamCode = tpl.code;
    }

    return {
      id: teamId,
      leagueId,
      templateTeamId: tpl.id,
      name: tpl.name,
      shortName: tpl.shortName,
      code: tpl.code,
      budgetMillions: PROVISIONAL_GAME_CONFIG.economyAndMarket.initialTeamBudgetMillions,
      isCpuControlled: !isCreatorTeam,
      totalFantasyPoints: 0,
      wins: 0,
      losses: 0,
      rank: index + 1,
    };
  });

  await tx.leagueTeam.createMany({ data: teamRows });

  await tx.leagueMember.create({
    data: {
      leagueId,
      userId: params.presidentUserId,
      leagueTeamId: assignedTeamId,
      role: 'PRESIDENT',
    },
  });

  const playerInstanceRows: Prisma.PlayerInstanceCreateManyInput[] = [];
  const rosterSlotRows: Prisma.RosterSlotCreateManyInput[] = [];
  const creatorRoster: LineupCandidatePlayer[] = [];

  for (const tplPlayer of templatePlayers) {
    const teamId = leagueTeamIdByTemplateId.get(tplPlayer.templateTeamId);
    if (!teamId) {
      throw new Error(`Falta equipo en liga para jugador ${tplPlayer.slug}`);
    }
    const playerInstanceId = randomUUID();
    playerInstanceRows.push({
      id: playerInstanceId,
      leagueId,
      templatePlayerId: tplPlayer.id,
      currentTeamId: teamId,
      name: tplPlayer.fullName,
      initials: tplPlayer.initials,
      position: tplPlayer.position,
      role: tplPlayer.initialRole,
      age: tplPlayer.age,
      priceMillions: tplPlayer.basePriceMillions,
      priceDeltaMillions: 0,
      status: 'HEALTHY',
      gamesOutRemaining: 0,
      overallRating: tplPlayer.overallRating,
      offense: tplPlayer.offense,
      defense: tplPlayer.defense,
      playmaking: tplPlayer.playmaking,
      rebounding: tplPlayer.rebounding,
      athleticism: tplPlayer.athleticism,
      iq: tplPlayer.iq,
    });

    rosterSlotRows.push({
      leagueId,
      leagueTeamId: teamId,
      playerInstanceId,
    });

    if (teamId === assignedTeamId) {
      creatorRoster.push({
        id: playerInstanceId,
        position: tplPlayer.position,
        overallRating: tplPlayer.overallRating,
        status: 'HEALTHY',
      });
    }
  }

  await tx.playerInstance.createMany({ data: playerInstanceRows });
  await tx.rosterSlot.createMany({ data: rosterSlotRows });

  const standingRows: Prisma.StandingCreateManyInput[] = createdTeamIds.map((teamId, idx) => ({
    leagueId,
    seasonId,
    leagueTeamId: teamId,
    rank: idx + 1,
    fantasyPoints: 0,
    lastRoundFp: 0,
    avgFp: 0,
    wins: 0,
    losses: 0,
    lastFiveResults: [],
  }));
  await tx.standing.createMany({ data: standingRows });

  const fixtures = generateDoubleRoundRobinFixtures({
    teamIds: createdTeamIds,
    year: calendarYear,
    month: calendarMonth,
    startHour: LEAGUE_RULES.dailyWindowStartHour,
    endHour: LEAGUE_RULES.dailyWindowEndHour,
    timeZone,
  });

  const matchRows: Prisma.MatchCreateManyInput[] = fixtures.map((f) => ({
    leagueId,
    seasonId,
    roundNumber: f.roundNumber,
    scheduledAt: new Date(f.scheduledAtIso),
    status: 'SCHEDULED',
    homeTeamId: f.homeTeamId,
    awayTeamId: f.awayTeamId,
    seed: `${simulationSeed}:s1:r${String(f.roundNumber)}:m${String(f.matchIndexInRound)}`,
  }));
  await tx.match.createMany({ data: matchRows });

  const initialLineup = pickDefaultLineupForTeam(creatorRoster);
  await tx.lineup.create({
    data: {
      leagueId,
      seasonId,
      leagueTeamId: assignedTeamId,
      roundNumber: 1,
      pgPlayerId: initialLineup.pgPlayerId,
      sgPlayerId: initialLineup.sgPlayerId,
      sfPlayerId: initialLineup.sfPlayerId,
      pfPlayerId: initialLineup.pfPlayerId,
      cPlayerId: initialLineup.cPlayerId,
      isLocked: false,
    },
  });

  return {
    leagueId,
    seasonId,
    assignedTeamId,
    assignedTeamCode,
  };
}

export async function instantiateLeague(
  prisma: PrismaClient,
  params: InstantiateLeagueParams,
): Promise<InstantiatedLeagueResult> {
  await ensureCatalogSeeded(prisma);
  return prisma.$transaction(async (tx) => instantiateLeagueInTx(tx, params), {
    timeout: 30000,
    maxWait: 10000,
  });
}

export interface JoinLeagueResult {
  readonly leagueTeamId: string;
  readonly teamName: string;
  readonly teamCode: string;
  readonly inheritedPoints: number;
  readonly inheritedRank: number;
}

/**
 * Incorpora un usuario a una liga asignándole al azar uno de los equipos CPU disponibles
 * y heredando automáticamente su plantilla, presupuesto y puntos acumulados.
 */
export async function joinLeagueWithRandomTeamInTx(
  tx: Prisma.TransactionClient,
  params: {
    readonly leagueId: string;
    readonly userId: string;
    readonly role?: 'PRESIDENT' | 'MEMBER';
  },
): Promise<JoinLeagueResult> {
  const league = await tx.league.findUnique({ where: { id: params.leagueId } });
  if (!league) {
    throw new Error('Liga no encontrada.');
  }

  const existingMember = await tx.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId: params.leagueId, userId: params.userId } },
  });
  if (existingMember) {
    throw new Error('Ya eres participante de esta liga.');
  }

  const currentMembersCount = await tx.leagueMember.count({
    where: { leagueId: params.leagueId },
  });
  if (currentMembersCount >= league.maxParticipants) {
    throw new Error('La liga ha alcanzado el máximo de 30 participantes.');
  }

  const availableCpuTeams = await tx.leagueTeam.findMany({
    where: {
      leagueId: params.leagueId,
      isCpuControlled: true,
      member: null,
    },
    orderBy: { code: 'asc' },
  });

  if (availableCpuTeams.length === 0) {
    throw new Error('No quedan equipos disponibles en esta liga.');
  }

  const pickedTeam = availableCpuTeams[randomInt(0, availableCpuTeams.length)];
  if (!pickedTeam) {
    throw new Error('No se pudo asignar un equipo disponible.');
  }

  await tx.leagueTeam.update({
    where: { id: pickedTeam.id },
    data: { isCpuControlled: false },
  });

  await tx.leagueMember.create({
    data: {
      leagueId: params.leagueId,
      userId: params.userId,
      leagueTeamId: pickedTeam.id,
      role: params.role ?? 'MEMBER',
    },
  });

  const activeSeason = await tx.season.findFirst({
    where: { leagueId: params.leagueId, status: 'ACTIVE' },
    orderBy: { seasonNumber: 'desc' },
  });
  if (activeSeason) {
    const nextRound = Math.min(activeSeason.totalRounds, activeSeason.currentRoundNumber + 1);
    const existingLineup = await tx.lineup.findUnique({
      where: {
        leagueId_seasonId_leagueTeamId_roundNumber: {
          leagueId: params.leagueId,
          seasonId: activeSeason.id,
          leagueTeamId: pickedTeam.id,
          roundNumber: nextRound,
        },
      },
    });
    if (!existingLineup) {
      const teamPlayers = await tx.playerInstance.findMany({
        where: { leagueId: params.leagueId, currentTeamId: pickedTeam.id, isRetired: false },
      });
      if (teamPlayers.length >= 5) {
        const pickedLineup = pickDefaultLineupForTeam(
          teamPlayers.map((p) => ({
            id: p.id,
            position: p.position,
            overallRating: p.overallRating,
            status: p.status,
          })),
        );
        await tx.lineup.create({
          data: {
            leagueId: params.leagueId,
            seasonId: activeSeason.id,
            leagueTeamId: pickedTeam.id,
            roundNumber: nextRound,
            pgPlayerId: pickedLineup.pgPlayerId,
            sgPlayerId: pickedLineup.sgPlayerId,
            sfPlayerId: pickedLineup.sfPlayerId,
            pfPlayerId: pickedLineup.pfPlayerId,
            cPlayerId: pickedLineup.cPlayerId,
            isLocked: false,
          },
        });
      }
    }
  }

  return {
    leagueTeamId: pickedTeam.id,
    teamName: pickedTeam.name,
    teamCode: pickedTeam.code,
    inheritedPoints: pickedTeam.totalFantasyPoints,
    inheritedRank: pickedTeam.rank,
  };
}
