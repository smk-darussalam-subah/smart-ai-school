'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
const PATH = '/dashboard/kegiatan';

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
    return { success: false as const, error: message };
  }
  revalidatePath(PATH);
  return { success: true as const, data: (await res.json()) as unknown };
}

export async function createActivity(body: Record<string, unknown>) {
  return fetchApi('/class-activities', 'POST', body);
}
export async function updateActivity(id: string, body: Record<string, unknown>) {
  return fetchApi(`/class-activities/${id}`, 'PATCH', body);
}
export async function deleteActivity(id: string) {
  return fetchApi(`/class-activities/${id}`, 'DELETE');
}
