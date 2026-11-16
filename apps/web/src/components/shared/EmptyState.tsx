import { Link } from '@tanstack/react-router';
import { SearchX, Trophy } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useI18n } from '@/hooks/use-i18n';

export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary/70 text-muted-foreground">
          <SearchX className="h-5 w-5" />
        </span>
        <h3 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">
          {title}
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        {actionLabel && onAction ? (
          <Button variant="outline" size="sm" onClick={onAction} className="mt-4">
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function NoActiveLeagueCard() {
  const { t } = useI18n();
  return (
    <Card className="border-primary/35">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary">
          <Trophy className="h-5 w-5" />
        </span>
        <h3 className="font-display text-xl font-bold tracking-wider text-foreground uppercase">
          {t.common.noActiveLeagueTitle}
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{t.common.noActiveLeagueDesc}</p>
        <Link to="/leagues" className="mt-4">
          <Button variant="primary" size="sm">
            {t.common.goToLeagues}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
