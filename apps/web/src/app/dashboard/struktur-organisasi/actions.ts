'use server';

import { revalidatePath } from 'next/cache';
import { apiAction } from '@/lib/server-actions';
import type {
  AppointmentCandidateResponse,
  AppointmentCreatePayload,
  AppointmentDetail,
  AppointmentHistory,
  AppointmentMutationResult,
  AppointmentPermissionPreview,
} from './struktur-ui';

const STRUCTURE_PATH = '/dashboard/struktur-organisasi';

function refreshStructure() {
  revalidatePath(STRUCTURE_PATH);
}

export async function createAppointmentAction(body: AppointmentCreatePayload) {
  const result = await apiAction<AppointmentMutationResult>('/appointments', 'POST', body);
  if (!result.error) refreshStructure();
  return result;
}

export async function submitAppointmentAction(id: string) {
  const result = await apiAction<AppointmentMutationResult>(`/appointments/${id}/submit`, 'PATCH');
  if (!result.error) refreshStructure();
  return result;
}

export async function approveAppointmentAction(id: string, note?: string) {
  const result = await apiAction<AppointmentMutationResult>(`/appointments/${id}/approve`, 'PATCH', { note });
  if (!result.error) refreshStructure();
  return result;
}

export async function rejectAppointmentAction(id: string, note?: string) {
  const result = await apiAction<AppointmentMutationResult>(`/appointments/${id}/reject`, 'PATCH', { note });
  if (!result.error) refreshStructure();
  return result;
}

export async function cancelAppointmentAction(id: string) {
  const result = await apiAction<AppointmentMutationResult>(`/appointments/${id}/cancel`, 'PATCH');
  if (!result.error) refreshStructure();
  return result;
}

export async function suspendAppointmentAction(id: string, body: { reason: string; expectedReturnDate: string }) {
  const result = await apiAction<AppointmentMutationResult>(`/appointments/${id}/suspend`, 'PATCH', body);
  if (!result.error) refreshStructure();
  return result;
}

export async function resumeAppointmentAction(id: string) {
  const result = await apiAction<AppointmentMutationResult>(`/appointments/${id}/resume`, 'PATCH');
  if (!result.error) refreshStructure();
  return result;
}

export async function endAppointmentAction(id: string, body: { reason: string; effectiveUntil?: string }) {
  const result = await apiAction<AppointmentMutationResult>(`/appointments/${id}/end`, 'PATCH', body);
  if (!result.error) refreshStructure();
  return result;
}

export async function supersedeAppointmentAction(id: string, reason?: string) {
  const result = await apiAction<AppointmentMutationResult>(`/appointments/${id}/supersede`, 'PATCH', { reason });
  if (!result.error) refreshStructure();
  return result;
}

export async function appointmentDetailAction(id: string) {
  return apiAction<AppointmentDetail>(`/appointments/${id}`, 'GET');
}

export async function appointmentHistoryAction(id: string) {
  return apiAction<AppointmentHistory>(`/appointments/${id}/history`, 'GET');
}

export async function appointmentCandidatesAction(query: { search?: string; role?: 'GURU' | 'TATA_USAHA'; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.role) params.set('role', query.role);
  params.set('page', String(query.page ?? 1));
  params.set('limit', String(query.limit ?? 20));
  return apiAction<AppointmentCandidateResponse>(`/appointments/candidates?${params.toString()}`, 'GET');
}

export async function appointmentPermissionPreviewAction(positionId: string, query: { academicYearId?: string; majorId?: string }) {
  const params = new URLSearchParams();
  if (query.academicYearId) params.set('academicYearId', query.academicYearId);
  if (query.majorId) params.set('majorId', query.majorId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiAction<AppointmentPermissionPreview>(`/appointments/positions/${positionId}/preview${suffix}`, 'GET');
}

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

/** R-25: Verifikasi effective access user, tetap SUPER_ADMIN-only di API. */
export async function accessCheckAction(userId: string) {
  return apiAction<AccessCheckResult>(`/positions/access-check/${userId}`, 'GET');
}
