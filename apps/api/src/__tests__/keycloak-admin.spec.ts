// =============================================================================
// keycloak-admin.spec.ts — Unit tests KeycloakAdminService
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException, ConflictException } from '@nestjs/common';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { logger } from '@smk/logger';

const BASE_URL = 'http://localhost:8080';
const REALM = 'diis';
const ADMIN_URL = `${BASE_URL}/admin/realms/${REALM}`;
const TOKEN_URL = `${BASE_URL}/realms/${REALM}/protocol/openid-connect/token`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status: number, location?: string): Response {
  const headers: Record<string, string> = {};
  if (location) headers['Location'] = location;
  return new Response(null, { status, headers });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });
}

function mockTokenRes() {
  return {
    access_token: 'tok-test-123',
    expires_in: 300,
    refresh_expires_in: 1800,
    token_type: 'Bearer',
    scope: 'profile',
  };
}

function mockUser(id: string, username: string) {
  return {
    id, username,
    email: `${username}@test.com`,
    firstName: 'Test',
    lastName: 'User',
    enabled: true,
    emailVerified: false,
    createdTimestamp: Date.now(),
  };
}

function mockRole(name: string) {
  return {
    id: `role-${name}`,
    name,
    composite: false,
    clientRole: false,
    containerId: REALM,
  };
}

async function buildService(): Promise<KeycloakAdminService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [KeycloakAdminService],
  }).compile();
  return module.get(KeycloakAdminService);
}

