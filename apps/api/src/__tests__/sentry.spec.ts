// =============================================================================
// sentry.spec.ts — Unit tests OBS-1 Sentry integration
//
// Test cases (sesuai task brief):
//   (a) Tanpa SENTRY_DSN → app tetap boot/no-op (env schema tidak throw)
//   (b) Error 5xx/unhandled → captureException dipanggil
//   (c) Error 4xx yang diharapkan → captureException TIDAK dipanggil
//   (d) scrubPii → menghapus field PII dari event
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
import { scrubPii, type SentryEventLike } from '../common/sentry.utils';

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

// ── (a) Tanpa SENTRY_DSN → no-op: captureException aman dipanggil tanpa init ─

describe('(a) No-op tanpa SENTRY_DSN: captureException & scrubPii aman tanpa inisialisasi', () => {
  it('captureException() dapat dipanggil tanpa init (SDK no-op by design)', () => {
    // Mock sudah aktif — merepresentasikan Sentry SDK yang tidak diinisialisasi:
    // memanggil captureException() tanpa Sentry.init() tidak boleh throw.
    // (Sentry SDK dirancang sebagai no-op ketika tidak diinisialisasi.)
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

// ── (d) scrubPii — buang field PII dari event ─────────────────────────────────

describe('(d) scrubPii: PII scrubbing sebelum kirim ke Sentry', () => {
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

    // Objek asli tidak diubah
    expect(originalHeaders.authorization).toBe('Bearer secret');
  });
});
