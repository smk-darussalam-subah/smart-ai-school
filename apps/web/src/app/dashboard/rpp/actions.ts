'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
const PATH = '/dashboard/rpp';

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
    return { success: false as const, error: message };
  }
  revalidatePath(PATH);
  return { success: true as const, data: (await res.json()) as unknown };
}

export async function createRpp(body: Record<string, unknown>) {
  return fetchApi('/rpp', 'POST', body);
}
export async function updateRpp(id: string, body: Record<string, unknown>) {
  return fetchApi(`/rpp/${id}`, 'PATCH', body);
}
export async function submitRpp(id: string) {
  return fetchApi(`/rpp/${id}/submit`, 'PATCH');
}
export async function reviewRpp(id: string, decision: 'approved' | 'revision', note?: string) {
  return fetchApi(`/rpp/${id}/review`, 'PATCH', { decision, note: note || null });
}
export async function deleteRpp(id: string) {
  return fetchApi(`/rpp/${id}`, 'DELETE');
}
