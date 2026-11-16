import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  buildPresidentPromotionMailInput,
  recordHumanTeamMailsInTx,
  resolveMailSeasonIdInTx,
} from './league-mail.js';

export interface DeleteAccountParams {
  readonly userId: string;
  readonly confirmUsername: string;
  readonly successorPresidents: Record<string, string>;
}

export interface DeleteAccountResult {
  readonly deletedUserId: string;
  readonly deletedLeagueIds: readonly string[];
  readonly promotedLeagues: readonly {
    readonly leagueId: string;
    readonly leagueName: string;
    readonly successorUserId: string;
  }[];
  readonly vacatedAvatarUrl: string | null;
}

/**
 * Elimina completamente una liga y todas sus tablas dependientes respetando
 * el orden topológico frente a claves foráneas con `onDelete: Restrict`.
 */
export async function deleteLeagueCascadeInTx(
  tx: Prisma.TransactionClient,
  leagueId: string,
): Promise<void> {
  await tx.leagueMail.deleteMany({ where: { leagueId } });
  await tx.simulationJob.deleteMany({ where: { leagueId } });
  await tx.leagueInvitation.deleteMany({ where: { leagueId } });
  await tx.injury.deleteMany({ where: { leagueId } });
  await tx.suspension.deleteMany({ where: { leagueId } });
  await tx.marketHistory.deleteMany({ where: { leagueId } });
  await tx.matchEvent.deleteMany({ where: { leagueId } });
  await tx.playerMatchStat.deleteMany({ where: { leagueId } });
  await tx.teamMatchStat.deleteMany({ where: { leagueId } });
  await tx.fantasyScore.deleteMany({ where: { leagueId } });
  await tx.standing.deleteMany({ where: { leagueId } });
  await tx.transferHistory.deleteMany({ where: { leagueId } });
  await tx.transaction.deleteMany({ where: { leagueId } });
  await tx.transferOffer.deleteMany({ where: { leagueId } });
  await tx.lineup.deleteMany({ where: { leagueId } });
  await tx.rosterSlot.deleteMany({ where: { leagueId } });
  await tx.match.deleteMany({ where: { leagueId } });
  await tx.season.deleteMany({ where: { leagueId } });
  await tx.playerInstance.deleteMany({ where: { leagueId } });
  await tx.leagueMember.deleteMany({ where: { leagueId } });
  await tx.leagueTeam.deleteMany({ where: { leagueId } });
  await tx.league.delete({ where: { id: leagueId } });
}

/**
 * Elimina la cuenta del usuario de forma atómica:
 * - Valida el nombre de usuario exacto.
 * - Transfiere la presidencia si presidía alguna liga con otros miembros humanos
 *   y les envía correo oficial en el juego.
 * - Devuelve sus franquicias al control automático de la CPU.
 * - Elimina por completo cualquier liga que quede sin participantes humanos.
 */
export async function deleteUserAccountWithLeagueHandover(
  prisma: PrismaClient,
  params: DeleteAccountParams,
): Promise<DeleteAccountResult> {
  return prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: params.userId },
        include: { profile: true },
      });
      if (!user?.profile) {
        throw new Error('NOT_FOUND:Usuario no encontrado.');
      }

      if (params.confirmUsername !== user.profile.username) {
        throw new Error(
          'USERNAME_MISMATCH:Debes escribir exactamente tu nombre de usuario para confirmar la eliminación.',
        );
      }

      const memberships = await tx.leagueMember.findMany({
        where: { userId: user.id },
        include: {
          league: {
            include: {
              members: {
                include: {
                  user: { include: { profile: true } },
                  team: true,
                },
                orderBy: { joinedAt: 'asc' },
              },
            },
          },
          team: true,
        },
      });

      const presidedWithoutMembership = await tx.league.findMany({
        where: {
          presidentUserId: user.id,
          id: { notIn: memberships.map((m) => m.leagueId) },
        },
        include: {
          members: {
            include: {
              user: { include: { profile: true } },
              team: true,
            },
            orderBy: { joinedAt: 'asc' },
          },
        },
      });

      const deletedLeagueIds: string[] = [];
      const promotedLeagues: {
        readonly leagueId: string;
        readonly leagueName: string;
        readonly successorUserId: string;
      }[] = [];

      const handleLeagueExit = async (
        league: (typeof memberships)[number]['league'],
        selfMemberId: string | null,
        selfTeamId: string | null,
        isPresident: boolean,
      ) => {
        const remainingMembers = league.members.filter((m) => m.userId !== user.id);

        if (remainingMembers.length === 0) {
          await deleteLeagueCascadeInTx(tx, league.id);
          deletedLeagueIds.push(league.id);
          return;
        }

        if (isPresident || league.presidentUserId === user.id) {
          const requestedSuccessorId = params.successorPresidents[league.id];
          const successor = remainingMembers.find((m) => m.userId === requestedSuccessorId);
          if (!successor) {
            throw new Error(
              `SUCCESSOR_REQUIRED:Debes seleccionar al nuevo presidente para la liga ${league.name}.`,
            );
          }

          await tx.league.update({
            where: { id: league.id },
            data: { presidentUserId: successor.userId },
          });
          await tx.leagueMember.update({
            where: { id: successor.id },
            data: { role: 'PRESIDENT' },
          });

          const seasonId = await resolveMailSeasonIdInTx(tx, league.id);
          if (seasonId) {
            await recordHumanTeamMailsInTx(tx, [
              buildPresidentPromotionMailInput({
                leagueId: league.id,
                seasonId,
                leagueTeamId: successor.leagueTeamId,
                leagueName: league.name,
                previousPresidentName: user.profile?.username ?? user.email,
                newPresidentName: successor.user.profile?.username ?? successor.user.email,
                teamName: successor.team.name,
              }),
            ]);
          }

          promotedLeagues.push({
            leagueId: league.id,
            leagueName: league.name,
            successorUserId: successor.userId,
          });
        }

        await tx.transferOffer.updateMany({
          where: {
            leagueId: league.id,
            proposedByUserId: user.id,
            status: 'PENDING',
          },
          data: {
            status: 'CANCELLED',
            respondedAt: new Date(),
            responseNote: 'Cancelada automáticamente al eliminar la cuenta del mánager.',
          },
        });

        if (selfMemberId) {
          await tx.leagueMember.delete({ where: { id: selfMemberId } });
        }

        if (selfTeamId) {
          await tx.leagueMail.deleteMany({
            where: { leagueId: league.id, leagueTeamId: selfTeamId },
          });
          await tx.leagueTeam.update({
            where: { id: selfTeamId },
            data: { isCpuControlled: true },
          });
        }
      };

      for (const membership of memberships) {
        await handleLeagueExit(
          membership.league,
          membership.id,
          membership.leagueTeamId,
          membership.role === 'PRESIDENT',
        );
      }

      for (const league of presidedWithoutMembership) {
        await handleLeagueExit(league, null, null, true);
      }

      const vacatedAvatarUrl = user.profile.avatarUrl ?? null;
      await tx.user.delete({ where: { id: user.id } });

      return {
        deletedUserId: user.id,
        deletedLeagueIds,
        promotedLeagues,
        vacatedAvatarUrl,
      };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
