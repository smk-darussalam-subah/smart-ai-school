'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

async function apiCall(path: string, method: string, body?: unknown) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) throw new Error('Unauthorized');
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
    body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    return { success: false, error: err.message };
  }
  return { success: true, data: await res.json() };
}

export async function updateLeadStatus(id: string, status: string) {
  const r = await apiCall(`/ppdb/leads/${id}/status`, 'PATCH', { status });
  revalidatePath('/dashboard/ppdb');
  return r;
}

export async function assignLead(id: string, assignedTo: string) {
  const r = await apiCall(`/ppdb/leads/${id}/assign`, 'PATCH', { assignedTo });
  revalidatePath('/dashboard/ppdb');
  return r;
}
