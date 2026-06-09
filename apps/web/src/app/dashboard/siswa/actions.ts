'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

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
    return { success: false, error: err.message || 'Request failed', status: res.status };
  }

  return { success: true, data: await res.json() };
}

export async function createSiswa(formData: FormData) {
  const body = {
    userId: formData.get('userId'),
    nis: formData.get('nis'),
    classId: formData.get('classId') || undefined,
    parentId: formData.get('parentId') || undefined,
    status: formData.get('status') || 'active',
    joinedAt: formData.get('joinedAt'),
  };
  const result = await fetchApi('/students', 'POST', body);
  revalidatePath('/dashboard/siswa');
  return result;
}

export async function updateSiswa(id: string, formData: FormData) {
  const body = {
    nis: formData.get('nis'),
    classId: formData.get('classId') || undefined,
    parentId: formData.get('parentId') || undefined,
    status: formData.get('status'),
    joinedAt: formData.get('joinedAt') || undefined,
  };
  const result = await fetchApi(`/students/${id}`, 'PATCH', body);
  revalidatePath('/dashboard/siswa');
  return result;
}

export async function deleteSiswa(id: string) {
  const result = await fetchApi(`/students/${id}`, 'DELETE');
  revalidatePath('/dashboard/siswa');
  return result;
}
