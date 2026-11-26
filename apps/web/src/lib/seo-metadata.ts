/**
 * Metadatos de previsualización al compartir enlaces (Open Graph, Twitter/X Cards y canonical).
 *
 * Se resuelven tanto en SSR como en el cliente usando `VITE_PUBLIC_URL` o
 * `WEB_PUBLIC_URL` en tiempo de ejecución del servidor.
 */

export const SITE_NAME = 'DreamFive';
export const DEFAULT_SHARE_TITLE = 'DreamFive — 24/7 Fantasy Basketball Manager';
export const DEFAULT_SHARE_DESCRIPTION =
  'Manage your starting five in isolated private fantasy basketball leagues with 24/7 match simulation, live dynamic market, player progression, and ACID trades.';
export const OG_IMAGE_PATH = '/og-image.png';
export const OG_IMAGE_WIDTH = '1200';
export const OG_IMAGE_HEIGHT = '630';
export const OG_IMAGE_TYPE = 'image/png';
export const OG_IMAGE_ALT = 'DreamFive — 24/7 Fantasy Basketball Manager preview card';
export const THEME_COLOR = '#0b1016';

export interface RouteShareCopy {
  readonly title: string;
  readonly description: string;
}

const ROUTE_SHARE_COPY: Readonly<Record<string, RouteShareCopy>> = {
  '/leagues': {
    title: 'Private Leagues · DreamFive',
    description:
      'Create or join isolated 30-team fantasy basketball leagues with 58-round seasons and private invitations.',
  },
  '/lineup': {
    title: 'Starting Five Lineup · DreamFive',
    description:
      'Set your PG, SG, SF, PF, and C starters before tipoff lock to score Dream Points every round.',
  },
  '/market': {
    title: 'Dynamic Player Market · DreamFive',
    description:
      'Track real-time basketball player valuations, trends, and market movers in your DreamFive league.',
  },
  '/transfers': {
    title: 'Transfer & Trade Desk · DreamFive',
    description:
      'Negotiate multi-player trades and free-agent signings with strict roster rules and ACID guarantees.',
  },
  '/rankings': {
    title: 'League Standings · DreamFive',
    description:
      'Follow live season rankings, Dream Points totals, and championship races across your DreamFive league.',
  },
  '/matches': {
    title: 'Match Center · DreamFive',
    description:
      'Inspect 24/7 simulated basketball box scores, round schedules, and Dream Points breakdowns.',
  },
  '/players': {
    title: 'Player Explorer · DreamFive',
    description:
      'Scout 540 league players with ratings, salaries, availability status, and full performance history.',
  },
  '/teams': {
    title: 'Franchises & Squads · DreamFive',
    description:
      'Compare 18-player rosters, budgets, and team ratings across every franchise in your league.',
  },
  '/auth': {
    title: 'Sign in · DreamFive',
    description:
      'Sign in or create your DreamFive manager account to compete in 24/7 private fantasy basketball leagues.',
  },
};

export interface ShareMetaTag {
  readonly name?: string;
  readonly property?: string;
  readonly content: string;
}

export interface ShareLinkTag {
  readonly rel: string;
  readonly href: string;
}

export interface ShareHeadPayload {
  readonly meta: readonly ShareMetaTag[];
  readonly links: readonly ShareLinkTag[];
}

export function normalizePublicOrigin(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function normalizePathname(pathname: string | undefined): string {
  if (!pathname || pathname.trim().length === 0) {
    return '/';
  }
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');
  return withoutTrailingSlash.length === 0 ? '/' : withoutTrailingSlash;
}

export function resolvePublicOrigin(): string | null {
  const fromVite = normalizePublicOrigin(import.meta.env.VITE_PUBLIC_URL);
  if (fromVite) {
    return fromVite;
  }
  if (typeof process !== 'undefined') {
    const fromServerEnv = normalizePublicOrigin(process.env['WEB_PUBLIC_URL']);
    if (fromServerEnv) {
      return fromServerEnv;
    }
  }
  if (typeof window !== 'undefined') {
    return normalizePublicOrigin(window.location.origin);
  }
  return null;
}

export function getRouteShareCopy(pathname: string | undefined): RouteShareCopy {
  const normalized = normalizePathname(pathname);
  return (
    ROUTE_SHARE_COPY[normalized] ?? {
      title: DEFAULT_SHARE_TITLE,
      description: DEFAULT_SHARE_DESCRIPTION,
    }
  );
}

export function buildShareHeadMetadata(options?: {
  readonly pathname?: string | undefined;
  readonly publicOrigin?: string | null | undefined;
}): ShareHeadPayload {
  const normalizedPath = normalizePathname(options?.pathname);
  const origin =
    options && 'publicOrigin' in options
      ? normalizePublicOrigin(options.publicOrigin)
      : resolvePublicOrigin();

  const copy = getRouteShareCopy(normalizedPath);
  const shareUrl = origin ? `${origin}${normalizedPath}` : null;
  const imageUrl = origin ? `${origin}${OG_IMAGE_PATH}` : OG_IMAGE_PATH;

  const meta: ShareMetaTag[] = [
    { name: 'description', content: copy.description },
    { name: 'application-name', content: SITE_NAME },
    { name: 'theme-color', content: THEME_COLOR },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:title', content: copy.title },
    { property: 'og:description', content: copy.description },
    ...(shareUrl ? [{ property: 'og:url', content: shareUrl }] : []),
    { property: 'og:image', content: imageUrl },
    { property: 'og:image:type', content: OG_IMAGE_TYPE },
    { property: 'og:image:width', content: OG_IMAGE_WIDTH },
    { property: 'og:image:height', content: OG_IMAGE_HEIGHT },
    { property: 'og:image:alt', content: OG_IMAGE_ALT },
    { property: 'og:locale', content: 'en_US' },
    { property: 'og:locale:alternate', content: 'es_ES' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: copy.title },
    { name: 'twitter:description', content: copy.description },
    { name: 'twitter:image', content: imageUrl },
    { name: 'twitter:image:alt', content: OG_IMAGE_ALT },
  ];

  const links: ShareLinkTag[] = shareUrl ? [{ rel: 'canonical', href: shareUrl }] : [];

  return { meta, links };
}
