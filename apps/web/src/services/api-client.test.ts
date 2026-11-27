import { describe, expect, it } from 'vitest';

import { resolveLoopbackApiUrl, resolveSocketConnectionConfig } from './api-client';

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

  it('preserva rutas relativas del gateway y URLs remotas sin alterarlas', () => {
    expect(resolveLoopbackApiUrl('/api/', 'dreamfive.donivanovich.dev')).toBe('/api');
    expect(resolveLoopbackApiUrl('/api', 'localhost')).toBe('/api');
    expect(resolveLoopbackApiUrl('https://dreamfive.donivanovich.dev/api/', '127.0.0.1')).toBe(
      'https://dreamfive.donivanovich.dev/api',
    );
    expect(resolveLoopbackApiUrl('http://localhost:3101', undefined)).toBe('http://localhost:3101');
  });
});

describe('resolveSocketConnectionConfig', () => {
  it('conecta al mismo origen en el namespace raíz cuando la API usa ruta relativa (/api)', () => {
    expect(resolveSocketConnectionConfig('/api', 'dreamfive.donivanovich.dev')).toEqual({
      url: undefined,
      path: '/socket.io',
    });
    expect(resolveSocketConnectionConfig('/api/', 'localhost')).toEqual({
      url: undefined,
      path: '/socket.io',
    });
  });

  it('extrae el origen (sin prefijo de ruta) cuando la API usa dominio completo con /api', () => {
    expect(
      resolveSocketConnectionConfig('https://dreamfive.donivanovich.dev/api', 'localhost'),
    ).toEqual({
      url: 'https://dreamfive.donivanovich.dev',
      path: '/socket.io',
    });
  });

  it('mantiene conexión directa con alineación loopback en desarrollo local sin gateway', () => {
    expect(resolveSocketConnectionConfig('http://localhost:3001', '127.0.0.1')).toEqual({
      url: 'http://127.0.0.1:3001',
      path: '/socket.io',
    });
  });
});
