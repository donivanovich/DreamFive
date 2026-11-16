import { TeamLogo } from '@/components/players/PlayerBadges';
import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/hooks/use-i18n';
import { translateMatchStatus } from '@/lib/i18n';
import type { MatchFixture } from '@/types/fantasy';

export function MatchCard({ match }: { readonly match: MatchFixture }) {
  const { language, locale, t } = useI18n();
  const isFinal = match.status === 'FINAL';

  return (
    <div className="rounded-md border border-border/80 bg-surface-deep/80 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {match.dateLabel} · {match.timeLabel}
        </span>
        <Badge variant={isFinal ? 'secondary' : 'info'}>
          {translateMatchStatus(match.status, language)}
        </Badge>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <TeamLogo code={match.awayAbbr} name={match.awayName} size="sm" />
          <span className="rounded border border-border bg-card px-1.5 py-0.5 font-display text-xs font-bold tracking-wider text-foreground">
            {match.awayAbbr}
          </span>
          <span className="truncate text-foreground">{match.awayName}</span>
        </div>
        {isFinal && typeof match.awayScore === 'number' ? (
          <span className="font-display text-base font-bold text-foreground tabular-nums">
            {match.awayScore}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">@</span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <TeamLogo code={match.homeAbbr} name={match.homeName} size="sm" />
          <span className="rounded border border-border bg-card px-1.5 py-0.5 font-display text-xs font-bold tracking-wider text-foreground">
            {match.homeAbbr}
          </span>
          <span className="truncate text-foreground">{match.homeName}</span>
        </div>
        {isFinal && typeof match.homeScore === 'number' ? (
          <span className="font-display text-base font-bold text-primary tabular-nums">
            {match.homeScore}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">{t.common.home}</span>
        )}
      </div>
      {isFinal && typeof match.winRewardMillions === 'number' && match.winRewardMillions > 0 ? (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5 text-[11px] tabular-nums">
          <span className="text-muted-foreground">{t.common.winnerReward}</span>
          <span className="font-semibold text-[var(--tone-success)]">
            +{Math.round(match.winRewardMillions * 1_000_000).toLocaleString(locale)}{' '}
            {t.common.creditsShort}
          </span>
        </div>
      ) : null}
    </div>
  );
}
