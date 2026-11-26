import { TeamLogo } from '@/components/players/PlayerBadges';
import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/hooks/use-i18n';
import { translateMatchStatus } from '@/lib/i18n';
import { shouldShowHomeFirst } from '@/lib/match-order';
import { cn } from '@/lib/utils';
import type { MatchFixture } from '@/types/fantasy';

export function MatchCard({ match }: { readonly match: MatchFixture }) {
  const { language, locale, t } = useI18n();
  const isFinal = match.status === 'FINAL';
  const homeFirst = shouldShowHomeFirst(match.id);
  const hasScores =
    isFinal && typeof match.homeScore === 'number' && typeof match.awayScore === 'number';

  const homeRow = {
    key: 'home',
    abbr: match.homeAbbr,
    name: match.homeName,
    score: match.homeScore,
    roleLabel: t.common.home,
    won: hasScores && (match.homeScore ?? 0) > (match.awayScore ?? 0),
  };
  const awayRow = {
    key: 'away',
    abbr: match.awayAbbr,
    name: match.awayName,
    score: match.awayScore,
    roleLabel: t.common.away,
    won: hasScores && (match.awayScore ?? 0) > (match.homeScore ?? 0),
  };
  const rows = homeFirst ? [homeRow, awayRow] : [awayRow, homeRow];

  return (
    <div className="rounded-md border border-border/80 bg-surface-deep/80 px-3 py-2 sm:px-3.5 sm:py-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          {match.dateLabel} · {match.timeLabel}
        </span>
        <Badge variant={isFinal ? 'secondary' : 'info'}>
          {translateMatchStatus(match.status, language)}
        </Badge>
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-2 text-sm">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
              <TeamLogo code={row.abbr} name={row.name} size="sm" />
              <span className="shrink-0 rounded border border-border bg-card px-1.5 py-0.5 font-display text-xs font-bold tracking-wider text-foreground">
                {row.abbr}
              </span>
              <span className="truncate text-foreground">{row.name}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                {row.roleLabel}
              </span>
              {isFinal && typeof row.score === 'number' ? (
                <span
                  className={cn(
                    'min-w-[2.2ch] text-right font-display text-base font-bold tabular-nums',
                    row.won ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {row.score}
                </span>
              ) : null}
            </div>
          </div>
        ))}
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
