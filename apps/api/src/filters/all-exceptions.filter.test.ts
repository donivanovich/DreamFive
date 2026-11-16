import {
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { AllExceptionsFilter, type ErrorResponseBody } from './all-exceptions.filter.js';

function createFilterHarness() {
  const reply = vi.fn();
  const adapterHost = {
    httpAdapter: { reply },
  } as unknown as HttpAdapterHost;

  const responseObj = {};
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ url: '/auth/register' }),
      getResponse: () => responseObj,
    }),
  } as unknown as ArgumentsHost;

  const filter = new AllExceptionsFilter(adapterHost);
  return { filter, host, reply };
}

describe('AllExceptionsFilter', () => {
  it('preserva mensajes explícitos de ServiceUnavailableException (503 SMTP)', () => {
    const { filter, host, reply } = createFilterHarness();
    const expected =
      'Configura SMTP_USER y SMTP_PASS (contraseña de aplicación de Gmail) en .env para enviar correos reales.';

    filter.catch(new ServiceUnavailableException(expected), host);

    expect(reply).toHaveBeenCalledTimes(1);
    const body = reply.mock.calls[0]?.[1] as ErrorResponseBody;
    expect(body.statusCode).toBe(503);
    expect(body.message).toBe(expected);
  });

  it('enmascara errores 500 o no controlados como Error interno del servidor', () => {
    const { filter, host, reply } = createFilterHarness();

    filter.catch(new Error('DB socket blew up'), host);
    filter.catch(new InternalServerErrorException('Secret stack detail'), host);

    expect(reply).toHaveBeenCalledTimes(2);
    expect((reply.mock.calls[0]?.[1] as ErrorResponseBody).message).toBe(
      'Error interno del servidor',
    );
    expect((reply.mock.calls[1]?.[1] as ErrorResponseBody).message).toBe(
      'Error interno del servidor',
    );
  });

  it('mantiene intactos errores 4xx como BadRequestException', () => {
    const { filter, host, reply } = createFilterHarness();

    filter.catch(new BadRequestException('Solicitud inválida'), host);

    const body = reply.mock.calls[0]?.[1] as ErrorResponseBody;
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Solicitud inválida');
  });
});
