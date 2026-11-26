import { describe, expect, it } from 'vitest';

import { resolveLoopbackApiUrl } from './api-client';

describe('resolveLoopbackApiUrl', () => {
  it('alinea localhost con 127.0.0.1 y viceversa manteniendo puerto y protocolo', () => {
    expect(resolveLoopbackApiUrl('http://localhost:3101/', '127.0.0.1')).toBe(
      'http://127.0.0.1:3101',
    );
    expect(resolveLoopbackApiUrl('http://127.0.0.1:3101', 'localhost')).toBe(
      'http://localhost:3101',
    );
    expect(resolveLoopbackApiUrl('http://localhost:3101', 'localhost')).toBe(
      'http://localhost:3101',
    );
  });

  it('no altera URLs remotas ni llamadas en entorno servidor sin hostname', () => {
    expect(resolveLoopbackApiUrl('https://api.dreamfive.app/', '127.0.0.1')).toBe(
      'https://api.dreamfive.app',
    );
    expect(resolveLoopbackApiUrl('http://localhost:3101', undefined)).toBe('http://localhost:3101');
  });
});
