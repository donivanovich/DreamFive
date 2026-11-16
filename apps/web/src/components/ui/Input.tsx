import type { InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-md border border-input bg-surface-deep px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}
