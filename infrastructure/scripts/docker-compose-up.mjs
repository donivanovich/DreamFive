#!/usr/bin/env node
/**
 * Arranca Docker Compose resolviendo automáticamente un rango de puertos si
 * alguno de los puertos definidos en `.env` ya está ocupado en el host.
 *
 * Uso:
 *   node infrastructure/scripts/docker-compose-up.mjs up -d --build
 *   node infrastructure/scripts/docker-compose-up.mjs --infra up -d postgres redis
 *   node infrastructure/scripts/docker-compose-up.mjs --dry-run
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildComposeEnvOverrides,
  parseEnvFile,
  parsePortNumber,
  parsePortRange,
  resolveServicePorts,
} from './port-range-utils.mjs';

const ROOT_DIR = resolve(import.meta.dirname, '../..');
const ENV_FILE = resolve(ROOT_DIR, '.env');

/**
 * Lee los puertos publicados actualmente por contenedores del proyecto `dreamfive`
 * para reutilizarlos al recrear/reconstruir sin saltar a otro puerto del rango.
 *
 * @param {string[]} composeFileArgs
 * @returns {Map<string, number>}
 */
function readRunningProjectPorts(composeFileArgs) {
  /** @type {Map<string, number>} */
  const ports = new Map();
  const result = spawnSync('docker', ['compose', ...composeFileArgs, 'ps', '--format', 'json'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.status !== 0 || !result.stdout) {
    return ports;
  }

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    try {
      /** @type {unknown} */
      const parsed = JSON.parse(line);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        const record = /** @type {Record<string, unknown>} */ (entry);
        const serviceName = typeof record['Service'] === 'string' ? record['Service'] : null;
        const publishers = Array.isArray(record['Publishers']) ? record['Publishers'] : [];
        if (!serviceName) {
          continue;
        }
        for (const pub of publishers) {
          if (!pub || typeof pub !== 'object') {
            continue;
          }
          const publishedPort = /** @type {Record<string, unknown>} */ (pub)['PublishedPort'];
          if (typeof publishedPort === 'number' && publishedPort > 0) {
            ports.set(serviceName, publishedPort);
            break;
          }
        }
      }
    } catch {
      // Ignora líneas no JSON si la versión de Docker Compose difiere.
    }
  }

  return ports;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  let infraMode = false;
  let dryRun = false;
  /** @type {string[]} */
  const composeArgs = [];

  for (const arg of rawArgs) {
    if (arg === '--infra') {
      infraMode = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      composeArgs.push(arg);
    }
  }

  const fileEnv = existsSync(ENV_FILE) ? parseEnvFile(readFileSync(ENV_FILE, 'utf8')) : {};
  /** @type {Record<string, string | undefined>} */
  const mergedEnv = { ...fileEnv, ...process.env };

  const composeFileArgs = infraMode
    ? ['-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml']
    : ['-f', 'docker-compose.yml'];

  const runningPorts = readRunningProjectPorts(composeFileArgs);

  const gatewayPreferred = parsePortNumber(
    mergedEnv['GATEWAY_PORT'] ?? mergedEnv['WEB_PORT'],
    3000,
  );
  const postgresPreferred = parsePortNumber(mergedEnv['POSTGRES_PORT'], 5432);
  const redisPreferred = parsePortNumber(mergedEnv['REDIS_PORT'], 6379);

  const services = infraMode
    ? [
        {
          name: 'postgres',
          preferredPort: postgresPreferred,
          range: parsePortRange(
            mergedEnv['POSTGRES_PORT_RANGE'],
            postgresPreferred,
            Math.min(postgresPreferred + 67, 65_535),
          ),
          reusablePort: runningPorts.get('postgres') ?? null,
        },
        {
          name: 'redis',
          preferredPort: redisPreferred,
          range: parsePortRange(
            mergedEnv['REDIS_PORT_RANGE'],
            redisPreferred,
            Math.min(redisPreferred + 70, 65_535),
          ),
          reusablePort: runningPorts.get('redis') ?? null,
        },
      ]
    : [
        {
          name: 'gateway',
          preferredPort: gatewayPreferred,
          range: parsePortRange(
            mergedEnv['GATEWAY_PORT_RANGE'],
            gatewayPreferred,
            Math.min(gatewayPreferred + 99, 65_535),
          ),
          reusablePort: runningPorts.get('gateway') ?? null,
        },
      ];

  const resolved = await resolveServicePorts(services);
  const overrides = buildComposeEnvOverrides({ env: mergedEnv, resolved });

  process.stdout.write('[DreamFive Docker] Puertos resueltos:\n');
  for (const item of resolved) {
    const statusLabel = item.fallbackUsed
      ? `puerto ${String(item.preferredPort)} en uso -> asignado ${String(item.assignedPort)} (rango ${String(item.range.start)}-${String(item.range.end)})`
      : item.reusedRunningContainer
        ? `${String(item.assignedPort)} (contenedor activo reutilizado)`
        : `${String(item.assignedPort)} (libre)`;
    process.stdout.write(`  - ${item.name}: ${statusLabel}\n`);
  }

  if (!infraMode && overrides['WEB_PUBLIC_URL'] && overrides['VITE_API_URL']) {
    process.stdout.write(`  - Gateway URL: ${overrides['WEB_PUBLIC_URL']}\n`);
    process.stdout.write(`  - API path:    ${overrides['VITE_API_URL']}\n`);
  }

  if (dryRun) {
    return;
  }

  const finalArgs = composeArgs.length > 0 ? composeArgs : ['up', '-d', '--build'];
  const child = spawnSync('docker', ['compose', ...composeFileArgs, ...finalArgs], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...overrides,
    },
  });

  if (child.error) {
    process.stderr.write(
      `[DreamFive Docker] Error al ejecutar docker compose: ${child.error.message}\n`,
    );
    process.exit(1);
  }

  process.exit(child.status ?? 0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[DreamFive Docker] ${message}\n`);
  process.exit(1);
});
