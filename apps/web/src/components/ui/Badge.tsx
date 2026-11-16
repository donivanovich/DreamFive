import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type BadgeVariant =
  'default' | 'primary' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger' | 'info';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'border-border bg-secondary text-secondary-foreground',
  primary: 'border-primary/40 bg-primary text-primary-foreground',
  secondary: 'border-border bg-muted text-muted-foreground',
  outline: 'border-border bg-transparent text-muted-foreground',
  success: 'border-emerald-500/35 bg-emerald-500/15 text-[var(--tone-success)]',
  warning: 'border-amber-500/35 bg-amber-500/15 text-[var(--tone-warning)]',
  danger: 'border-red-500/35 bg-red-500/15 text-[var(--tone-danger)]',
  info: 'border-sky-500/35 bg-sky-500/15 text-[var(--tone-info)]',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold tracking-wider uppercase',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
