// =============================================================================
// exception-filter.spec.ts — Unit tests untuk HttpExceptionFilter (Item 6)
// W3-03 Security Hardening: stack trace tidak bocor ke client di production
// =============================================================================

// mock* variable hoisting pattern (ts-jest/babel-jest compatible)
const mockLogError = jest.fn();

jest.mock('@smk/logger', () => ({
  logError: mockLogError,
}));

import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildHost(url = '/api/v1/test', method = 'GET'): {
  host: ArgumentsHost;
  getSendArg: () => Record<string, unknown>;
  getStatusArg: () => number;
} {
  const sendMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ send: sendMock });

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status: statusMock }),
      getRequest: () => ({ url, method }),
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    getSendArg: () => sendMock.mock.calls[0][0] as Record<string, unknown>,
    getStatusArg: () => statusMock.mock.calls[0][0] as number,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('HttpExceptionFilter — Error Response Format (Item 6)', () => {
  let filter: HttpExceptionFilter;
  let savedNodeEnv: string | undefined;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    savedNodeEnv = process.env.NODE_ENV;
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
  });

  describe('HttpException (4xx / 5xx terketahui)', () => {
    it('HttpException 404 → statusCode=404 + message + error + timestamp + path', () => {
      const { host, getSendArg, getStatusArg } = buildHost('/api/v1/students/99');
      const exception = new HttpException('Resource not found', HttpStatus.NOT_FOUND);

      filter.catch(exception, host);

      expect(getStatusArg()).toBe(404);
      const body = getSendArg();
      expect(body['statusCode']).toBe(404);
      expect(body['message']).toBe('Resource not found');
      expect(body['error']).toBeDefined();
      expect(body['timestamp']).toBeDefined();
      expect(body['path']).toBe('/api/v1/students/99');
    });

    it('HttpException 401 → statusCode=401', () => {
      const { host, getSendArg, getStatusArg } = buildHost('/api/v1/protected');
      const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

      filter.catch(exception, host);

      expect(getStatusArg()).toBe(401);
      expect(getSendArg()['statusCode']).toBe(401);
    });

    it('HttpException dengan object response → message dan error di-extract', () => {
      const { host, getSendArg } = buildHost();
      const exception = new HttpException(
        { message: ['Field required', 'NIS harus 5-20 karakter'], error: 'Validation Error', statusCode: 400 },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, host);

      const body = getSendArg();
      expect(body['statusCode']).toBe(400);
      expect(body['message']).toEqual(['Field required', 'NIS harus 5-20 karakter']);
      expect(body['error']).toBe('Validation Error');
    });

    it('timestamp adalah ISO string yang valid', () => {
      const { host, getSendArg } = buildHost();
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, host);

      const timestamp = getSendArg()['timestamp'] as string;
      expect(() => new Date(timestamp)).not.toThrow();
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('path di response sesuai dengan request.url', () => {
      const { host, getSendArg } = buildHost('/api/v1/keuangan/spp');
      const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

      filter.catch(exception, host);

      expect(getSendArg()['path']).toBe('/api/v1/keuangan/spp');
    });
  });

  describe('non-HttpException — production vs development', () => {
    it('non-HttpException di production → message generik, tidak expose detail internal', () => {
      process.env.NODE_ENV = 'production';
      const { host, getSendArg, getStatusArg } = buildHost();
      const exception = new Error('DB_PASSWORD=secret123 connection failed');

      filter.catch(exception, host);

      expect(getStatusArg()).toBe(500);
      const body = getSendArg();
      expect(body['message']).toBe('Terjadi kesalahan pada server');
      // Pastikan secret TIDAK bocor ke response
      expect(JSON.stringify(body)).not.toContain('secret123');
      expect(JSON.stringify(body)).not.toContain('DB_PASSWORD');
    });

    it('non-HttpException di development → message = exception.message (debugging enabled)', () => {
      process.env.NODE_ENV = 'development';
      const { host, getSendArg } = buildHost();
      const exception = new Error('Connection timed out after 30s');

      filter.catch(exception, host);

      expect(getSendArg()['message']).toBe('Connection timed out after 30s');
    });

    it('non-HttpException → logError dipanggil untuk internal tracking', () => {
      process.env.NODE_ENV = 'production';
      const { host } = buildHost('/api/v1/broken');
      const exception = new Error('Unexpected crash');

      filter.catch(exception, host);

      expect(mockLogError).toHaveBeenCalledTimes(1);
      expect(mockLogError).toHaveBeenCalledWith(
        'Unhandled exception',
        exception,
        expect.objectContaining({ path: '/api/v1/broken' }),
      );
    });

    it('non-HttpException → statusCode=500 (Internal Server Error)', () => {
      const { host, getSendArg, getStatusArg } = buildHost();
      const exception = new Error('Anything');

      filter.catch(exception, host);

      expect(getStatusArg()).toBe(500);
      expect(getSendArg()['statusCode']).toBe(500);
    });
  });

  describe('stack trace tidak bocor ke client', () => {
    it('response body tidak menyertakan field "stack" apapun', () => {
      process.env.NODE_ENV = 'production';
      const { host, getSendArg } = buildHost();
      const exception = new Error('Error with stack trace info');

      filter.catch(exception, host);

      const responseStr = JSON.stringify(getSendArg());
      expect(responseStr).not.toContain('stack');
      expect(responseStr).not.toContain('at Object.<anonymous>');
    });
  });
});
