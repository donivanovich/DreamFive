import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/toast-context';
import { useI18n } from '@/hooks/use-i18n';

export function LoadingSkeletonCard({ rows = 4 }: { readonly rows?: number }) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="h-5 w-40 animate-pulse rounded bg-secondary" />
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-10 w-full animate-pulse rounded bg-secondary/60" />
        ))}
      </CardContent>
    </Card>
  );
}

export function ErrorFallbackCard({
  title,
  description,
  onRetry,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly onRetry?: () => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const resolvedTitle = title ?? t.common.loadErrorTitle;
  const resolvedDescription = description ?? t.common.loadErrorDesc;
  const lastNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${resolvedTitle}::${resolvedDescription}`;
    if (lastNotifiedRef.current === key) {
      return;
    }
    lastNotifiedRef.current = key;
    showToast({
      tone: 'error',
      title: resolvedTitle,
      message: resolvedDescription,
    });
  }, [resolvedDescription, resolvedTitle, showToast]);

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-display text-base font-bold tracking-wider text-foreground uppercase">
            {resolvedTitle}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.common.loadErrorDesc}</p>
        </div>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t.common.retry}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
