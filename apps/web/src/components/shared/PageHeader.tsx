import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/Badge';

export interface PageHeaderProps {
  readonly title: string;
  readonly description: string;
  readonly notice?: string;
  readonly actions?: ReactNode;
}

export function PageHeader({ title, description, notice, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-2xl font-bold tracking-wider break-words text-foreground uppercase md:text-3xl">
            {title}
          </h1>
          {notice ? <Badge variant="outline">{notice}</Badge> : null}
        </div>
        <p className="mt-1 text-sm break-words text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
