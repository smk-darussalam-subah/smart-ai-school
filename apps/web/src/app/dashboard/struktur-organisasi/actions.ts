'use server';

import { revalidatePath } from 'next/cache';
import { apiAction } from '@/lib/server-actions';

export async function assignPositionAction(body: {
  userId: string;
  positionId: string;
  academicYearId: string;
  majorId?: string;
}) {
  const result = await apiAction('/positions/assign', 'POST', body);
  if (!result.error) revalidatePath('/dashboard/struktur-organisasi');
  return result;
}

export async function unassignPositionAction(id: string) {
  const result = await apiAction(`/positions/assignments/${id}`, 'DELETE');
  if (!result.error) revalidatePath('/dashboard/struktur-organisasi');
  return result;
}

/** R-23: Sinkronisasi 13 position code sebagai Keycloak realm roles. */
export async function syncRolesAction() {
  const result = await apiAction('/positions/sync-roles', 'POST');
  if (!result.error) revalidatePath('/dashboard/struktur-organisasi');
  return result;
}

/** R-25: Verifikasi effective access user (SUPER_ADMIN only). */
export async function accessCheckAction(userId: string) {
  return apiAction(`/positions/access-check/${userId}`, 'GET');
}
