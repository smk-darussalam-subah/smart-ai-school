// =============================================================================
// audit-interceptor.spec.ts — Unit tests AuditInterceptor
//
// 4 kasus wajib (O-02 runtime rule):
//   (a) mutasi POST → entri ditulis dengan field benar
//   (b) GET → TIDAK ditulis
//   (c) field sensitif (password) ter-redaksi "[REDACTED]"
//   (d) audit insert throw → request tetap sukses (fail-soft)
// =============================================================================

// Deklarasi mock sebelum jest.mock() — wajib untuk ts-jest hoisting
const mockCreate = jest.fn();

jest.mock('@smk/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { AuditInterceptor } from '../audit-log/interceptors/audit.interceptor';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AUDIT_KEY, SKIP_AUDIT_KEY } from '../audit-log/decorators/audit.decorator';

// ── Helpers ──────────────────────────────────────────────────────────────────

interface BuildContextOpts {
  method?: string;
  url?: string;
  user?: Record<string, unknown>;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  headers?: Record<string, string | string[]>;
}

function buildContext(opts: BuildContextOpts = {}): ExecutionContext {
  const {
    method = 'POST',
    url = '/api/v1/students',
    user,
    body = {},
    params = {},
    headers = {},
  } = opts;

  const req = { method, url, user, body, params, headers, ip: '127.0.0.1' };

  return {
    getHandler: () => function testHandler() { return; },
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
}

function buildHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

function buildErrorHandler(err: Error): CallHandler {
  return { handle: () => throwError(() => err) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditInterceptor,
        { provide: AuditLogService, useValue: { create: mockCreate } },
        Reflector,
      ],
    }).compile();

    interceptor = module.get<AuditInterceptor>(AuditInterceptor);
    reflector = module.get<Reflector>(Reflector);
    jest.clearAllMocks();
    mockCreate.mockResolvedValue(undefined);
  });

  // (a) POST mutasi → entri ditulis dengan semua field benar
  it('(a) POST mutasi → create dipanggil, field actorId/action/outcome/resourceId benar', (done) => {
    const ctx = buildContext({
      method: 'POST',
      url: '/api/v1/students',
      user: { keycloakId: 'kc-uuid-sa', username: 'admin', roles: ['SUPER_ADMIN'] },
    });
    const handler = buildHandler({ id: 'stu-new-id', name: 'Budi' });

    interceptor.intercept(ctx, handler).subscribe({
      next: () => { /* nilai diproses oleh tap terlebih dulu */ },
      complete: () => {
        expect(mockCreate).toHaveBeenCalledTimes(1);
        const arg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
        expect(arg['actorId']).toBe('kc-uuid-sa');
        expect(arg['actorUsername']).toBe('admin');
        expect(arg['actorRoles']).toEqual(['SUPER_ADMIN']);
        expect(arg['method']).toBe('POST');
        expect(arg['path']).toBe('/api/v1/students');
        expect(arg['resourceType']).toBe('students');
        expect(arg['action']).toBe('students.create');
        expect(arg['statusCode']).toBe(201);
        expect(arg['outcome']).toBe('success');
        expect(arg['resourceId']).toBe('stu-new-id');
        done();
      },
      error: (e: unknown) => done.fail(String(e)),
    });
  });

  // (b) GET → TIDAK dicatat
  it('(b) GET request → create TIDAK dipanggil', (done) => {
    const ctx = buildContext({ method: 'GET', url: '/api/v1/students' });
    const handler = buildHandler([{ id: '1' }]);

    interceptor.intercept(ctx, handler).subscribe({
      complete: () => {
        expect(mockCreate).not.toHaveBeenCalled();
        done();
      },
      error: (e: unknown) => done.fail(String(e)),
    });
  });

  // (c) field sensitif ter-redaksi — captureBody: true
  it('(c) captureBody=true + field password → ter-redaksi "[REDACTED]", field biasa tetap', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === SKIP_AUDIT_KEY) return undefined;
      if (key === AUDIT_KEY) return { captureBody: true };
      return undefined;
    });

    const ctx = buildContext({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      body: {
        currentPassword: 'lama123',
        newPassword: 'baru456',
        userId: 'uid-abc',
      },
    });
    const handler = buildHandler({ success: true });

    interceptor.intercept(ctx, handler).subscribe({
      complete: () => {
        expect(mockCreate).toHaveBeenCalledTimes(1);
        const arg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
        const meta = arg['metadata'] as Record<string, unknown>;
        expect(meta).not.toBeNull();
        expect(meta['currentPassword']).toBe('[REDACTED]');
        expect(meta['newPassword']).toBe('[REDACTED]');
        expect(meta['userId']).toBe('uid-abc'); // non-sensitif tetap ada
        done();
      },
      error: (e: unknown) => done.fail(String(e)),
    });
  });

  // (d) fail-soft: audit insert throw → request tetap sukses, observer tidak menerima error
  it('(d) create throw (DB offline) → request tetap sukses, error TIDAK propagate', (done) => {
    mockCreate.mockRejectedValue(new Error('PostgreSQL connection refused'));

    const ctx = buildContext({ method: 'POST', url: '/api/v1/students' });
    const handler = buildHandler({ id: 'xyz', name: 'Test Student' });

    let receivedValue: unknown;
    interceptor.intercept(ctx, handler).subscribe({
      next: (value: unknown) => { receivedValue = value; },
      complete: () => {
        expect(receivedValue).toEqual({ id: 'xyz', name: 'Test Student' });
        done();
      },
      error: () => done.fail('Request TIDAK boleh error ketika audit gagal (fail-soft)'),
    });
  });

  // Hardening 2E: redaksi case-insensitive + bersarang + substring
  it('(c2) redaksi: PASSWORD uppercase, user_password, nested keycloak.clientSecret ter-redaksi', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === SKIP_AUDIT_KEY) return undefined;
      if (key === AUDIT_KEY) return { captureBody: true };
      return undefined;
    });

    const ctx = buildContext({
      method: 'POST',
      url: '/api/v1/users',
      body: {
        PASSWORD: 'rahasia',
        user_password: 'rahasia2',
        xApiKey: 'key-123',
        profile: { fullName: 'Budi', keycloak: { clientSecret: 'ks-secret' } },
        tags: ['a', 'b'],
        nama: 'aman',
      },
    });

    interceptor.intercept(ctx, buildHandler({ id: 'u1' })).subscribe({
      complete: () => {
        const meta = mockCreate.mock.calls[0][0]['metadata'] as Record<string, unknown>;
        expect(meta['PASSWORD']).toBe('[REDACTED]');
        expect(meta['user_password']).toBe('[REDACTED]');
        expect(meta['xApiKey']).toBe('[REDACTED]');
        const profile = meta['profile'] as Record<string, unknown>;
        expect(profile['fullName']).toBe('Budi');
        expect((profile['keycloak'] as Record<string, unknown>)['clientSecret']).toBe('[REDACTED]');
        expect(meta['tags']).toBe('[array:2]');
        expect(meta['nama']).toBe('aman');
        done();
      },
      error: (e: unknown) => done.fail(String(e)),
    });
  });

  // 2J-2: redaksi 'phone' substring
  it('(c3) redaksi phone: key "phone" & nested "parentPhone" → [REDACTED]', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === SKIP_AUDIT_KEY) return undefined;
      if (key === AUDIT_KEY) return { captureBody: true };
      return undefined;
    });

    const ctx = buildContext({
      method: 'POST',
      url: '/api/v1/provision/students',
      body: {
        siswa: { nis: '12345', fullName: 'Siswa A' },
        ortu: { name: 'Ortu A', phone: '+6281234567890', parentPhone: '+6289876543210' },
      },
    });

    interceptor.intercept(ctx, buildHandler({ id: 'st-1' })).subscribe({
      complete: () => {
        const meta = mockCreate.mock.calls[0][0]['metadata'] as Record<string, unknown>;
        const ortu = meta['ortu'] as Record<string, unknown>;
        expect(ortu['phone']).toBe('[REDACTED]');
        // parentPhone contains substring 'phone' → redacted
        expect(ortu['parentPhone']).toBe('[REDACTED]');
        expect(ortu['name']).toBe('Ortu A');
        done();
      },
      error: (e: unknown) => done.fail(String(e)),
    });
  });

  // Hardening 2E: statusCode menghormati @HttpCode handler
  it('statusCode mengikuti @HttpCode metadata bila ada (mis. DELETE 204)', (done) => {
    const handlerFn = function customHandler() { return; };
    Reflect.defineMetadata('__httpCode__', 204, handlerFn);
    const ctx = buildContext({ method: 'DELETE', url: '/api/v1/students/s1', params: { id: 's1' } });
    (ctx as unknown as { getHandler: () => unknown }).getHandler = () => handlerFn;

    interceptor.intercept(ctx, buildHandler(undefined)).subscribe({
      complete: () => {
        expect(mockCreate.mock.calls[0][0]['statusCode']).toBe(204);
        done();
      },
      error: (e: unknown) => done.fail(String(e)),
    });
  });

  // Bonus: PATCH → action "*.update", resourceId dari params.id
  it('PATCH → action "students.update", resourceId dari params.id', (done) => {
    const ctx = buildContext({
      method: 'PATCH',
      url: '/api/v1/students/stu-42',
      params: { id: 'stu-42' },
      user: { keycloakId: 'kc-tu', username: 'tata_usaha', roles: ['TATA_USAHA'] },
    });
    const handler = buildHandler({ id: 'stu-42', name: 'Updated Name' });

    interceptor.intercept(ctx, handler).subscribe({
      complete: () => {
        const arg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
        expect(arg['action']).toBe('students.update');
        expect(arg['resourceId']).toBe('stu-42');
        expect(arg['statusCode']).toBe(200);
        expect(arg['outcome']).toBe('success');
        done();
      },
      error: (e: unknown) => done.fail(String(e)),
    });
  });

  // DELETE → action "*.delete"
  it('DELETE → action "students.delete", resourceId dari params.id', (done) => {
    const ctx = buildContext({
      method: 'DELETE',
      url: '/api/v1/students/stu-del',
      params: { id: 'stu-del' },
      user: { keycloakId: 'kc-sa', username: 'admin', roles: ['SUPER_ADMIN'] },
    });
    const handler = buildHandler(null);

    interceptor.intercept(ctx, handler).subscribe({
      complete: () => {
        const arg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
        expect(arg['action']).toBe('students.delete');
        expect(arg['resourceId']).toBe('stu-del');
        done();
      },
      error: (e: unknown) => done.fail(String(e)),
    });
  });

  // @SkipAudit() → tidak dicatat meski POST
  it('@SkipAudit() pada handler → create TIDAK dipanggil meski POST', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === SKIP_AUDIT_KEY) return true;
      return undefined;
    });

    const ctx = buildContext({ method: 'POST', url: '/api/v1/audit-logs/whatever' });
    const handler = buildHandler({ ok: true });

    interceptor.intercept(ctx, handler).subscribe({
      complete: () => {
        expect(mockCreate).not.toHaveBeenCalled();
        done();
      },
      error: (e: unknown) => done.fail(String(e)),
    });
  });

  // Error path: outcome=failure, statusCode dari HttpException
  it('POST throw NotFoundException → outcome="failure", statusCode=404', (done) => {
    const ctx = buildContext({
      method: 'POST',
      url: '/api/v1/students',
      user: { keycloakId: 'kc-sa', username: 'admin', roles: ['SUPER_ADMIN'] },
    });
    const handler = buildErrorHandler(new NotFoundException('Student not found'));

    interceptor.intercept(ctx, handler).subscribe({
      error: () => {
        expect(mockCreate).toHaveBeenCalledTimes(1);
        const arg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
        expect(arg['outcome']).toBe('failure');
        expect(arg['statusCode']).toBe(404);
        done();
      },
      complete: () => done.fail('Seharusnya error, bukan complete'),
    });
  });

  // Aktor anonim (request tanpa user, mis. endpoint public)
  it('request tanpa user (anonim) → actorId=null, actorRoles=[]', (done) => {
    const ctx = buildContext({
      method: 'POST',
      url: '/api/v1/ppdb/leads',
      user: undefined,
    });
    const handler = buildHandler({ id: 'lead-1' });

    interceptor.intercept(ctx, handler).subscribe({
      complete: () => {
        const arg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
        expect(arg['actorId']).toBeNull();
        expect(arg['actorRoles']).toEqual([]);
        done();
      },
      error: (e: unknown) => done.fail(String(e)),
    });
  });

  // IP extraction: x-forwarded-for diambil pertama
  it('x-forwarded-for multi-hop → IP pertama yang diambil', (done) => {
    const ctx = buildContext({
      method: 'POST',
      url: '/api/v1/students',
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1, 172.16.0.1' },
    });
    const handler = buildHandler({ id: 'x' });

    interceptor.intercept(ctx, handler).subscribe({
      complete: () => {
        const arg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
        expect(arg['ip']).toBe('203.0.113.1');
        done();
      },
      error: (e: unknown) => done.fail(String(e)),
    });
  });
});
