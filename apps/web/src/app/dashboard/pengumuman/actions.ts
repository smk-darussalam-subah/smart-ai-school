'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
const PATH = '/dashboard/pengumuman';

async function fetchApi(path: string, method: string, body?: unknown) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) throw new Error('Unauthorized');

  const url = `${API_BASE}/api/v1${path}`;
  const res = await fetch(url, {
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

export async function createAnnouncement(body: Record<string, unknown>) {
  const result = await fetchApi('/announcements', 'POST', body);
  revalidatePath(PATH);
  return result;
}

export async function updateAnnouncement(id: string, body: Record<string, unknown>) {
  const result = await fetchApi(`/announcements/${id}`, 'PATCH', body);
  revalidatePath(PATH);
  return result;
}

export async function publishAnnouncement(id: string) {
  const result = await fetchApi(`/announcements/${id}/publish`, 'PATCH');
  revalidatePath(PATH);
  return result;
}

export async function archiveAnnouncement(id: string) {
  const result = await fetchApi(`/announcements/${id}/archive`, 'PATCH');
  revalidatePath(PATH);
  return result;
}

export async function pinAnnouncement(id: string, isPinned: boolean) {
  const result = await fetchApi(`/announcements/${id}/pin`, 'PATCH', { isPinned });
  revalidatePath(PATH);
  return result;
}

export async function deleteAnnouncement(id: string) {
  const result = await fetchApi(`/announcements/${id}`, 'DELETE');
  revalidatePath(PATH);
  return result;
}
