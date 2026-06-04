// =============================================================================
// sentry.spec.ts — Unit tests OBS-1 + OBS-1a Sentry integration
//
// Test cases:
//   (a) Tanpa SENTRY_DSN → app tetap boot/no-op (env schema tidak throw)
//   (b) Error 5xx/unhandled → captureException dipanggil
//   (c) Error 4xx yang diharapkan → captureException TIDAK dipanggil
//   (d) scrubPii → menghapus field PII dari event (request)
//   (e) scrubPii → meredaksi exception.values[].value (NIS, email, phone, nama)
//   (f) scrubPii → strip query-string dari event.request.url
//   (g) scrubBreadcrumb → selalu kembalikan null
// =============================================================================

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  init: jest.fn(),
}));

jest.mock('@smk/logger', () => ({
  logError: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { HttpException, HttpStatus } from '@nestjs/common';
import { captureException } from '@sentry/nestjs';
import { FastifyReply, FastifyRequest } from 'fastify';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../common/filters/prisma-exception.filter';
import {
  redactPiiFromText,
  scrubBreadcrumb,
  scrubPii,
  type SentryEventLike,
} from '../common/sentry.utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHost(url = '/api/v1/test') {
  const reply = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  } as unknown as FastifyReply;
  const request = { url, method: 'GET' } as unknown as FastifyRequest;
  return {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => request,
    }),
  };
}

function captureExceptionMock() {
  return captureException as jest.MockedFunction<typeof captureException>;
}

beforeEach(() => {
  captureExceptionMock().mockClear();
});

// ── (a) Tanpa SENTRY_DSN → no-op ─────────────────────────────────────────────

describe('(a) No-op tanpa SENTRY_DSN: captureException & scrubPii aman tanpa inisialisasi', () => {
  it('captureException() dapat dipanggil tanpa init (SDK no-op by design)', () => {
    expect(() => {
      captureException(new Error('no DSN configured'));
    }).not.toThrow();
  });

  it('scrubPii() berfungsi tanpa Sentry.init() — pure function, tidak butuh SDK', () => {
    const event: SentryEventLike = {
      request: { headers: { authorization: 'Bearer token' } },
    };
    expect(() => scrubPii(event)).not.toThrow();
    expect(scrubPii(event).request?.headers?.['authorization']).toBeUndefined();
  });
});

// ── (b) Error 5xx/unhandled → captureException dipanggil ─────────────────────

