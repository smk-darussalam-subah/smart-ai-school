'use server';

import { revalidatePath } from 'next/cache';
import { apiAction } from '@/lib/server-actions';

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