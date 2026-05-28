// =============================================================================
// ZodValidationPipe — Validasi semua DTO menggunakan Zod
// Lebih type-safe daripada class-validator
// =============================================================================

import {
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema?: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    // Jika tidak ada schema, lewati validasi (untuk non-DTO types)
    if (!this.schema) return value;
    if (metadata.type !== 'body') return value;

    const result = this.schema.safeParse(value);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));

      throw new BadRequestException({
        message: errors,
        error: 'Validation Error',
        statusCode: 400,
      });
    }

    return result.data;
  }
}

/**
 * Factory untuk membuat pipe dengan schema spesifik
 * @example @Body(new ZodPipe(createStudentSchema)) dto: CreateStudentDto
 */
export function ZodPipe(schema: ZodSchema): ZodValidationPipe {
  return new ZodValidationPipe(schema);
}
