'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
const PATH = '/dashboard/jadwal';

async function fetchApi(path: string, method: string, body?: unknown) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) throw new Error('Unauthorized');

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers: body
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` }
      : { Authorization: `Bearer ${session.accessToken}` },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    const message = Array.isArray(err.message)
      ? err.message.map((m: { message?: string }) => m.message ?? String(m)).join(', ')
      : err.message || 'Request failed';
    return { success: false as const, error: message, status: res.status };
  }
  return { success: true as const, data: (await res.json()) as unknown };
}

export async function createSchedule(body: Record<string, unknown>) {
  const r = await fetchApi('/schedules', 'POST', body);
  revalidatePath(PATH);
  return r;
}

export async function updateSchedule(id: string, body: Record<string, unknown>) {
  const r = await fetchApi(`/schedules/${id}`, 'PATCH', body);
  revalidatePath(PATH);
  return r;
}

export async function deleteSchedule(id: string) {
  const r = await fetchApi(`/schedules/${id}`, 'DELETE');
  revalidatePath(PATH);
  return r;
}

export interface ScheduleListParams {
  page: number;
  limit: number;
  classId?: string;
  academicYear?: string;
  semester?: number;
}

export async function fetchScheduleList(params: ScheduleListParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.classId) query.set('classId', params.classId);
  if (params.academicYear) query.set('academicYear', params.academicYear);
  if (params.semester) query.set('semester', String(params.semester));
  return fetchApi(`/schedules?${query.toString()}`, 'GET');
}

export async function searchScheduleAssignments(params: {
  search?: string;
  academicYear?: string;
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  });
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.academicYear) query.set('academicYear', params.academicYear);
  return fetchApi(`/teaching-assignments?${query.toString()}`, 'GET');
}

export async function startClassSession(id: string, idempotencyKey: string) {
  const result = await fetchApi(`/class-sessions/${id}/start`, 'POST', { idempotencyKey });
  if (result.success) revalidatePath(PATH);
  return result;
}

export async function completeClassSession(id: string, idempotencyKey: string) {
  const result = await fetchApi(`/class-sessions/${id}/complete`, 'POST', { idempotencyKey });
  if (result.success) revalidatePath(PATH);
  return result;
}

export async function cancelClassSession(id: string, reason: string, idempotencyKey: string) {
  const result = await fetchApi(`/class-sessions/${id}/cancel`, 'POST', {
    reason,
    idempotencyKey,
  });
  if (result.success) revalidatePath(PATH);
  return result;
}

export async function reassignClassSession(
  id: string,
  teacherId: string,
  reason: string,
  idempotencyKey: string,
) {
  const result = await fetchApi(`/class-sessions/${id}/reassign`, 'POST', {
    teacherId,
    reason,
    idempotencyKey,
  });
  if (result.success) revalidatePath(PATH);
  return result;
}

export async function createBellSchedule(body: Record<string, unknown>) {
  const result = await fetchApi('/bell-schedules', 'POST', body);
  if (result.success) revalidatePath(PATH);
  return result;
}

export async function updateBellSchedule(id: string, body: Record<string, unknown>) {
  const result = await fetchApi(`/bell-schedules/${id}`, 'PATCH', body);
  if (result.success) revalidatePath(PATH);
  return result;
}

export async function revokeBellSchedule(id: string) {
  const result = await fetchApi(`/bell-schedules/${id}`, 'DELETE');
  if (result.success) revalidatePath(PATH);
  return result;
}
