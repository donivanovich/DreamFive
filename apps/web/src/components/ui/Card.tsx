import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-content-card="true"
      className={cn(
        'min-w-0 rounded-lg border border-border bg-card text-card-foreground shadow-[var(--card-shadow)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:gap-3 sm:px-5 sm:py-4',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        'min-w-0 font-display text-base font-bold tracking-wider text-foreground uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0 px-4 pb-4 sm:px-5 sm:pb-5', className)} {...props} />;
}
