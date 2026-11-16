import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  localizeDisciplineReason,
  localizeTransferResponseNote,
  type LeagueMailCategory,
  type LeagueMailDto,
} from '@dream5/shared';
import {
  AlertTriangle,
  ArrowLeftRight,
  Award,
  Check,
  CheckCheck,
  Crown,
  MailOpen,
  ShieldAlert,
  Trash2,
  Trophy,
  UserPlus,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { EmptyState, NoActiveLeagueCard } from '@/components/shared/EmptyState';
import { ErrorFallbackCard, LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast-context';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import { formatMsg, getLocaleCode } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { mailApi } from '@/services/dream5-api';

type MailFilterGroup = 'ALL' | 'MATCHES' | 'TRANSFERS' | 'MEDICAL' | 'SEASON';

function matchesGroup(category: LeagueMailCategory, group: MailFilterGroup): boolean {
  if (group === 'ALL') return true;
  if (group === 'MATCHES') return category === 'MATCH_RESULT';
  if (group === 'TRANSFERS') {
    return (
      category === 'TRANSFER_SENT' ||
      category === 'TRANSFER_RECEIVED' ||
      category === 'TRANSFER_ACCEPTED' ||
      category === 'TRANSFER_REJECTED'
    );
  }
  if (group === 'MEDICAL') return category === 'INJURY' || category === 'EJECTION';
  return (
    category === 'RETIREMENT_REPLACEMENT' ||
    category === 'SEASON_SUMMARY' ||
    category === 'PRESIDENT_PROMOTION'
  );
}

function getCategoryStyle(category: LeagueMailCategory) {
  switch (category) {
    case 'MATCH_RESULT':
      return { icon: Trophy, variant: 'info' as const, linkTo: '/matches' as const };
    case 'TRANSFER_ACCEPTED':
      return { icon: ArrowLeftRight, variant: 'success' as const, linkTo: '/transfers' as const };
    case 'TRANSFER_RECEIVED':
      return { icon: ArrowLeftRight, variant: 'primary' as const, linkTo: '/transfers' as const };
    case 'TRANSFER_SENT':
      return { icon: ArrowLeftRight, variant: 'outline' as const, linkTo: '/transfers' as const };
    case 'TRANSFER_REJECTED':
      return { icon: ArrowLeftRight, variant: 'danger' as const, linkTo: '/transfers' as const };
    case 'INJURY':
      return { icon: AlertTriangle, variant: 'danger' as const, linkTo: '/lineup' as const };
    case 'EJECTION':
      return { icon: ShieldAlert, variant: 'warning' as const, linkTo: '/lineup' as const };
    case 'RETIREMENT_REPLACEMENT':
      return { icon: UserPlus, variant: 'primary' as const, linkTo: '/teams' as const };
    case 'SEASON_SUMMARY':
      return { icon: Award, variant: 'info' as const, linkTo: '/rankings' as const };
    case 'PRESIDENT_PROMOTION':
      return { icon: Crown, variant: 'primary' as const, linkTo: '/leagues' as const };
  }
}

function localizeFallbackMailBody(body: string, language: 'en' | 'es'): string {
  const detailMatch = /^(.*\b(?:Detail|Reason|Detalle|Motivo): )(.+?)(\.?)$/i.exec(body);
  if (!detailMatch) {
    return body;
  }
  const [, prefix = '', reason = '', suffix = ''] = detailMatch;
  return `${prefix}${localizeDisciplineReason(reason, language)}${suffix}`;
}

function localizeMailContent(
  mail: LeagueMailDto,
  language: 'en' | 'es',
): { readonly subject: string; readonly body: string } {
  if (!mail.metadata) {
    return {
      subject: mail.subject,
      body: localizeFallbackMailBody(mail.body, language),
    };
  }

  const m = mail.metadata;
  const str = (key: string, fallback = '') => (typeof m[key] === 'string' ? m[key] : fallback);
  const num = (key: string, fallback = 0) => (typeof m[key] === 'number' ? m[key] : fallback);
  const list = (key: string) =>
    Array.isArray(m[key])
      ? m[key].filter((v): v is string => typeof v === 'string').join(', ')
      : '';

  if (mail.category === 'PRESIDENT_PROMOTION') {
    const leagueName = str('leagueName');
    const prevName = str('previousPresidentName');
    const clubName = str('teamName');
    if (language === 'es') {
      return {
        subject: `¡Enhorabuena, ahora eres presidente de la liga ${leagueName}!`,
        body: `${prevName} ha dejado la liga y te ha elegido como nuevo presidente de ${leagueName}. Como mánager de ${clubName}, ya puedes invitar participantes y liderar la competición.`,
      };
    }
    return {
      subject: `Congratulations! You are now president of ${leagueName}!`,
      body: `${prevName} stepped down and chose you as the new league president of ${leagueName}. Leading ${clubName}, you can now invite managers and oversee the competition.`,
    };
  }

  if (mail.category === 'MATCH_RESULT') {
    const round = num('roundNumber', mail.roundNumber ?? 0);
    const opponent = str('opponentTeamName');
    const isHome = m['isHome'] === true;
    const teamScore = num('teamScore');
    const oppScore = num('opponentScore');
    const won = m['won'] === true;
    const ot = num('overtimeCount');
    const otSuffix = ot > 0 ? ` (${String(ot)}OT)` : '';
    const dp = num('teamDreamPoints');
    const rewardM = num('winRewardMillions');
    const rewardUsd = Math.round(rewardM * 1_000_000);

    if (language === 'es') {
      const venue = isHome ? 'vs' : 'en';
      const rewardTxt =
        won && rewardUsd > 0
          ? ` Premio por victoria acreditado: $${rewardUsd.toLocaleString('es-ES')}.`
          : '';
      return {
        subject: `Jornada ${String(round)}: ${won ? 'Victoria' : 'Derrota'} ${venue} ${opponent} (${String(teamScore)}-${String(oppScore)}${otSuffix})`,
        body: `Tu equipo disputó la Jornada ${String(round)} ${venue} ${opponent} con resultado ${String(teamScore)}-${String(oppScore)}${otSuffix} y sumó ${dp.toFixed(1)} Dream Points.${rewardTxt}`,
      };
    }

    const venue = isHome ? 'vs' : '@';
    const rewardTxt =
      won && rewardUsd > 0 ? ` Win reward credited: $${rewardUsd.toLocaleString('en-US')}.` : '';
    return {
      subject: `Round ${String(round)}: ${won ? 'Victory' : 'Defeat'} ${venue} ${opponent} (${String(teamScore)}-${String(oppScore)}${otSuffix})`,
      body: `Your club finished Round ${String(round)} ${venue} ${opponent} with a score of ${String(teamScore)}-${String(oppScore)}${otSuffix} and generated ${dp.toFixed(1)} Dream Points.${rewardTxt}`,
    };
  }

  if (mail.category === 'INJURY') {
    const round = mail.roundNumber ?? 0;
    const playerName = str('playerName');
    const pos = str('playerPosition');
    const opponent = str('opponentTeamName');
    const gamesOut = num('gamesOut', 1);
    const reason = localizeDisciplineReason(str('reason'), language);
    if (language === 'es') {
      return {
        subject: `Parte médico (J${String(round)}): ${playerName} (${String(gamesOut)}P)`,
        body: `${playerName} (${pos}) sufrió una lesión ante ${opponent} y causará baja ${String(gamesOut)} ${gamesOut === 1 ? 'partido' : 'partidos'}. Detalle: ${reason}.`,
      };
    }
    return {
      subject: `Injury Report (R${String(round)}): ${playerName} (${String(gamesOut)}G)`,
      body: `${playerName} (${pos}) suffered an injury against ${opponent} and is expected to miss ${String(gamesOut)} ${gamesOut === 1 ? 'match' : 'matches'}. Detail: ${reason}.`,
    };
  }

  if (mail.category === 'EJECTION') {
    const round = mail.roundNumber ?? 0;
    const playerName = str('playerName');
    const pos = str('playerPosition');
    const opponent = str('opponentTeamName');
    const gamesOut = num('gamesOut', 1);
    const reason = localizeDisciplineReason(str('reason'), language);
    if (language === 'es') {
      return {
        subject: `Sanción disciplinaria (J${String(round)}): ${playerName} (${String(gamesOut)}P)`,
        body: `${playerName} (${pos}) fue expulsado ante ${opponent} y estará suspendido ${String(gamesOut)} ${gamesOut === 1 ? 'partido' : 'partidos'}. Motivo: ${reason}.`,
      };
    }
    return {
      subject: `Suspension Notice (R${String(round)}): ${playerName} (${String(gamesOut)}G)`,
      body: `${playerName} (${pos}) was ejected against ${opponent} and suspended for ${String(gamesOut)} ${gamesOut === 1 ? 'match' : 'matches'}. Reason: ${reason}.`,
    };
  }

  if (mail.category === 'RETIREMENT_REPLACEMENT') {
    if (language === 'es') {
      return {
        subject: `Retirada y alta de rookie (${str('teamName')}): ${str('retiredPlayerName')} -> ${str('rookiePlayerName')}`,
        body: `${str('retiredPlayerName')} (${str('retiredPosition')}, ${String(num('retiredAge'))} años, OVR ${String(num('retiredOverall'))}) se ha retirado tras la temporada anterior. Tu franquicia incorpora al rookie ${str('rookiePlayerName')} (${str('rookiePosition')}, ${String(num('rookieAge'))} años, OVR ${String(num('rookieOverall'))}, $${num('rookiePriceMillions').toFixed(1)}M) para mantener los 18 jugadores en la Temporada ${String(num('seasonNumber'))}.`,
      };
    }
    return {
      subject: `Retirement & Rookie Sign-Off (${str('teamName')}): ${str('retiredPlayerName')} -> ${str('rookiePlayerName')}`,
      body: `${str('retiredPlayerName')} (${str('retiredPosition')}, age ${String(num('retiredAge'))}, OVR ${String(num('retiredOverall'))}) retired after last season. Your franchise promoted rookie ${str('rookiePlayerName')} (${str('rookiePosition')}, age ${String(num('rookieAge'))}, OVR ${String(num('rookieOverall'))}, $${num('rookiePriceMillions').toFixed(1)}M) to keep an 18-player roster in Season ${String(num('seasonNumber'))}.`,
    };
  }

  if (mail.category === 'SEASON_SUMMARY') {
    if (language === 'es') {
      return {
        subject: `Inicio de la Temporada ${String(num('nextSeasonNumber'))}`,
        body: `La Temporada ${String(num('previousSeasonNumber'))} ha finalizado (Campeón: ${str('championTeamName')}). Todos los jugadores en activo han cumplido +1 año y el calendario de la Temporada ${String(num('nextSeasonNumber'))} ya está programado.`,
      };
    }
    return {
      subject: `Season ${String(num('nextSeasonNumber'))} Tip-Off`,
      body: `Season ${String(num('previousSeasonNumber'))} has concluded (Champion: ${str('championTeamName')}). Every active player aged +1 year and Season ${String(num('nextSeasonNumber'))} fixtures are now scheduled.`,
    };
  }

  if (mail.category === 'TRANSFER_SENT') {
    if (language === 'es') {
      return {
        subject: `Oferta enviada a ${str('receivingTeamName')}`,
        body: `Enviaste una oferta a ${str('receivingTeamName')}: entregas a ${list('offeredPlayers')} ($${num('cashOfferedMillions').toFixed(1)}M) por ${list('requestedPlayers')} ($${num('cashRequestedMillions').toFixed(1)}M).`,
      };
    }
    return {
      subject: `Trade Offer Sent to ${str('receivingTeamName')}`,
      body: `You sent a trade offer to ${str('receivingTeamName')}: offering ${list('offeredPlayers')} ($${num('cashOfferedMillions').toFixed(1)}M) for ${list('requestedPlayers')} ($${num('cashRequestedMillions').toFixed(1)}M).`,
    };
  }

  if (mail.category === 'TRANSFER_RECEIVED') {
    if (language === 'es') {
      return {
        subject: `Nueva propuesta de traspaso de ${str('proposingTeamName')}`,
        body: `${str('proposingTeamName')} te propone: ${list('offeredPlayers')} ($${num('cashOfferedMillions').toFixed(1)}M) a cambio de ${list('requestedPlayers')} ($${num('cashRequestedMillions').toFixed(1)}M).`,
      };
    }
    return {
      subject: `New Trade Proposal from ${str('proposingTeamName')}`,
      body: `${str('proposingTeamName')} sent a trade proposal: ${list('offeredPlayers')} ($${num('cashOfferedMillions').toFixed(1)}M) for ${list('requestedPlayers')} ($${num('cashRequestedMillions').toFixed(1)}M).`,
    };
  }

  if (mail.category === 'TRANSFER_ACCEPTED') {
    if (language === 'es') {
      return {
        subject: `Traspaso cerrado entre ${str('proposingTeamName')} y ${str('receivingTeamName')}`,
        body: `Acuerdo ejecutado: ${str('proposingTeamName')} envía a ${list('offeredPlayers')} y ${str('receivingTeamName')} envía a ${list('requestedPlayers')}.`,
      };
    }
    return {
      subject: `Trade Completed between ${str('proposingTeamName')} and ${str('receivingTeamName')}`,
      body: `Agreement finalized: ${str('proposingTeamName')} sends ${list('offeredPlayers')} and ${str('receivingTeamName')} sends ${list('requestedPlayers')}.`,
    };
  }

  const rawNote = str('responseNote');
  const note = rawNote ? localizeTransferResponseNote(rawNote, language) : '';
  const counterparty = str('receivingTeamName', str('proposingTeamName'));
  if (language === 'es') {
    return {
      subject: `Traspaso rechazado / cancelado (${counterparty})`,
      body: note || 'La oferta de traspaso fue rechazada o cancelada automáticamente.',
    };
  }
  return {
    subject: `Trade Offer Declined / Cancelled (${counterparty})`,
    body: note || 'The trade offer was declined or automatically cancelled.',
  };
}

export function MailPage() {
  const { activeLeague } = useDream5State();
  const { showToast } = useToast();
  const { t, f, language } = useI18n();
  const locale = getLocaleCode(language);
  const queryClient = useQueryClient();
  const leagueId = activeLeague?.id ?? null;

  const [group, setGroup] = useState<MailFilterGroup>('ALL');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const mailQuery = useQuery({
    queryKey: ['league', leagueId, 'mail'],
    queryFn: () => mailApi.list(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  const invalidateMail = () => {
    void queryClient.invalidateQueries({ queryKey: ['league', leagueId, 'mail'] });
  };

  const markReadMutation = useMutation({
    mutationFn: (mailId: string) => mailApi.markRead(leagueId ?? '', mailId),
    onSuccess: invalidateMail,
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.common.loadErrorTitle,
      });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => mailApi.markAllRead(leagueId ?? ''),
    onSuccess: invalidateMail,
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.common.loadErrorTitle,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (mailId: string) => mailApi.remove(leagueId ?? '', mailId),
    onSuccess: invalidateMail,
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.common.loadErrorTitle,
      });
    },
  });

  const filteredItems = useMemo(() => {
    const items = mailQuery.data?.items ?? [];
    return items.filter((item) => {
      if (unreadOnly && item.isRead) return false;
      return matchesGroup(item.category, group);
    });
  }, [group, mailQuery.data?.items, unreadOnly]);

  if (!activeLeague) {
    return <NoActiveLeagueCard />;
  }

  const unreadCount = mailQuery.data?.unreadCount ?? 0;

  const categoryLabels: Record<LeagueMailCategory, string> = {
    MATCH_RESULT: t.mailPage.catLabelMatch,
    TRANSFER_SENT: t.mailPage.catLabelTransferSent,
    TRANSFER_RECEIVED: t.mailPage.catLabelTransferReceived,
    TRANSFER_ACCEPTED: t.mailPage.catLabelTransferAccepted,
    TRANSFER_REJECTED: t.mailPage.catLabelTransferRejected,
    INJURY: t.mailPage.catLabelInjury,
    EJECTION: t.mailPage.catLabelEjection,
    RETIREMENT_REPLACEMENT: t.mailPage.catLabelRetirement,
    SEASON_SUMMARY: t.mailPage.catLabelSeason,
    PRESIDENT_PROMOTION: t.mailPage.catLabelPresidentPromotion,
  };

  const linkLabelForTarget = (linkTo: string) => {
    if (linkTo === '/matches') return t.mailPage.openMatchesBtn;
    if (linkTo === '/transfers') return t.mailPage.openTransfersBtn;
    if (linkTo === '/lineup') return t.mailPage.openLineupBtn;
    if (linkTo === '/teams') return t.mailPage.openTeamBtn;
    if (linkTo === '/leagues') return t.nav.leagues;
    return t.nav.rankings;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.mailPage.title}
        description={f(t.mailPage.description, { leagueName: activeLeague.name })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={unreadCount > 0 ? 'primary' : 'outline'}>
              {unreadCount > 0
                ? formatMsg(t.mailPage.unreadPill, { count: unreadCount })
                : t.mailPage.allReadPill}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              disabled={unreadCount === 0 || markAllMutation.isPending}
              onClick={() => {
                markAllMutation.mutate();
              }}
            >
              <CheckCheck className="h-4 w-4" />
              {t.mailPage.markAllReadBtn}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['ALL', t.mailPage.allCategories],
              ['MATCHES', t.mailPage.catMatches],
              ['TRANSFERS', t.mailPage.catTransfers],
              ['MEDICAL', t.mailPage.catMedical],
              ['SEASON', t.mailPage.catSeason],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setGroup(key);
              }}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                group === key
                  ? 'border border-primary/40 bg-primary/15 text-primary'
                  : 'border border-border bg-surface-deep text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setUnreadOnly((prev) => !prev);
          }}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
            unreadOnly
              ? 'border-primary/40 bg-primary/15 text-primary'
              : 'border-border bg-surface-deep text-muted-foreground hover:text-foreground',
          )}
        >
          <MailOpen className="h-3.5 w-3.5" />
          {t.mailPage.unreadOnlyBtn}
        </button>
      </div>

      {mailQuery.isError ? (
        <ErrorFallbackCard
          title={t.mailPage.loadErrorTitle}
          description={
            mailQuery.error instanceof Error ? mailQuery.error.message : t.common.loadErrorDesc
          }
        />
      ) : mailQuery.isLoading ? (
        <LoadingSkeletonCard />
      ) : filteredItems.length === 0 ? (
        <EmptyState title={t.mailPage.emptyTitle} description={t.mailPage.emptyDesc} />
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((mail) => {
            const style = getCategoryStyle(mail.category);
            const Icon = style.icon;
            const localized = localizeMailContent(mail, language);
            const dateStr = new Date(mail.createdAt).toLocaleString(locale, {
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={mail.id}
                className={cn(
                  'flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors sm:flex-row sm:items-start sm:justify-between',
                  mail.isRead
                    ? 'border-border/80 opacity-90'
                    : 'border-primary/40 bg-primary/[0.04]',
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                      mail.isRead
                        ? 'border-border bg-surface-deep text-muted-foreground'
                        : 'border-primary/35 bg-primary/15 text-primary',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {!mail.isRead ? (
                        <span aria-label="Unread" className="h-2 w-2 rounded-full bg-primary" />
                      ) : null}
                      <Badge variant={style.variant}>{categoryLabels[mail.category]}</Badge>
                      {mail.roundNumber !== null ? (
                        <Badge variant="outline">
                          {formatMsg(t.mailPage.roundTag, { round: mail.roundNumber })}
                        </Badge>
                      ) : mail.category === 'RETIREMENT_REPLACEMENT' ||
                        mail.category === 'SEASON_SUMMARY' ? (
                        <Badge variant="outline">{t.mailPage.preseasonTag}</Badge>
                      ) : null}
                      <span className="text-[11px] text-muted-foreground">{dateStr}</span>
                    </div>

                    <h3 className="text-sm font-semibold text-foreground">{localized.subject}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {localized.body}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                  <Link
                    to={style.linkTo}
                    className="inline-flex h-8 items-center rounded-md border border-border bg-surface-deep px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {linkLabelForTarget(style.linkTo)}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    {!mail.isRead ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={markReadMutation.isPending}
                        onClick={() => {
                          markReadMutation.mutate(mail.id);
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {t.mailPage.markReadBtn}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t.mailPage.deleteBtn}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        deleteMutation.mutate(mail.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
