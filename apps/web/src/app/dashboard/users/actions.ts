'use server';

import { revalidatePath } from 'next/cache';
import { apiAction } from '@/lib/server-actions';

// TF2-P1-2: accessCheckAction sudah ada di struktur-organisasi/actions.ts.
// Re-export type AccessCheckResult untuk dipakai component UsersClient.
// Note: type-only import di file 'use server' tidak boleh di-re-export sebagai
// runtime export (Next.js menolak). Component import type langsung dari sini.
export type { AccessCheckResult } from '../struktur-organisasi/actions';

// TF2-P0-NEW-1 (Opsi B): Import type PermissionItem dari page.tsx (sudah
// di-export dari sana). Dipakai oleh fetchPermissionCatalog return type.
import type { PermissionItem } from './page';

// Re-export action secara runtime lewat proxy async wrapper agar tetap compliant
// dengan aturan Next.js 'use server' (hanya async function yang boleh di-export).
export async function accessCheckAction(userId: string) {
  // Dynamic import menghindari cycle + menjaga 'use server' boundary.
  const { accessCheckAction: original } = await import('../struktur-organisasi/actions');
  return original(userId);
}

export async function updateUserRole(userId: string, role: string) {
  const result = await apiAction(`/users/${userId}/role`, 'PATCH', { role });
  if (!result.error) revalidatePath('/dashboard/users');
  return result;
}

export async function updateUserActive(userId: string, isActive: boolean) {
  const result = await apiAction(`/users/${userId}/active`, 'PATCH', { isActive });
  if (!result.error) revalidatePath('/dashboard/users');
  return result;
}

export async function grantUserPermission(userId: string, permissionId: string, grant: boolean) {
  return apiAction(`/permissions/users/${userId}/grant`, 'POST', { permissionId, grant });
}

export async function revokeUserPermission(userId: string, permissionId: string) {
  return apiAction(`/permissions/users/${userId}/revoke?permissionId=${permissionId}`, 'DELETE');
}

export async function fetchUserOverrides(userId: string) {
  return apiAction(`/permissions/users/${userId}`, 'GET');
}

export async function fetchEffectivePermissions(userId: string) {
  return apiAction<{ permissions: string[] }>(`/users/${userId}/effective-permissions`, 'GET');
}

// TF2-P0-NEW-1 (Opsi B): Fetch daftar permission catalog (SA-only). Dipanggil
// lazy oleh UsersClient saat SUPER_ADMIN pertama kali klik tombol "Izin".
// Sebelumnya fetch ini dilakukan di page-level (users/page.tsx) yang menyebabkan
// TU LoadError karena endpoint /permissions di-guard @Roles('SUPER_ADMIN').
export async function fetchPermissionCatalog() {
  return apiAction<PermissionItem[]>('/permissions', 'GET');
}

// ── Provisioning (2J-4) ───────────────────────────────────────────────────────

export interface TempCredential {
  username: string;
  tempPassword: string;
}

export interface ProvisionUserResult {
  user: { id: string; email: string; fullName: string; role: string };
  tempCredentials: TempCredential[];
}

export async function provisionUserAction(body: Record<string, unknown>) {
  const result = await apiAction<ProvisionUserResult>('/provision/users', 'POST', body);
  if (!result.error) revalidatePath('/dashboard/users');
  return result;
}

export interface BulkRowResult {
  index: number;
  status: 'ok' | 'error';
  error?: string;
  user?: { id: string; email: string; fullName: string; role: string };
  tempCredentials?: TempCredential[];
}

export interface BulkResult {
  results: BulkRowResult[];
  summary: { ok: number; fail: number; total: number };
}

export async function provisionUsersBulkAction(users: Array<Record<string, unknown>>) {
  const result = await apiAction<BulkResult>('/provision/users/bulk', 'POST', { users });
  if (!result.error) revalidatePath('/dashboard/users');
  return result;
}