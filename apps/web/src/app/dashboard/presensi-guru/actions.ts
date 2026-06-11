'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

async function post(path: string, body: Record<string, unknown>) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) throw new Error('Unauthorized');

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    const message = Array.isArray(err.message)
      ? err.message.map((m: { message?: string }) => m.message ?? String(m)).join(', ')
      : err.message || 'Request failed';
    return { success: false as const, error: message };
  }
  revalidatePath('/dashboard/presensi-guru');
  return { success: true as const, data: (await res.json()) as unknown };
}

export async function checkIn(body: { lat?: number; lng?: number; notes?: string }) {
  return post('/teacher-attendance/check-in', body);
}

export async function checkOut(body: { lat?: number; lng?: number }) {
  return post('/teacher-attendance/check-out', body);
}
