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

/** Appointment Wave A: endpoint kept for compatibility; API returns disabled/no mutation. */
export async function syncRolesAction() {
  const result = await apiAction('/positions/sync-roles', 'POST');
  if (!result.error) revalidatePath('/dashboard/struktur-organisasi');
  return result;
}

/** R-25: Verifikasi effective access user (SUPER_ADMIN only). */
export interface AccessCheckResult {
  user: { id: string; fullName: string; email: string; dbRole: string };
  keycloakRoles: string[];
  activeAppointments: Array<{
    id: string;
    code: string;
    name: string;
    kind: 'DEFINITIVE' | 'PLT';
    status: 'ACTIVE';
    effectiveFrom: string;
    effectiveUntil: string | null;
    major: { code: string; name: string } | null;
  }>;
  appointmentPermissions: string[];
  effectivePermissions: string[];
}

export async function accessCheckAction(userId: string) {
  return apiAction<AccessCheckResult>(`/positions/access-check/${userId}`, 'GET');
}
