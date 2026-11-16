import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/** Formato homogéneo de todas las respuestas de error de la API. */
export interface ErrorResponseBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string | readonly string[];
  readonly path: string;
  readonly timestamp: string;
}

interface RequestLike {
  readonly url?: string;
}

/**
 * Filtro global de excepciones.
 *
 * - Las `HttpException` conservan su código y mensaje.
 * - Cualquier otro error se registra con su traza y se responde con un 500
 *   genérico, sin filtrar detalles internos al cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      return;
    }

    const { httpAdapter } = this.adapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<RequestLike>();

    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Excepción no controlada',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      error: HttpStatus[statusCode] ?? 'ERROR',
      message: resolveMessage(exception, statusCode),
      path: request.url ?? '',
      timestamp: new Date().toISOString(),
    };

    httpAdapter.reply(context.getResponse(), body, statusCode);
  }
}

function resolveMessage(exception: unknown, statusCode: number): string | readonly string[] {
  // Preserve explicit 503 ServiceUnavailableException messages (e.g. SMTP configuration/delivery errors).
  if (!(exception instanceof HttpException) || (statusCode >= 500 && statusCode !== 503)) {
    return 'Error interno del servidor';
  }
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (typeof response === 'object' && 'message' in response) {
    const { message } = response;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
      return message;
    }
  }
  return exception.message;
}
