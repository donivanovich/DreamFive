import assert from 'node:assert/strict';
import net from 'node:net';
import { describe, it } from 'node:test';

import {
  appendLoopbackCorsOrigins,
  buildComposeEnvOverrides,
  isPortAvailable,
  parseEnvFile,
  parsePortRange,
  resolveServicePorts,
  rewriteLoopbackUrlPort,
} from './port-range-utils.mjs';

describe('port-range-utils', () => {
  it('parses .env files while ignoring comments and stripping quotes', () => {
    const parsed = parseEnvFile(`
      # comentario
      WEB_PORT=3100
      WEB_PORT_RANGE="3100-3199"
      API_CORS_ORIGINS='http://localhost:3100,http://127.0.0.1:3100'
    `);
    assert.deepEqual(parsed, {
      WEB_PORT: '3100',
      WEB_PORT_RANGE: '3100-3199',
      API_CORS_ORIGINS: 'http://localhost:3100,http://127.0.0.1:3100',
    });
  });

  it('parses single ports and ranges, and rejects invalid ranges', () => {
    assert.deepEqual(parsePortRange('3100-3199', 3000, 3099), { start: 3100, end: 3199 });
    assert.deepEqual(parsePortRange('3150', 3000, 3099), { start: 3150, end: 3150 });
    assert.deepEqual(parsePortRange('', 3100, 3199), { start: 3100, end: 3199 });
    assert.throws(() => parsePortRange('3200-3100', 3100, 3199), /Rango de puertos inválido/);
  });

  it('falls back to the next free port in range without colliding with other services', async () => {
    const busyPorts = new Set([3100, 3102]);
    const resolved = await resolveServicePorts(
      [
        { name: 'api', preferredPort: 3101, range: { start: 3101, end: 3110 } },
        { name: 'web', preferredPort: 3100, range: { start: 3100, end: 3110 } },
      ],
      {
        checkPort: (port) => Promise.resolve(!busyPorts.has(port)),
      },
    );

    assert.equal(resolved[0]?.name, 'api');
    assert.equal(resolved[0]?.assignedPort, 3101);
    assert.equal(resolved[0]?.fallbackUsed, false);

    assert.equal(resolved[1]?.name, 'web');
    // 3100 ocupado, 3101 reservado por api, 3102 ocupado -> asigna 3103
    assert.equal(resolved[1]?.assignedPort, 3103);
    assert.equal(resolved[1]?.fallbackUsed, true);
  });

  it('reuses a port currently bound by the same running Compose service', async () => {
    const resolved = await resolveServicePorts(
      [
        {
          name: 'web',
          preferredPort: 3100,
          range: { start: 3100, end: 3110 },
          reusablePort: 3100,
        },
      ],
      {
        checkPort: () => Promise.resolve(false),
      },
    );

    assert.equal(resolved[0]?.assignedPort, 3100);
    assert.equal(resolved[0]?.reusedRunningContainer, true);
    assert.equal(resolved[0]?.fallbackUsed, false);
  });

  it('detects a real occupied TCP port on 127.0.0.1 and picks a free neighbor', async () => {
    const blocker = net.createServer();
    await new Promise((resolve) => {
      blocker.listen(0, '127.0.0.1', resolve);
    });
    const address = blocker.address();
    assert.ok(address && typeof address === 'object');
    const occupiedPort = address.port;

    try {
      assert.equal(await isPortAvailable(occupiedPort), false);
      const resolved = await resolveServicePorts([
        {
          name: 'web',
          preferredPort: occupiedPort,
          range: { start: occupiedPort, end: Math.min(occupiedPort + 20, 65_535) },
        },
      ]);
      assert.notEqual(resolved[0]?.assignedPort, occupiedPort);
      assert.equal(resolved[0]?.fallbackUsed, true);
    } finally {
      await new Promise((resolve) => {
        blocker.close(resolve);
      });
    }
  });

  it('rewrites loopback URLs and keeps production domains untouched', () => {
    assert.equal(rewriteLoopbackUrlPort('http://localhost:3101', 3105), 'http://localhost:3105');
    assert.equal(rewriteLoopbackUrlPort('http://127.0.0.1:3100/', 3104), 'http://127.0.0.1:3104');
    assert.equal(rewriteLoopbackUrlPort('https://dream5.app/', 3104), 'https://dream5.app');
  });

  it('syncs API_CORS_ORIGINS, VITE_API_URL, and WEB_PUBLIC_URL when fallback ports are used', () => {
    assert.equal(
      appendLoopbackCorsOrigins('https://dream5.app', 3104),
      'https://dream5.app,http://localhost:3104,http://127.0.0.1:3104',
    );

    const overrides = buildComposeEnvOverrides({
      env: {
        VITE_API_URL: 'http://localhost:3101',
        WEB_PUBLIC_URL: 'http://localhost:3100',
        API_CORS_ORIGINS: 'http://localhost:3100',
      },
      resolved: [
        { name: 'api', assignedPort: 3105, fallbackUsed: true },
        { name: 'web', assignedPort: 3104, fallbackUsed: true },
      ],
    });

    assert.equal(overrides['API_PORT_RANGE'], '3105');
    assert.equal(overrides['WEB_PORT_RANGE'], '3104');
    assert.equal(overrides['VITE_API_URL'], 'http://localhost:3105');
    assert.equal(overrides['WEB_PUBLIC_URL'], 'http://localhost:3104');
    assert.equal(overrides['VITE_PUBLIC_URL'], 'http://localhost:3104');
    assert.equal(
      overrides['API_CORS_ORIGINS'],
      'http://localhost:3100,http://localhost:3104,http://127.0.0.1:3104',
    );
  });
});
