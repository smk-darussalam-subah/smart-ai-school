// =============================================================================
// phone.ts — Normalisasi & validasi nomor telepon E.164 Indonesia (+62…)
// =============================================================================

import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

export class PhoneValidationError extends Error {
  constructor(raw: string) {
    super(
      `Nomor telepon tidak valid: "${raw}". Format yang diterima: +62xxx, 08xxx, atau 62xxx (8–13 digit setelah kode negara).`,
    );
    this.name = 'PhoneValidationError';
  }
}

export function normalizePhoneE164(raw: string): string {
  let cleaned = raw.replace(/[\s.()-]/g, '');

  if (cleaned.startsWith('+')) {
    // already E.164
  } else if (cleaned.startsWith('0')) {
    cleaned = '+62' + cleaned.slice(1);
  } else if (cleaned.startsWith('62')) {
    cleaned = '+' + cleaned;
  } else {
    cleaned = '+62' + cleaned;
  }

  if (!/^\+62\d{8,13}$/.test(cleaned)) {
    throw new PhoneValidationError(raw);
  }

  return cleaned;
}

export function normalizeOrThrow(raw: string): string {
  try {
    return normalizePhoneE164(raw);
  } catch (err) {
    if (err instanceof PhoneValidationError) {
      throw new BadRequestException(err.message);
    }
    throw err;
  }
}

export const phoneE164 = z.string().transform((val, ctx) => {
  try {
    return normalizePhoneE164(val);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Nomor telepon tidak valid: "${val}"`,
    });
    return z.NEVER;
  }
});
