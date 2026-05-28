// =============================================================================
// logging.spec.ts — Unit tests untuk LoggingInterceptor (Item 5)
// W3-03 Security Hardening: audit logging setiap request
// =============================================================================

// mock* variable hoisting pattern (ts-jest/babel-jest compatible)
// Variabel dengan prefix "mock" di-hoist bersamaan dengan jest.mock() factory.
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@smk/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildContext(
  method = 'GET',
  url = '/api/v1/test',
  userId?: string,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        url,
        user: userId ? { keycloakId: userId } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

function buildHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

function buildErrorHandler(error: Error): CallHandler {
  return { handle: () => throwError(() => error) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LoggingInterceptor — Audit Log Setiap Request (Item 5)', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    jest.clearAllMocks();
  });

  describe('request berhasil', () => {
    it('GET request berhasil → logger.info dipanggil tepat 1 kali', (done) => {
      const ctx = buildContext('GET', '/api/v1/students');
      const handler = buildHandler({ students: [] });

      interceptor.intercept(ctx, handler).subscribe({
        complete: () => {
          expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
          done();
        },
      });
    });

    it('log memuat method, url, dan duration', (done) => {
      const ctx = buildContext('GET', '/api/v1/students');
      const handler = buildHandler({ students: [] });

      interceptor.intercept(ctx, handler).subscribe({
        complete: () => {
          const [message, meta] = mockLoggerInfo.mock.calls[0] as [string, Record<string, unknown>];
          expect(message).toContain('GET');
          expect(message).toContain('/api/v1/students');
          expect(typeof meta['duration']).toBe('number');
          expect((meta['duration'] as number)).toBeGreaterThanOrEqual(0);
          done();
        },
      });
    });

    it('meta log memiliki type="request", method, url', (done) => {
      const ctx = buildContext('POST', '/api/v1/finance');
      const handler = buildHandler({ id: 'new-record' });

      interceptor.intercept(ctx, handler).subscribe({
        complete: () => {
          const [, meta] = mockLoggerInfo.mock.calls[0] as [string, Record<string, unknown>];
          expect(meta['type']).toBe('request');
          expect(meta['method']).toBe('POST');
          expect(meta['url']).toBe('/api/v1/finance');
          done();
        },
      });
    });

    it('request dengan user terautentikasi → meta log menyertakan userId', (done) => {
      const ctx = buildContext('GET', '/api/v1/profile', 'kc-user-abc123');
      const handler = buildHandler({ name: 'Alice' });

      interceptor.intercept(ctx, handler).subscribe({
        complete: () => {
          const [, meta] = mockLoggerInfo.mock.calls[0] as [string, Record<string, unknown>];
          expect(meta['userId']).toBe('kc-user-abc123');
          done();
        },
      });
    });

    it('logger.error TIDAK dipanggil saat request berhasil', (done) => {
      const ctx = buildContext('GET', '/api/v1/students');
      const handler = buildHandler({ data: [] });

      interceptor.intercept(ctx, handler).subscribe({
        complete: () => {
          expect(mockLoggerError).not.toHaveBeenCalled();
          done();
        },
      });
    });
  });

  describe('request error', () => {
    it('request error → logger.error dipanggil tepat 1 kali', (done) => {
      const ctx = buildContext('POST', '/api/v1/students');
      const handler = buildErrorHandler(new Error('Database connection failed'));

      interceptor.intercept(ctx, handler).subscribe({
        error: () => {
          expect(mockLoggerError).toHaveBeenCalledTimes(1);
          done();
        },
      });
    });

    it('log error memuat method, url, error.message, dan duration', (done) => {
      const ctx = buildContext('DELETE', '/api/v1/students/99');
      const handler = buildErrorHandler(new Error('Record not found'));

      interceptor.intercept(ctx, handler).subscribe({
        error: () => {
          const [message, meta] = mockLoggerError.mock.calls[0] as [string, Record<string, unknown>];
          expect(message).toContain('DELETE');
          expect(message).toContain('/api/v1/students/99');
          expect(message).toContain('ERROR');
          expect(meta['error']).toBe('Record not found');
          expect(meta['type']).toBe('request_error');
          expect(typeof meta['duration']).toBe('number');
          done();
        },
      });
    });

    it('logger.info TIDAK dipanggil saat request error', (done) => {
      const ctx = buildContext('PUT', '/api/v1/students/1');
      const handler = buildErrorHandler(new Error('Unexpected error'));

      interceptor.intercept(ctx, handler).subscribe({
        error: () => {
          expect(mockLoggerInfo).not.toHaveBeenCalled();
          done();
        },
      });
    });
  });
});