describe('KeycloakAdminService', () => {
  let service: KeycloakAdminService;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    service = await buildService();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function fetchMock(): jest.Mock {
    return global.fetch as jest.Mock;
  }

  function respondToToken(): void {
    fetchMock().mockResolvedValueOnce(jsonResponse(mockTokenRes()));
  }

  // ── Token caching ───────────────────────────────────────────────────────────

  it('token di-cache antar panggilan — hanya 1 token request', async () => {
    const calls: string[] = [];
    fetchMock().mockImplementation((url: string) => {
      calls.push(url);
      if (url === TOKEN_URL) return Promise.resolve(jsonResponse(mockTokenRes()));
      if (url.includes('/users') && url.includes('?username'))
        return Promise.resolve(jsonResponse([mockUser('u1', 'found')]));
      return Promise.resolve(emptyResponse(204));
    });

    await service.findByUsername('buddy');
    await service.findByUsername('other');

    const tokenCount = calls.filter((c) => c === TOKEN_URL).length;
    expect(tokenCount).toBe(1);
  });

  // ── createUser ──────────────────────────────────────────────────────────────

  it('createUser → parse header Location → return kcId', async () => {
    respondToToken();
    fetchMock().mockResolvedValueOnce(
      emptyResponse(201, `${ADMIN_URL}/users/kc-new-user-123`),
    );

    const kcId = await service.createUser({
      username: 'testuser',
      email: 'test@test.com',
      firstName: 'Test',
      lastName: 'User',
      enabled: true,
    });

    expect(kcId).toBe('kc-new-user-123');
  });

  // ── 5xx retry ───────────────────────────────────────────────────────────────

  it('5xx → retry 1x → masih 5xx → ServiceUnavailableException', async () => {
    let execCount = 0;
    fetchMock().mockImplementation((url: string) => {
      if (url === TOKEN_URL) return Promise.resolve(jsonResponse(mockTokenRes()));
      execCount++;
      return Promise.resolve(textResponse('Internal Error', 503));
    });

    await expect(
      service.createUser({
        username: 'test', email: 't@t.com', firstName: 'A', lastName: 'B', enabled: true,
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(execCount).toBe(2);
  });

  // ── 4xx tidak di-retry ─────────────────────────────────────────────────────

  it('4xx tidak di-retry', async () => {
    let execCount = 0;
    fetchMock().mockImplementation((url: string) => {
      if (url === TOKEN_URL) return Promise.resolve(jsonResponse(mockTokenRes()));
      execCount++;
      return Promise.resolve(jsonResponse({ error: 'Conflict' }, 409));
    });

    await expect(
      service.createUser({
        username: 'dup', email: 'dup@test.com', firstName: 'A', lastName: 'B', enabled: true,
      }),
    ).rejects.toThrow(ConflictException);

    expect(execCount).toBe(1);
  });

  // ── 401 → refresh token paksa + ulang ──────────────────────────────────────

  it('401 → refresh token paksa → ulangi request', async () => {
    let tokenCount = 0;
    let userCallCount = 0;

    fetchMock().mockImplementation((url: string) => {
      if (url === TOKEN_URL) {
        tokenCount++;
        return Promise.resolve(jsonResponse(mockTokenRes()));
      }
      if (url.includes('/users') && url.includes('?username')) {
        userCallCount++;
        if (userCallCount === 1) {
          return Promise.resolve(textResponse('Unauthorized', 401));
        }
        return Promise.resolve(jsonResponse([mockUser('ux', 'found')]));
      }
      return Promise.resolve(emptyResponse(204));
    });

    const result = await service.findByUsername('found');
    expect(result?.username).toBe('found');
    expect(tokenCount).toBeGreaterThanOrEqual(2);
  });

  // ── assignRealmRole = GET role + POST mapping ───────────────────────────────

  it('assignRealmRole → GET role + POST mapping', async () => {
    let roleGETCalled = false;
    let mappingPOSTCalled = false;

    fetchMock().mockImplementation((url: string, opts?: RequestInit) => {
      if (url === TOKEN_URL) return Promise.resolve(jsonResponse(mockTokenRes()));
      if (url === `${ADMIN_URL}/roles/GURU`) {
        roleGETCalled = true;
        return Promise.resolve(jsonResponse(mockRole('GURU')));
      }
      if (url === `${ADMIN_URL}/users/kc-1/role-mappings/realm` && opts?.method === 'POST') {
        mappingPOSTCalled = true;
        return Promise.resolve(emptyResponse(204));
      }
      return Promise.resolve(emptyResponse(204));
    });

    await service.assignRealmRole('kc-1', 'GURU');

    expect(roleGETCalled).toBe(true);
    expect(mappingPOSTCalled).toBe(true);
  });

  // ── Password TIDAK muncul di argumen logger ────────────────────────────────

  it('password TIDAK muncul di argumen logger (spy)', async () => {
    const errorSpy = logger.error as jest.Mock;

    fetchMock().mockImplementation((url: string) => {
      if (url === TOKEN_URL) return Promise.resolve(jsonResponse(mockTokenRes()));
      if (url.includes('/reset-password'))
        return Promise.resolve(textResponse('Server Error', 500));
      return Promise.resolve(emptyResponse(204));
    });

    await expect(
      service.setTempPassword('kc-x', 'SuperSecret123!'),
    ).rejects.toThrow(ServiceUnavailableException);

    const allCalls = errorSpy.mock.calls.flatMap((c) => c.map(String));
    const combined = allCalls.join(' ');
    expect(combined).not.toContain('SuperSecret123!');
  });

  // ── findByUsername / findByEmail ────────────────────────────────────────────

  it('findByUsername → user ditemukan', async () => {
    respondToToken();
    fetchMock().mockResolvedValueOnce(jsonResponse([mockUser('kc-buddy', 'buddy')]));

    const user = await service.findByUsername('buddy');
    expect(user?.username).toBe('buddy');
  });

  it('findByUsername → user tidak ditemukan', async () => {
    respondToToken();
    fetchMock().mockResolvedValueOnce(jsonResponse([]));

    const user = await service.findByUsername('nobody');
    expect(user).toBeNull();
  });

  it('findByEmail → user ditemukan', async () => {
    respondToToken();
    fetchMock().mockResolvedValueOnce(jsonResponse([mockUser('kc-em', 'emuser')]));

    const user = await service.findByEmail('emuser@test.com');
    expect(user?.id).toBe('kc-em');
  });

  // ── getUserRealmRoles ─────────────────────────────────────────────────────

  it('getUserRealmRoles → array nama role', async () => {
    respondToToken();
    fetchMock().mockResolvedValueOnce(jsonResponse([mockRole('GURU'), mockRole('SISWA')]));

    const roles = await service.getUserRealmRoles('kc-1');
    expect(roles).toEqual(['GURU', 'SISWA']);
  });

  // ── deleteUser ──────────────────────────────────────────────────────────────

  it('deleteUser → 204 OK', async () => {
    respondToToken();
    fetchMock().mockResolvedValueOnce(emptyResponse(204));

    await expect(service.deleteUser('kc-del')).resolves.toBeUndefined();
  });
});
