import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { Dream5StateProvider } from '@/components/layout/Dream5Provider';
import { PlayerContextMenuProvider } from '@/components/players/PlayerContextMenu';
import { Dream5ToastProvider } from '@/components/ui/Toast';
import appCss from '@/styles/app.css?url';

export interface RouterContext {
  readonly queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'DREAM5' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
      { rel: 'icon', type: 'image/png', href: '/dream5-logo.png', sizes: '256x256' },
      { rel: 'apple-touch-icon', href: '/dream5-logo.png' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Dream5ToastProvider>
        <Dream5StateProvider>
          <PlayerContextMenuProvider>
            <AppShell>
              <Outlet />
            </AppShell>
          </PlayerContextMenuProvider>
        </Dream5StateProvider>
      </Dream5ToastProvider>
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
