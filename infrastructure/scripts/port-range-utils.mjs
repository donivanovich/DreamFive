import net from 'node:net';

/**
 * Parsea un archivo `.env` sencillo sin ejecutar comandos ni modificar secretos.
 *
 * @param {string} content
 * @returns {Record<string, string>}
 */
export function parseEnvFile(content) {
  /** @type {Record<string, string>} */
  const parsed = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key.length > 0) {
      parsed[key] = value;
    }
  }
  return parsed;
}

/**
 * Parsea un número de puerto entero válido (1..65535).
 *
 * @param {string | number | undefined} raw
 * @param {number} fallback
 * @returns {number}
 */
export function parsePortNumber(raw, fallback) {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 65_535) {
    return raw;
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535) {
      return parsed;
    }
  }
  return fallback;
}

/**
 * Parsea una especificación de rango (`3100-3199` o puerto único `3100`).
 *
 * @param {string | undefined} rawRange
 * @param {number} fallbackStart
 * @param {number} fallbackEnd
 * @returns {{ start: number; end: number }}
 */
export function parsePortRange(rawRange, fallbackStart, fallbackEnd) {
  const trimmed = typeof rawRange === 'string' ? rawRange.trim() : '';
  if (trimmed.length === 0) {
    return { start: fallbackStart, end: fallbackEnd };
  }

  const singleMatch = /^(\d+)$/.exec(trimmed);
  if (singleMatch) {
    const port = Number(singleMatch[1]);
    if (port >= 1 && port <= 65_535) {
      return { start: port, end: port };
    }
  }

  const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start >= 1 && end <= 65_535 && start <= end) {
      return { start, end };
    }
  }

  throw new Error(
    `Rango de puertos inválido "${trimmed}". Usa el formato "inicio-fin" (p. ej. 3100-3199) o un puerto válido entre 1 y 65535.`,
  );
}

/**
 * Comprueba si un puerto TCP está libre en `host` intentando enlazar un socket real.
 *
 * @param {number} port
 * @param {string} [host]
 * @returns {Promise<boolean>}
 */
export function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once('error', () => {
      resolve(false);
    });

    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

/**
 * Resuelve puertos libres en dos pasadas:
 * 1) Intenta asignar primero el puerto preferido de cada servicio.
 * 2) Para los que estén ocupados, busca secuencialmente dentro de su rango configurado.
 *
 * @param {Array<{
 *   name: string;
 *   preferredPort: number;
 *   range: { start: number; end: number };
 *   reusablePort?: number | null;
 * }>} services
 * @param {{ checkPort?: (port: number) => Promise<boolean> }} [options]
 * @returns {Promise<Array<{
 *   name: string;
 *   preferredPort: number;
 *   assignedPort: number;
 *   fallbackUsed: boolean;
 *   reusedRunningContainer: boolean;
 *   range: { start: number; end: number };
 * }>>}
 */
