/**
 * Utilidades mínimas sin dependencias externas para leer y emitir cookies HttpOnly en Fastify.
 */
export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) {
    return cookies;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) {
      continue;
    }
    const rawKey = pair.slice(0, idx).trim();
    const rawVal = pair.slice(idx + 1).trim();
    if (!rawKey) {
      continue;
    }
    try {
      cookies[rawKey] = decodeURIComponent(rawVal);
    } catch {
      cookies[rawKey] = rawVal;
    }
  }
  return cookies;
}

export function buildSessionCookieHeader(params: {
  readonly name: string;
  readonly value: string;
  readonly maxAgeSeconds: number;
  readonly isProduction: boolean;
}): string {
  const parts = [
    `${params.name}=${encodeURIComponent(params.value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${String(params.maxAgeSeconds)}`,
  ];
  if (params.isProduction) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearedCookieHeader(name: string, isProduction: boolean): string {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isProduction) {
    parts.push('Secure');
  }
  return parts.join('; ');
}