describe('(b) HttpExceptionFilter: 5xx & unhandled → captureException dipanggil', () => {
  it('HttpException 500 → captureException dipanggil', () => {
    const filter = new HttpExceptionFilter();
    const exception = new HttpException('Internal', HttpStatus.INTERNAL_SERVER_ERROR);
    const host = makeHost();

    filter.catch(exception, host as Parameters<typeof filter.catch>[1]);

    expect(captureExceptionMock()).toHaveBeenCalledWith(exception);
  });

  it('HttpException 503 → captureException dipanggil', () => {
    const filter = new HttpExceptionFilter();
    const exception = new HttpException('Unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    const host = makeHost();

    filter.catch(exception, host as Parameters<typeof filter.catch>[1]);

    expect(captureExceptionMock()).toHaveBeenCalledWith(exception);
  });

  it('Error bukan HttpException (unhandled) → captureException dipanggil', () => {
    const filter = new HttpExceptionFilter();
    const exception = new Error('Unexpected crash');
    const host = makeHost();

    filter.catch(exception, host as Parameters<typeof filter.catch>[1]);

    expect(captureExceptionMock()).toHaveBeenCalledWith(exception);
  });
});

// ── (c) Error 4xx yang diharapkan → captureException TIDAK dipanggil ─────────

describe('(c) HttpExceptionFilter: 4xx yang diharapkan → captureException TIDAK dipanggil', () => {
  const expected4xx = [
    { status: HttpStatus.BAD_REQUEST, label: '400 Bad Request (Zod)' },
    { status: HttpStatus.UNAUTHORIZED, label: '401 Unauthorized' },
    { status: HttpStatus.FORBIDDEN, label: '403 Forbidden' },
    { status: HttpStatus.NOT_FOUND, label: '404 Not Found' },
    { status: HttpStatus.CONFLICT, label: '409 Conflict' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, label: '422 (embed NULL)' },
  ];

  for (const { status, label } of expected4xx) {
    it(`${label} → captureException TIDAK dipanggil`, () => {
      const filter = new HttpExceptionFilter();
      const exception = new HttpException('expected error', status);
      const host = makeHost();

      filter.catch(exception, host as Parameters<typeof filter.catch>[1]);

      expect(captureExceptionMock()).not.toHaveBeenCalled();
    });
  }
});

describe('(c) PrismaExceptionFilter: known 4xx codes → captureException TIDAK dipanggil', () => {
  it('P2002 Conflict → captureException TIDAK dipanggil', () => {
    const filter = new PrismaExceptionFilter();
    const exception = Object.assign(new Error('unique constraint'), {
      code: 'P2002',
      meta: {},
      clientVersion: '5.0.0',
    }) as import('@prisma/client').Prisma.PrismaClientKnownRequestError;
    const host = makeHost();

    filter.catch(exception, host as Parameters<typeof filter.catch>[1]);

    expect(captureExceptionMock()).not.toHaveBeenCalled();
  });

  it('P2025 Not Found → captureException TIDAK dipanggil', () => {
    const filter = new PrismaExceptionFilter();
    const exception = Object.assign(new Error('record not found'), {
      code: 'P2025',
      meta: {},
      clientVersion: '5.0.0',
    }) as import('@prisma/client').Prisma.PrismaClientKnownRequestError;
    const host = makeHost();

    filter.catch(exception, host as Parameters<typeof filter.catch>[1]);

    expect(captureExceptionMock()).not.toHaveBeenCalled();
  });
});

describe('(b) PrismaExceptionFilter: unknown code (5xx) → captureException dipanggil', () => {
  it('unknown Prisma code → captureException dipanggil', () => {
    const filter = new PrismaExceptionFilter();
    const exception = Object.assign(new Error('unknown prisma error'), {
      code: 'P9999',
      meta: {},
      clientVersion: '5.0.0',
    }) as import('@prisma/client').Prisma.PrismaClientKnownRequestError;
    const host = makeHost();

    filter.catch(exception, host as Parameters<typeof filter.catch>[1]);

    expect(captureExceptionMock()).toHaveBeenCalledWith(exception);
  });
});

// ── (d) scrubPii — buang field PII dari event.request ────────────────────────

describe('(d) scrubPii: PII scrubbing request fields sebelum kirim ke Sentry', () => {
  it('menghapus header Authorization dari event', () => {
    const event: SentryEventLike = {
      request: {
        headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
        data: { nis: '12345', fullName: 'Budi' },
      },
    };

    const result = scrubPii(event);

    expect(result.request?.headers?.['authorization']).toBeUndefined();
    expect(result.request?.headers?.['content-type']).toBe('application/json');
  });

  it('menghapus header Cookie dan Set-Cookie', () => {
    const event: SentryEventLike = {
      request: {
        headers: { cookie: 'session=abc', 'set-cookie': 'token=xyz' },
      },
    };

    const result = scrubPii(event);

    expect(result.request?.headers?.['cookie']).toBeUndefined();
    expect(result.request?.headers?.['set-cookie']).toBeUndefined();
  });

  it('meng-redact request.data (body) sepenuhnya', () => {
    const event: SentryEventLike = {
      request: {
        data: { nis: '9999', fullName: 'Siswa Rahasia', nilai: 95 },
      },
    };

    const result = scrubPii(event);

    expect(result.request?.data).toContain('[REDACTED');
    expect(result.request?.data).not.toEqual(event.request?.data);
  });

  it('menghapus cookies dari request', () => {
    const event: SentryEventLike = {
      request: {
        cookies: { session: 'abc123', auth: 'token' },
      },
    };

    const result = scrubPii(event);

    expect(result.request?.cookies).toEqual({});
  });

  it('event tanpa request → tidak berubah', () => {
    const event: SentryEventLike = { extra: { info: 'test' } };

    const result = scrubPii(event);

    expect(result).toEqual(event);
    expect(result.request).toBeUndefined();
  });

  it('tidak mengubah event asli (immutable)', () => {
    const originalHeaders = { authorization: 'Bearer secret' };
    const event: SentryEventLike = {
      request: { headers: { ...originalHeaders } },
    };

    scrubPii(event);

    expect(originalHeaders.authorization).toBe('Bearer secret');
  });
});

// ── (e) OBS-1a: scrubPii — redaksi exception.values[].value ──────────────────

describe('(e) OBS-1a: scrubPii meredaksi PII di exception.values[].value', () => {
  it('NIS berlabel dalam pesan exception → [REDACTED]', () => {
    const event: SentryEventLike = {
      exception: {
        values: [{ type: 'Error', value: 'Student NIS: 1234567890 tidak ditemukan' }],
      },
    };

    const result = scrubPii(event);

    expect(result.exception?.values?.[0]?.value).not.toContain('1234567890');
    expect(result.exception?.values?.[0]?.value).toContain('[REDACTED]');
  });

  it('email dalam pesan exception → [REDACTED]', () => {
    const event: SentryEventLike = {
      exception: {
        values: [{ type: 'ConflictException', value: 'Email siswa@smk.sch.id sudah terdaftar' }],
      },
    };

    const result = scrubPii(event);

    expect(result.exception?.values?.[0]?.value).not.toContain('siswa@smk.sch.id');
    expect(result.exception?.values?.[0]?.value).toContain('[REDACTED]');
  });

  it('nomor HP Indonesia dalam pesan exception → [REDACTED]', () => {
    const event: SentryEventLike = {
      exception: {
        values: [{ type: 'Error', value: 'Notifikasi ke 081234567890 gagal dikirim' }],
      },
    };

    const result = scrubPii(event);

    expect(result.exception?.values?.[0]?.value).not.toContain('081234567890');
    expect(result.exception?.values?.[0]?.value).toContain('[REDACTED]');
  });

  it('nama berlabel dalam pesan exception → [REDACTED]', () => {
    const event: SentryEventLike = {
      exception: {
        values: [{ type: 'Error', value: 'Duplikat fullName: Ahmad Fauzi pada insert' }],
      },
    };

    const result = scrubPii(event);

    expect(result.exception?.values?.[0]?.value).not.toContain('Ahmad Fauzi');
    expect(result.exception?.values?.[0]?.value).toContain('[REDACTED]');
  });

  it('exception value dengan NIS+email+phone dummy → semua ter-redaksi', () => {
    const event: SentryEventLike = {
      exception: {
        values: [
          {
            type: 'Error',
            value:
              'Gagal proses: NIS: 9876543210, email siswa.dummy@sekolah.id, HP 081298765432',
          },
        ],
      },
    };

    const result = scrubPii(event);
    const redacted = result.exception?.values?.[0]?.value ?? '';

    expect(redacted).not.toContain('9876543210');
    expect(redacted).not.toContain('siswa.dummy@sekolah.id');
    expect(redacted).not.toContain('081298765432');
    expect(redacted).toContain('[REDACTED]');
  });

  it('exception value tanpa PII → tidak berubah', () => {
    const safeMsg = 'Database connection timeout after 5000ms';
    const event: SentryEventLike = {
      exception: {
        values: [{ type: 'Error', value: safeMsg }],
      },
    };

    const result = scrubPii(event);

    expect(result.exception?.values?.[0]?.value).toBe(safeMsg);
  });

  it('exception value undefined → tidak throw', () => {
    const event: SentryEventLike = {
      exception: {
        values: [{ type: 'Error', value: undefined }],
      },
    };

    expect(() => scrubPii(event)).not.toThrow();
  });

  it('event tanpa exception → tidak berubah', () => {
    const event: SentryEventLike = { extra: { info: 'test' } };

    const result = scrubPii(event);

    expect(result.exception).toBeUndefined();
  });

  it('tidak mengubah exception asli (immutable)', () => {
    const originalValue = 'Error: siswa@contoh.id tidak valid';
    const event: SentryEventLike = {
      exception: { values: [{ type: 'Error', value: originalValue }] },
    };

    scrubPii(event);

    // Objek asli tidak diubah
    expect(event.exception?.values?.[0]?.value).toBe(originalValue);
  });
});

// ── (f) OBS-1a: scrubPii — strip query-string dari request.url ───────────────

describe('(f) OBS-1a: scrubPii strip query-string dari event.request.url', () => {
  it('URL dengan query-string → query dihapus, path tetap', () => {
    const event: SentryEventLike = {
      request: { url: '/api/v1/students?nis=123456&kelas=X-RPL' },
    };

    const result = scrubPii(event);

    expect(result.request?.url).toBe('/api/v1/students');
    expect(result.request?.url).not.toContain('?');
    expect(result.request?.url).not.toContain('nis=');
  });

  it('URL tanpa query-string → tidak berubah', () => {
    const event: SentryEventLike = {
      request: { url: '/api/v1/health' },
    };

    const result = scrubPii(event);

    expect(result.request?.url).toBe('/api/v1/health');
  });

  it('URL dengan query-string kompleks → hanya path yang tersisa', () => {
    const event: SentryEventLike = {
      request: {
        url: 'https://api.smk.sch.id/api/v1/finance?startDate=2026-01-01&nama=Ahmad&nis=12345',
      },
    };

    const result = scrubPii(event);

    expect(result.request?.url).toBe('https://api.smk.sch.id/api/v1/finance');
  });

  it('URL undefined → tidak throw', () => {
    const event: SentryEventLike = {
      request: { headers: {} },
    };

    expect(() => scrubPii(event)).not.toThrow();
    const result = scrubPii(event);
    expect(result.request?.url).toBeUndefined();
  });
});

// ── (g) OBS-1a: scrubBreadcrumb → selalu null ────────────────────────────────

describe('(g) OBS-1a: scrubBreadcrumb selalu mengembalikan null', () => {
  it('scrubBreadcrumb() mengembalikan null', () => {
    expect(scrubBreadcrumb()).toBeNull();
  });
});

// ── redactPiiFromText — unit test fungsi helper ───────────────────────────────

describe('redactPiiFromText: helper PII redaction', () => {
  it('email → [REDACTED]', () => {
    expect(redactPiiFromText('user@example.com gagal login')).not.toContain('user@example.com');
    expect(redactPiiFromText('user@example.com gagal login')).toContain('[REDACTED]');
  });

  it('nomor HP +62 → [REDACTED]', () => {
    expect(redactPiiFromText('kirim ke +6281234567890')).toContain('[REDACTED]');
    expect(redactPiiFromText('kirim ke +6281234567890')).not.toContain('+6281234567890');
  });

  it('nomor HP 08xx → [REDACTED]', () => {
    expect(redactPiiFromText('HP: 081299887766')).toContain('[REDACTED]');
  });

  it('NIS berlabel → [REDACTED]', () => {
    expect(redactPiiFromText('NIS: 1234567890')).toContain('[REDACTED]');
    expect(redactPiiFromText('NIS: 1234567890')).not.toContain('1234567890');
  });

  it('nama berlabel fullName → [REDACTED]', () => {
    expect(redactPiiFromText('Conflict fullName: Budi Santoso')).toContain('[REDACTED]');
    expect(redactPiiFromText('Conflict fullName: Budi Santoso')).not.toContain('Budi Santoso');
  });

  it('teks tanpa PII → tidak berubah', () => {
    const safe = 'Connection timeout after 5000ms on query #42';
    expect(redactPiiFromText(safe)).toBe(safe);
  });

  it('string kosong → tidak throw', () => {
    expect(() => redactPiiFromText('')).not.toThrow();
    expect(redactPiiFromText('')).toBe('');
  });
});
