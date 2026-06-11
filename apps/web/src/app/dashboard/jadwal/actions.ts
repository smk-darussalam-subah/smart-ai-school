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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    },
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
