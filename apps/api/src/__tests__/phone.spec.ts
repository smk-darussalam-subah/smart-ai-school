import { normalizePhoneE164, normalizeOrThrow, phoneE164 } from '../common/helpers/phone';
import { BadRequestException } from '@nestjs/common';

describe('normalizePhoneE164', () => {
  it('0812… → +62812…', () => {
    expect(normalizePhoneE164('081234567890')).toBe('+6281234567890');
  });

  it('62… → +62…', () => {
    expect(normalizePhoneE164('6281234567890')).toBe('+6281234567890');
  });

  it('+62… tetap +62…', () => {
    expect(normalizePhoneE164('+6281234567890')).toBe('+6281234567890');
  });

  it('spasi diabaikan — "0812 3456 7890" → +6281234567890', () => {
    expect(normalizePhoneE164('0812 3456 7890')).toBe('+6281234567890');
  });

  it('strip diabaikan — "0812-3456-7890"', () => {
    expect(normalizePhoneE164('0812-3456-7890')).toBe('+6281234567890');
  });

  it('kombinasi — "08 12-34.56.78" → +62812345678', () => {
    expect(normalizePhoneE164('08 12-34.56.78')).toBe('+62812345678');
  });

  it('format internasional berkurung — "+62 (812) 3456-7890" → +6281234567890', () => {
    expect(normalizePhoneE164('+62 (812) 3456-7890')).toBe('+6281234567890');
  });

  it('terlalu pendek (<8 digit setelah +62) → throw', () => {
    expect(() => normalizePhoneE164('0812')).toThrow();
  });

  it('terlalu panjang (>13 digit setelah +62) → throw', () => {
    expect(() => normalizePhoneE164('081234567890123456')).toThrow();
  });

  it('mengandung huruf → throw', () => {
    expect(() => normalizePhoneE164('0812ABC')).toThrow();
  });
});

describe('normalizeOrThrow', () => {
  it('valid → E.164', () => {
    expect(normalizeOrThrow('081234567890')).toBe('+6281234567890');
  });

  it('invalid → BadRequestException', () => {
    expect(() => normalizeOrThrow('abc')).toThrow(BadRequestException);
  });
});

describe('phoneE164 (Zod)', () => {
  const schema = phoneE164;

  it('valid → parsed ke E.164', () => {
    const result = schema.safeParse('081234567890');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('+6281234567890');
  });

  it('invalid → Zod error', () => {
    const result = schema.safeParse('abc');
    expect(result.success).toBe(false);
  });
});
