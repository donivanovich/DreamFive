import type { LeagueSummaryDto } from '@dream5/shared';
import { Check, Crown, Users } from 'lucide-react';

import { TeamLogo } from '@/components/players/PlayerBadges';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useI18n } from '@/hooks/use-i18n';
import { translateLeagueRole, translateLeagueStatus } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface LeagueCardProps {
  readonly league: LeagueSummaryDto;
  readonly isActive: boolean;
  readonly onSelect: (leagueId: string) => void;
  readonly onManage?: (league: LeagueSummaryDto) => void;
}

export function LeagueCard({ league, isActive, onSelect, onManage }: LeagueCardProps) {
  const { language, locale, t } = useI18n();
  const statusLabel = translateLeagueStatus(league.status, language);
  const roleLabel = translateLeagueRole(league.userRole, language);

  return (
    <Card
      className={cn(
        'flex flex-col justify-between transition-colors',
        isActive ? 'border-primary/60' : 'hover:border-border/80',
      )}
    >
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={league.status === 'ACTIVE' ? 'success' : 'outline'}>
                {statusLabel}
              </Badge>
              <Badge variant={league.userRole === 'PRESIDENT' ? 'primary' : 'outline'}>
                {league.userRole === 'PRESIDENT' ? <Crown className="h-3 w-3" /> : null}
                {roleLabel}
              </Badge>
            </div>
            <h3 className="mt-2.5 truncate font-display text-xl font-bold tracking-wider text-foreground uppercase">
              {league.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {league.seasonName} · {t.common.roundLabel} {league.currentRoundNumber}/
              {league.totalRounds}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {t.leagues.rankHeader}
            </span>
            <p className="font-display text-2xl font-bold text-primary tabular-nums">
              #{league.userRank}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 rounded-md border border-border bg-surface-deep/80 p-3 text-xs">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">
              {t.common.youTeam}
            </p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
              <TeamLogo code={league.userTeamCode} name={league.userTeamName} size="sm" />
              <span className="truncate">
                {league.userTeamName} ({league.userTeamCode})
              </span>
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">
              {t.leagues.participantsHeader}
            </p>
            <p className="mt-0.5 flex items-center gap-1 font-semibold text-foreground tabular-nums">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {league.participantsCount}/{league.maxParticipants}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">
              {t.common.dpTotal}
            </p>
            <p className="mt-0.5 font-semibold text-foreground tabular-nums">
              {league.userTotalFp.toLocaleString(locale)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">
              {t.leagues.lastRoundHeader}
            </p>
            <p className="mt-0.5 font-semibold text-primary tabular-nums">
              {league.userLastRoundFp.toFixed(1)} {t.common.dp}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant={isActive ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => {
              onSelect(league.id);
            }}
            className="flex-1"
          >
            {isActive ? (
              <>
                <Check className="h-3.5 w-3.5 text-primary" />
                {t.leagues.activeLeagueBtn}
              </>
            ) : (
              t.leagues.selectLeagueBtn
            )}
          </Button>
          {league.userRole === 'PRESIDENT' && onManage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onManage(league);
              }}
            >
              {t.leagues.manageLeagueBtn}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
