// =============================================================================
// KeycloakAdminService — Operasi Keycloak Admin REST API via service account.
//
// Token: client_credentials grant, di-cache, auto-refresh 30 dtk sebelum exp.
// Semua panggilan fail-closed: 5xx → retry 1× → ServiceUnavailableException.
// Password TIDAK PERNAH muncul di log atau pesan error.
// =============================================================================

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { logger } from '@smk/logger';
import {
  KcUserRepresentation,
  KcRoleRepresentation,
  CreateKcUserInput,
  KcTokenResponse,
  KcTokenCache,
} from './keycloak-admin.types';

const BASE_URL = `${process.env.KEYCLOAK_URL || 'http://localhost:8080'}`;
const REALM = process.env.KEYCLOAK_REALM || 'diis';
const ADMIN_URL = `${BASE_URL}/admin/realms/${REALM}`;
const TOKEN_URL = `${BASE_URL}/realms/${REALM}/protocol/openid-connect/token`;

const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'diis-api';
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';

@Injectable()
export class KeycloakAdminService {
  private tokenCache: KcTokenCache | null = null;
  private roleCache = new Map<string, KcRoleRepresentation>();

  // ── Token ───────────────────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && now < this.tokenCache.expiresAt - 30_000) {
      return this.tokenCache.accessToken;
    }
    return this.fetchToken();
  }

  private async fetchToken(): Promise<string> {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    const res = await this.rawFetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = (await res.json()) as KcTokenResponse;
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 30) * 1000,
    };

    return data.access_token;
  }

  // ── Request wrapper (fetch + AbortController timeout 10 dtk, retry 1×) ─────

  private async request<T>(
    url: string,
    opts: RequestInit & { retryAttempt?: number },
  ): Promise<{ status: number; data: T; location?: string }> {
    const maxRetries = opts.retryAttempt !== undefined ? opts.retryAttempt : 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      try {
        const token = await this.getAccessToken();
        const res = await fetch(url, {
          ...opts,
          headers: {
            ...(opts.headers as Record<string, string>),
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (res.status === 401 && attempt === 0) {
          this.tokenCache = null;
          clearTimeout(timeout);
          continue;
        }

        if (res.status >= 500 && attempt < maxRetries) {
          logger.warn(`[KC Admin] 5xx retry ${attempt + 1}/${maxRetries}`, {
            status: res.status,
            path: url.replace(ADMIN_URL, ''),
          });
          clearTimeout(timeout);
          continue;
        }

        if (!res.ok) {
          throw this.httpError(res.status, url);
        }

        if (res.status === 204) {
          clearTimeout(timeout);
          return { status: 204, data: undefined as unknown as T };
        }

        let data: T;
        const location = res.headers.get('location') || undefined;

        if (res.headers.get('content-type')?.includes('application/json')) {
          data = (await res.json()) as T;
        } else {
          data = (await res.text()) as unknown as T;
        }

        clearTimeout(timeout);
        return { status: res.status, data, location };
      } catch (err: unknown) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new ServiceUnavailableException(
            'Keycloak Admin API tidak tersedia — operasi dibatalkan',
          );
        }
        if (err instanceof ServiceUnavailableException || err instanceof ConflictException) {
          throw err;
        }
        throw new ServiceUnavailableException(
          'Keycloak Admin API tidak tersedia — operasi dibatalkan',
        );
      }
    }

    throw new ServiceUnavailableException(
      'Keycloak Admin API tidak tersedia — operasi dibatalkan',
    );
  }

  private async rawFetch(url: string, opts: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      if (!res.ok) {
        throw new ServiceUnavailableException(
          `Keycloak Auth API error ${res.status}`,
        );
      }
      return res;
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(
        'Keycloak Auth API tidak tersedia',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Error handling ──────────────────────────────────────────────────────────

  private httpError(status: number, url: string): Error {
    const path = url.replace(ADMIN_URL, '');
    logger.error(`[KC Admin] HTTP ${status}`, { path });

    if (status === 400) {
      return new BadRequestException('Request tidak valid ke Keycloak Admin');
    }
    // TF2-P0-KS-2: Tambah handler 403 eksplisit. Sebelumnya 403 jatuh ke
    // fallback generic `ServiceUnavailableException(error 403)` yang
    // menyesatkan diagnosis — admin mengira Keycloak tidak tersedia padahal
    // masalahnya izin service account (lihat P0-KS-1 di audit).
    if (status === 403) {
      return new ForbiddenException(
        'Keycloak menolak akses — periksa izin service account (butuh realm-admin atau manage-realm) atau hubungi admin',
      );
    }
    if (status === 404) {
      return new NotFoundException('Resource tidak ditemukan di Keycloak');
    }
    if (status === 409) {
      return new ConflictException('User sudah ada di Keycloak');
    }
    if (status >= 500) {
      return new ServiceUnavailableException(
        'Keycloak Admin API tidak tersedia — operasi dibatalkan',
      );
    }

    return new ServiceUnavailableException(
      `Keycloak Admin API error ${status}`,
    );
  }

  // ── User CRUD ───────────────────────────────────────────────────────────────

  async createUser(input: CreateKcUserInput): Promise<string> {
    const { status, location } = await this.request<unknown>(`${ADMIN_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      retryAttempt: 1,
    });

    if (status === 201 && location) {
      return location.split('/').pop()!;
    }
    throw new ServiceUnavailableException('Keycloak: gagal membaca user ID dari respons');
  }

  async setTempPassword(kcId: string, password: string): Promise<void> {
    await this.request(`${ADMIN_URL}/users/${kcId}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'password', value: password, temporary: true }),
      retryAttempt: 1,
    });
  }

  async assignRealmRole(kcId: string, roleName: string): Promise<void> {
    const role = await this.resolveRealmRole(roleName);
    await this.request(`${ADMIN_URL}/users/${kcId}/role-mappings/realm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([role]),
      retryAttempt: 1,
    });
  }

  async removeRealmRole(kcId: string, roleName: string): Promise<void> {
    const role = await this.resolveRealmRole(roleName);
    await this.request(`${ADMIN_URL}/users/${kcId}/role-mappings/realm`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([role]),
      retryAttempt: 1,
    });
  }

  async setEnabled(kcId: string, enabled: boolean): Promise<void> {
    await this.request(`${ADMIN_URL}/users/${kcId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
      retryAttempt: 1,
    });
  }

  async findByUsername(username: string): Promise<KcUserRepresentation | null> {
    const { data } = await this.request<KcUserRepresentation[]>(
      `${ADMIN_URL}/users?username=${encodeURIComponent(username)}&exact=true`,
      { method: 'GET', retryAttempt: 1 },
    );
    return (data as unknown as KcUserRepresentation[])?.[0] ?? null;
  }

  async findByEmail(email: string): Promise<KcUserRepresentation | null> {
    const { data } = await this.request<KcUserRepresentation[]>(
      `${ADMIN_URL}/users?email=${encodeURIComponent(email)}&exact=true`,
      { method: 'GET', retryAttempt: 1 },
    );
    return (data as unknown as KcUserRepresentation[])?.[0] ?? null;
  }

  async getUserRealmRoles(kcId: string): Promise<string[]> {
    const { data } = await this.request<KcRoleRepresentation[]>(
      `${ADMIN_URL}/users/${kcId}/role-mappings/realm`,
      { method: 'GET', retryAttempt: 1 },
    );
    return (data as unknown as KcRoleRepresentation[]).map((r) => r.name);
  }

  /**
   * Hapus user dari Keycloak — HANYA untuk kompensasi saga.
   * JANGAN dipanggil langsung dari endpoint publik.
   */
  async deleteUser(kcId: string): Promise<void> {
    await this.request(`${ADMIN_URL}/users/${kcId}`, {
      method: 'DELETE',
      retryAttempt: 1,
    });
  }

  // ── Role resolution ─────────────────────────────────────────────────────────

  /**
   * Cari realm role berdasarkan nama. Return null jika tidak ada (404).
   * Public method — digunakan oleh PositionsService untuk cek eksistensi role.
   */
  async findRealmRole(name: string): Promise<KcRoleRepresentation | null> {
    try {
      const { data } = await this.request<KcRoleRepresentation>(
        `${ADMIN_URL}/roles/${encodeURIComponent(name)}`,
        { method: 'GET', retryAttempt: 1 },
      );
      return data as unknown as KcRoleRepresentation;
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      throw err;
    }
  }

  /**
   * Buat realm role baru di Keycloak.
   * @throws ConflictException jika role sudah ada (409).
   */
  async createRealmRole(name: string, description?: string): Promise<void> {
    await this.request(`${ADMIN_URL}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
      retryAttempt: 1,
    });
    // Invalidate cache agar resolveRealmRole bisa menemukan role baru
    this.roleCache.delete(name);
  }

  /**
   * Buat realm role jika belum ada (idempotent).
   * @returns 'created' jika role baru dibuat, 'existing' jika sudah ada.
   */
  async createRealmRoleIfNotExists(
    name: string,
    description?: string,
  ): Promise<'created' | 'existing'> {
    const existing = await this.findRealmRole(name);
    if (existing) return 'existing';

    await this.createRealmRole(name, description);
    return 'created';
  }

  /**
   * Resolve realm role untuk assign/remove — throw NotFoundException jika tidak ada.
   * Menggunakan cache untuk menghindari round-trip berulang.
   */
  private async resolveRealmRole(name: string): Promise<KcRoleRepresentation> {
    const cached = this.roleCache.get(name);
    if (cached) return cached;

    const role = await this.findRealmRole(name);
    if (!role) {
      throw new NotFoundException(
        `Role "${name}" tidak ditemukan di Keycloak. Jalankan POST /positions/sync-roles untuk seed role.`,
      );
    }

    this.roleCache.set(name, role);
    return role;
  }
}
