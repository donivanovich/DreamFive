import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { DreamFiveStateProvider } from '@/components/layout/DreamFiveProvider';
import { PlayerContextMenuProvider } from '@/components/players/PlayerContextMenu';
import { DreamFiveToastProvider } from '@/components/ui/Toast';
import { buildShareHeadMetadata } from '@/lib/seo-metadata';
import appCss from '@/styles/app.css?url';

export interface RouterContext {
  readonly queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: ({ matches }) => {
    const activeMatch = matches[matches.length - 1];
    const shareHead = buildShareHeadMetadata({ pathname: activeMatch?.pathname });

    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: 'DreamFive' },
        ...shareHead.meta,
      ],
      links: [
        ...shareHead.links,
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/png', href: '/dreamfive-logo.png', sizes: '256x256' },
        { rel: 'apple-touch-icon', href: '/dreamfive-logo.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap',
        },
        { rel: 'stylesheet', href: appCss },
      ],
    };
  },
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <DreamFiveToastProvider>
        <DreamFiveStateProvider>
          <PlayerContextMenuProvider>
            <AppShell>
              <Outlet />
            </AppShell>
          </PlayerContextMenuProvider>
        </DreamFiveStateProvider>
      </DreamFiveToastProvider>
    </QueryClientProvider>
  );
}

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
