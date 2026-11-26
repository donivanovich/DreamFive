import { describe, expect, it } from 'vitest';

import {
  buildShareHeadMetadata,
  DEFAULT_SHARE_DESCRIPTION,
  DEFAULT_SHARE_TITLE,
  normalizePathname,
  normalizePublicOrigin,
  OG_IMAGE_PATH,
} from './seo-metadata';

describe('seo-metadata', () => {
  it('normalizes valid HTTP(S) origins and rejects invalid or non-HTTP URLs', () => {
    expect(normalizePublicOrigin('https://dreamfive.app/leagues?foo=1')).toBe(
      'https://dreamfive.app',
    );
    expect(normalizePublicOrigin('http://localhost:3100/')).toBe('http://localhost:3100');
    expect(normalizePublicOrigin('javascript:alert(1)')).toBeNull();
    expect(normalizePublicOrigin('not-a-url')).toBeNull();
    expect(normalizePublicOrigin('')).toBeNull();
  });

  it('normalizes pathnames consistently', () => {
    expect(normalizePathname(undefined)).toBe('/');
    expect(normalizePathname('/')).toBe('/');
    expect(normalizePathname('/market/')).toBe('/market');
    expect(normalizePathname('rankings')).toBe('/rankings');
  });

  it('builds complete Open Graph, Twitter Card, and canonical tags for the root route', () => {
    const result = buildShareHeadMetadata({
      pathname: '/',
      publicOrigin: 'https://dreamfive.app',
    });

    expect(result.links).toEqual([{ rel: 'canonical', href: 'https://dreamfive.app/' }]);
    expect(result.meta).toContainEqual({ property: 'og:url', content: 'https://dreamfive.app/' });
    expect(result.meta).toContainEqual({ property: 'og:title', content: DEFAULT_SHARE_TITLE });
    expect(result.meta).toContainEqual({
      property: 'og:description',
      content: DEFAULT_SHARE_DESCRIPTION,
    });
    expect(result.meta).toContainEqual({
      property: 'og:image',
      content: `https://dreamfive.app${OG_IMAGE_PATH}`,
    });
    expect(result.meta).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' });
    expect(result.meta).toContainEqual({
      name: 'twitter:image',
      content: `https://dreamfive.app${OG_IMAGE_PATH}`,
    });
  });

  it('uses route-specific copy and omits og:url/canonical when no public origin is available', () => {
    const result = buildShareHeadMetadata({
      pathname: '/market/',
      publicOrigin: null,
    });

    expect(result.links).toEqual([]);
    expect(result.meta.some((entry) => entry.property === 'og:url')).toBe(false);
    expect(result.meta).toContainEqual({
      property: 'og:title',
      content: 'Dynamic Player Market · DreamFive',
    });
    expect(result.meta).toContainEqual({ property: 'og:image', content: OG_IMAGE_PATH });
  });
});
