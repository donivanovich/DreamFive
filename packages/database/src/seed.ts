import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { UserAccountRole } from '@dreamfive/shared';

import {
  createPrismaClient,
  ensureCatalogSeeded,
  hashPassword,
  instantiateLeague,
  joinLeagueWithRandomTeamInTx,
  recalculateAndUpgradeExistingLeagues,
  rescheduleUpcomingLeagueMatches,
  simulateRoundForLeague,
} from './index.js';

const rootEnvFile = resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

interface DemoUserSeed {
  readonly email: string;
  readonly password: string;
  readonly role: UserAccountRole;
  readonly username: string;
  readonly tag: string;
  readonly initials: string;
}

const DEMO_USERS: readonly DemoUserSeed[] = [
  {
    email: 'ivan.k@dreamfive.local',
    password: 'DreamFiveDemo!2026',
    role: 'ADMIN',
    username: 'Iván Kovac',
    tag: '#D5-4821',
    initials: 'IK',
  },
  {
    email: 'maria.s@dreamfive.local',
    password: 'DreamFiveDemo!2026',
    role: 'USER',
    username: 'María Soler',
    tag: '#D5-7310',
    initials: 'MS',
  },
  {
    email: 'admin@dreamfive.local',
    password: 'DreamFiveAdmin!2026',
    role: 'USER',
    username: 'Admin DreamFive',
    tag: '#D5-0001',
    initials: 'AD',
  },
];

async function runSeed(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('Falta la variable DATABASE_URL para ejecutar el seed.');
  }

  const prisma = createPrismaClient({ connectionString: databaseUrl, maxConnections: 5 });

  try {
    process.stdout.write('[seed] Verificando catálogo de 30 equipos y 540 jugadores...\n');
    await ensureCatalogSeeded(prisma);

    const userIdByEmail = new Map<string, string>();
    for (const demo of DEMO_USERS) {
      const existing = await prisma.user.findUnique({
        where: { email: demo.email },
        include: { profile: true },
      });

      if (existing) {
        if (existing.role !== demo.role || !existing.emailVerifiedAt) {
          await prisma.user.update({
            where: { id: existing.id },
            data: {
              role: demo.role,
              emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
            },
          });
        }
        userIdByEmail.set(demo.email, existing.id);
        continue;
      }

      const passwordHash = await hashPassword(demo.password);
      const created = await prisma.user.create({
        data: {
          email: demo.email,
          emailVerifiedAt: new Date(),
          passwordHash,
          role: demo.role,
          profile: {
            create: {
              username: demo.username,
              tag: demo.tag,
              initials: demo.initials,
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
      userIdByEmail.set(demo.email, created.id);
    }

    const ivanId = userIdByEmail.get('ivan.k@dreamfive.local');
    const mariaId = userIdByEmail.get('maria.s@dreamfive.local');
    if (!ivanId || !mariaId) {
      throw new Error('No se pudieron resolver los usuarios demo principales.');
    }

    const existingDemoLeague = await prisma.league.findFirst({
      where: {
        name: 'Liga Mediterránea',
        presidentUserId: ivanId,
      },
    });

    if (!existingDemoLeague) {
      process.stdout.write('[seed] Creando liga demo "Liga Mediterránea" (58 jornadas)...\n');
      const createdLeague = await instantiateLeague(prisma, {
        name: 'Liga Mediterránea',
        presidentUserId: ivanId,
        marketMode: 'LEAGUE_ISOLATED',
        simulationSeed: 'dreamfive-demo-liga-mediterranea',
      });

      await prisma.$transaction(async (tx) =>
        joinLeagueWithRandomTeamInTx(tx, {
          leagueId: createdLeague.leagueId,
          userId: mariaId,
          role: 'MEMBER',
        }),
      );

      process.stdout.write(
        `[seed] Simulando jornada inaugural (Jornada 1) en liga demo ${createdLeague.leagueId}...\n`,
      );
      await simulateRoundForLeague(prisma, {
        leagueId: createdLeague.leagueId,
        roundNumber: 1,
      });
    }

    const upgraded = await recalculateAndUpgradeExistingLeagues(prisma);
    if (
      upgraded.recalculatedStatsCount > 0 ||
      upgraded.scaledMarketLeaguesCount > 0 ||
      upgraded.unlockedPlayersCount > 0 ||
      upgraded.clearedRejectedCooldownsCount > 0
    ) {
      process.stdout.write(
        `[seed] Actualización de ligas completada (stats recalculadas: ${String(upgraded.recalculatedStatsCount)}, mercados x3: ${String(upgraded.scaledMarketLeaguesCount)}, desbloqueados: ${String(upgraded.unlockedPlayersCount)}, rechazos limpiados: ${String(upgraded.clearedRejectedCooldownsCount)}).\n`,
      );
    }

    const rescheduled = await rescheduleUpcomingLeagueMatches(prisma);
    if (rescheduled.updatedMatchesCount > 0) {
      process.stdout.write(
        `[seed] Horarios futuros redistribuidos equitativamente (${String(rescheduled.updatedMatchesCount)} partidos entre 08:00 y 20:00).\n`,
      );
    }

    process.stdout.write('[seed] Seed completado con éxito.\n');
  } finally {
    await prisma.$disconnect();
  }
}

runSeed().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[seed] Error: ${msg}\n`);
  process.exitCode = 1;
});
