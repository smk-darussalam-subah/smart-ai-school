'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

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
    return { success: false, error: err.message || 'Request failed' };
  }
  return { success: true, data: await res.json() };
}

export async function recordSpp(formData: FormData) {
  const body = {
    studentId: formData.get('studentId'),
    month: Number(formData.get('month')),
    year: Number(formData.get('year')),
    amount: Number(formData.get('amount')),
  };
  const result = await fetchApi('/finance/spp', 'POST', body);
  revalidatePath('/dashboard/keuangan');
  return result;
}

export async function approveSpp(id: string) {
  const result = await fetchApi(`/finance/spp/${id}/approve`, 'POST');
  revalidatePath('/dashboard/keuangan');
  return result;
}

export async function searchStudentsForSppAction(search: string) {
  const query = new URLSearchParams({
    limit: '20',
    status: 'active',
    sortBy: 'fullName',
    sortOrder: 'asc',
  });
  const q = search.trim().slice(0, 100);
  if (q) query.set('search', q);
  return fetchApi(`/students?${query.toString()}`, 'GET');
}
