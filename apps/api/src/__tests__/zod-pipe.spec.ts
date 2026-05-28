// =============================================================================
// zod-pipe.spec.ts — Integration tests untuk ZodValidationPipe (FIX-T01)
// Memverifikasi bahwa validasi DTO aktif dan mengembalikan 400 untuk input invalid.
// =============================================================================

import { BadRequestException } from '@nestjs/common';
import { ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe, ZodPipe } from '../common/pipes/zod-validation.pipe';

const TestSchema = z.object({
  name: z.string().min(3, 'Nama minimal 3 karakter'),
  age: z.number().int().min(0, 'Umur tidak boleh negatif'),
});

const bodyMeta: ArgumentMetadata = { type: 'body', metatype: undefined, data: '' };

describe('ZodValidationPipe — body invalid returns 400 with error array', () => {
  const pipe = ZodPipe(TestSchema);

  it('POST dengan body invalid melempar BadRequestException', () => {
    expect(() => pipe.transform({ name: 'ab', age: -1 }, bodyMeta)).toThrow(
      BadRequestException,
    );
  });

  it('response error memiliki statusCode 400 dan message berupa array', () => {
    try {
      pipe.transform({ name: 'ab', age: -1 }, bodyMeta);
      fail('Seharusnya melempar exception');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const response = (e as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response['statusCode']).toBe(400);
      expect(Array.isArray(response['message'])).toBe(true);
      expect((response['message'] as unknown[]).length).toBeGreaterThan(0);
      const firstError = (response['message'] as Array<{ field: string; message: string }>)[0];
      expect(firstError).toHaveProperty('field');
      expect(firstError).toHaveProperty('message');
    }
  });

  it('body dengan field yang hilang melempar BadRequestException', () => {
    expect(() => pipe.transform({}, bodyMeta)).toThrow(BadRequestException);
  });
});

describe('ZodValidationPipe — body valid passes through', () => {
  const pipe = ZodPipe(TestSchema);

  it('POST dengan body valid mengembalikan data yang sudah di-parse', () => {
    const result = pipe.transform({ name: 'Alice', age: 20 }, bodyMeta);
    expect(result).toEqual({ name: 'Alice', age: 20 });
  });

  it('Zod membuang field yang tidak ada di schema (strip by default)', () => {
    const result = pipe.transform({ name: 'Alice', age: 20, extraField: 'ignored' }, bodyMeta);
    expect(result).toEqual({ name: 'Alice', age: 20 });
    expect((result as Record<string, unknown>)['extraField']).toBeUndefined();
  });
});

describe('ZodValidationPipe — non-body parameters dilewati tanpa validasi', () => {
  const pipe = ZodPipe(TestSchema);

  it('query params tidak divalidasi', () => {
    const queryMeta: ArgumentMetadata = { type: 'query', metatype: undefined, data: '' };
    const result = pipe.transform('any-value', queryMeta);
    expect(result).toBe('any-value');
  });

  it('route params tidak divalidasi', () => {
    const paramMeta: ArgumentMetadata = { type: 'param', metatype: undefined, data: '' };
    const result = pipe.transform('some-id', paramMeta);
    expect(result).toBe('some-id');
  });
});

describe('ZodValidationPipe — instansi tanpa schema adalah pass-through (per-endpoint use only)', () => {
  it('pipe tanpa schema tidak memvalidasi body — gunakan ZodPipe(schema) di endpoint', () => {
    const noSchemaPipe = new ZodValidationPipe();
    // Ini menunjukkan KENAPA global pipe tanpa schema harus dihapus dari main.ts:
    // pipe tidak melakukan validasi apapun tanpa schema eksplisit.
    const result = noSchemaPipe.transform({ badField: true }, bodyMeta);
    expect(result).toEqual({ badField: true });
  });
});
