// =============================================================================
// prisma-exception-filter.spec.ts — Unit tests untuk PrismaExceptionFilter
//
// Skenario:
//   P2002 → 409 Conflict
//   P2003 → 409 Conflict
//   P2025 → 404 Not Found
//   kode lain (P2001) → 500 Internal Server Error + logError
// =============================================================================

const mockLogError = jest.fn();
jest.mock('@smk/logger', () => ({ logError: mockLogError }));

import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from '../common/filters/prisma-exception.filter';

// ── Helper ────────────────────────────────────────────────────────────────────

function buildHost(url = '/api/v1/grades'): {
  host: ArgumentsHost;
  getStatus: () => number;
  getBody: () => Record<string, unknown>;
} {
  const sendMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ send: sendMock });

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status: statusMock }),
      getRequest: () => ({ url }),
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    getStatus: () => statusMock.mock.calls[0][0] as number,
    getBody: () => sendMock.mock.calls[0][0] as Record<string, unknown>,
  };
}

function makePrismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('msg', {
    code,
    clientVersion: '5.0.0',
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PrismaExceptionFilter', () => {
  let filter: PrismaExceptionFilter;

  beforeEach(() => {
    filter = new PrismaExceptionFilter();
    jest.clearAllMocks();
  });

  it('P2002 (unique violation) → 409 Conflict', () => {
    const { host, getStatus, getBody } = buildHost('/api/v1/grades');
    filter.catch(makePrismaError('P2002'), host);

    expect(getStatus()).toBe(HttpStatus.CONFLICT);
    const body = getBody();
    expect(body['statusCode']).toBe(409);
    expect(body['error']).toBe('Conflict');
    expect(body['prismaCode']).toBe('P2002');
  });

  it('P2003 (FK restrict) → 409 Conflict', () => {
    const { host, getStatus, getBody } = buildHost();
    filter.catch(makePrismaError('P2003'), host);

    expect(getStatus()).toBe(HttpStatus.CONFLICT);
    expect(getBody()['prismaCode']).toBe('P2003');
  });

  it('P2025 (record not found) → 404 Not Found', () => {
    const { host, getStatus, getBody } = buildHost();
    filter.catch(makePrismaError('P2025'), host);

    expect(getStatus()).toBe(HttpStatus.NOT_FOUND);
    const body = getBody();
    expect(body['statusCode']).toBe(404);
    expect(body['error']).toBe('Not Found');
    expect(body['prismaCode']).toBe('P2025');
  });

  it('kode tidak dikenal (P2001) → 500 + logError dipanggil', () => {
    const { host, getStatus, getBody } = buildHost('/api/v1/grades');
    filter.catch(makePrismaError('P2001'), host);

    expect(getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(getBody()['statusCode']).toBe(500);
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledWith(
      'Unhandled Prisma error',
      expect.objectContaining({ code: 'P2001' }),
      expect.objectContaining({ path: '/api/v1/grades' }),
    );
  });

  it('body response menyertakan timestamp dan path', () => {
    const { host, getBody } = buildHost('/api/v1/test');
    filter.catch(makePrismaError('P2002'), host);

    const body = getBody();
    expect(body['path']).toBe('/api/v1/test');
    expect(typeof body['timestamp']).toBe('string');
    expect(() => new Date(body['timestamp'] as string)).not.toThrow();
  });
});
