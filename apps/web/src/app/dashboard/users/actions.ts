'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const API_BASE = process.env.API_URL || 'http://api:3001';

async function apiCall(path: string, method: string, body?: unknown) {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    return { error: err.message || `HTTP ${res.status}` };
  }
  return { data: await res.json() };
}

export async function updateUserRole(userId: string, role: string) {
  const result = await apiCall(`/users/${userId}/role`, 'PATCH', { role });
  if (!result.error) revalidatePath('/dashboard/users');
  return result;
}

export async function updateUserActive(userId: string, isActive: boolean) {
  const result = await apiCall(`/users/${userId}/active`, 'PATCH', { isActive });
  if (!result.error) revalidatePath('/dashboard/users');
  return result;
}

export async function grantUserPermission(userId: string, permissionId: string, grant: boolean) {
  return apiCall(`/permissions/users/${userId}/grant`, 'POST', { permissionId, grant });
}

export async function revokeUserPermission(userId: string, permissionId: string) {
  return apiCall(`/permissions/users/${userId}/revoke?permissionId=${permissionId}`, 'DELETE');
}

export async function fetchUserOverrides(userId: string) {
  return apiCall(`/permissions/users/${userId}`, 'GET');
}
