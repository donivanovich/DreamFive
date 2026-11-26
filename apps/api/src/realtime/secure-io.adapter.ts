import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

import { resolveAllowedCorsOrigins } from '../config/http-security.js';

/**
 * Adaptador Socket.IO con CORS restringido a los orígenes permitidos.
 *
 * Cuando la API escale a varias réplicas se sustituirá/extenderá con el
 * adaptador Redis de Socket.IO para difundir eventos entre instancias.
 */
export class SecureIoAdapter extends IoAdapter {
  private readonly resolvedAllowedOrigins: string[];

  constructor(app: INestApplicationContext, allowedOrigins: readonly string[]) {
    super(app);
    this.resolvedAllowedOrigins = resolveAllowedCorsOrigins(allowedOrigins);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: [...this.resolvedAllowedOrigins], credentials: true },
      serveClient: false,
      maxHttpBufferSize: 100_000,
    } as ServerOptions);
  }
}
