import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Pipe de validación con Zod para cuerpos y consultas tipadas en Fastify/NestJS.
 */
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: z.ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
        return `${path}${issue.message}`;
      });
      throw new BadRequestException(messages);
    }
    return parsed.data;
  }
}