export async function resolveServicePorts(services, options = {}) {
  const checkPort = options.checkPort ?? ((port) => isPortAvailable(port));
  /** @type {Set<number>} */
  const reserved = new Set();
  /** @type {Map<string, { name: string; preferredPort: number; assignedPort: number; fallbackUsed: boolean; reusedRunningContainer: boolean; range: { start: number; end: number } }>} */
  const resolvedByName = new Map();

  // Pasada 1: intentar conservar el puerto definido por el usuario.
  for (const service of services) {
    const preferred = service.preferredPort;
    if (reserved.has(preferred)) {
      continue;
    }

    if (service.reusablePort === preferred) {
      reserved.add(preferred);
      resolvedByName.set(service.name, {
        name: service.name,
        preferredPort: preferred,
        assignedPort: preferred,
        fallbackUsed: false,
        reusedRunningContainer: true,
        range: service.range,
      });
      continue;
    }

    if (await checkPort(preferred)) {
      reserved.add(preferred);
      resolvedByName.set(service.name, {
        name: service.name,
        preferredPort: preferred,
        assignedPort: preferred,
        fallbackUsed: false,
        reusedRunningContainer: false,
        range: service.range,
      });
    }
  }

  // Pasada 2: buscar respaldo en el rango para los servicios con puerto ocupado.
  for (const service of services) {
    if (resolvedByName.has(service.name)) {
      continue;
    }

    // Si el contenedor propio ya estaba escuchando en un puerto dentro del rango, reutilizarlo.
    if (
      typeof service.reusablePort === 'number' &&
      service.reusablePort >= service.range.start &&
      service.reusablePort <= service.range.end &&
      !reserved.has(service.reusablePort)
    ) {
      reserved.add(service.reusablePort);
      resolvedByName.set(service.name, {
        name: service.name,
        preferredPort: service.preferredPort,
        assignedPort: service.reusablePort,
        fallbackUsed: service.reusablePort !== service.preferredPort,
        reusedRunningContainer: true,
        range: service.range,
      });
      continue;
    }

    /** @type {number | null} */
    let assigned = null;
    for (let candidate = service.range.start; candidate <= service.range.end; candidate += 1) {
      if (reserved.has(candidate) || candidate === service.preferredPort) {
        continue;
      }
      if (await checkPort(candidate)) {
        assigned = candidate;
        break;
      }
    }

    if (assigned === null) {
      throw new Error(
        `No hay puertos libres para el servicio "${service.name}" (puerto preferido ${String(service.preferredPort)}, rango ${String(service.range.start)}-${String(service.range.end)}).`,
      );
    }

    reserved.add(assigned);
    resolvedByName.set(service.name, {
      name: service.name,
      preferredPort: service.preferredPort,
      assignedPort: assigned,
      fallbackUsed: assigned !== service.preferredPort,
      reusedRunningContainer: false,
      range: service.range,
    });
  }

  return services.map((service) => {
    const result = resolvedByName.get(service.name);
    if (!result) {
      throw new Error(`No se pudo resolver el puerto para "${service.name}".`);
    }
    return result;
  });
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Actualiza el puerto de una URL solo si apunta a loopback (`localhost` / `127.0.0.1`),
 * dejando intactas rutas relativas (`/api`) y dominios públicos de producción.
 *
 * @param {string | undefined} rawUrl
 * @param {number} nextPort
 * @returns {string}
 */
export function rewriteLoopbackUrlPort(rawUrl, nextPort) {
  const fallback = `http://localhost:${String(nextPort)}`;
  if (!rawUrl || rawUrl.trim().length === 0) {
    return fallback;
  }
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('/')) {
    return trimmed.replace(/\/+$/, '') || '/';
  }
  try {
    const parsed = new URL(trimmed);
    if (LOOPBACK_HOSTS.has(parsed.hostname)) {
      parsed.port = String(nextPort);
      return parsed.toString().replace(/\/+$/, '');
    }
    return trimmed.replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

/**
 * Garantiza que `http://localhost:<publicPort>` y `http://127.0.0.1:<publicPort>`
 * estén presentes en `API_CORS_ORIGINS` sin eliminar orígenes previos.
 *
 * @param {string | undefined} rawOrigins
 * @param {number} publicPort
 * @returns {string}
 */
export function appendLoopbackCorsOrigins(rawOrigins, publicPort) {
  const origins = new Set(
    (rawOrigins ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
  origins.add(`http://localhost:${String(publicPort)}`);
  origins.add(`http://127.0.0.1:${String(publicPort)}`);
  return [...origins].join(',');
}

/**
 * Calcula las variables de entorno sincronizadas para `docker compose`.
 *
 * En modo stack completo únicamente `gateway` publica puerto en el host;
 * `VITE_API_URL` se mantiene en ruta relativa (`/api`) cuando está configurada así.
 *
 * @param {{
 *   env: Record<string, string | undefined>;
 *   resolved: Array<{ name: string; assignedPort: number; fallbackUsed: boolean }>;
 * }} params
 * @returns {Record<string, string>}
 */
export function buildComposeEnvOverrides({ env, resolved }) {
  /** @type {Record<string, string>} */
  const overrides = {};
  const byName = new Map(resolved.map((entry) => [entry.name, entry]));

  const gateway = byName.get('gateway');
  if (gateway) {
    overrides['GATEWAY_PORT'] = String(gateway.assignedPort);
    overrides['GATEWAY_PORT_RANGE'] = String(gateway.assignedPort);
    overrides['WEB_PUBLIC_URL'] = rewriteLoopbackUrlPort(
      env['WEB_PUBLIC_URL'],
      gateway.assignedPort,
    );
    overrides['VITE_PUBLIC_URL'] = overrides['WEB_PUBLIC_URL'];
    const rawViteApi = env['VITE_API_URL']?.trim() ?? '';
    let resolvedViteApi = '/api';
    if (rawViteApi.startsWith('/')) {
      resolvedViteApi = rawViteApi.replace(/\/+$/, '') || '/api';
    } else if (rawViteApi.length > 0) {
      try {
        const parsedApi = new URL(rawViteApi);
        // En modo gateway Docker la API no publica puerto propio en loopback: normaliza a `/api`.
        resolvedViteApi = LOOPBACK_HOSTS.has(parsedApi.hostname)
          ? '/api'
          : rawViteApi.replace(/\/+$/, '');
      } catch {
        resolvedViteApi = '/api';
      }
    }
    overrides['VITE_API_URL'] = resolvedViteApi;
    overrides['API_CORS_ORIGINS'] = appendLoopbackCorsOrigins(
      env['API_CORS_ORIGINS'],
      gateway.assignedPort,
    );
  }

  const postgres = byName.get('postgres');
  if (postgres) {
    overrides['POSTGRES_PORT'] = String(postgres.assignedPort);
    overrides['POSTGRES_PORT_RANGE'] = String(postgres.assignedPort);
  }

  const redis = byName.get('redis');
  if (redis) {
    overrides['REDIS_PORT'] = String(redis.assignedPort);
    overrides['REDIS_PORT_RANGE'] = String(redis.assignedPort);
  }

  return overrides;
}
