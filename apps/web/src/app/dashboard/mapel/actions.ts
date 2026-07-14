'use server';

import { revalidatePath } from 'next/cache';
import { apiAction } from '@/lib/server-actions';

export interface SubjectRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export async function createSubjectAction(body: { code: string; name: string }) {
  const result = await apiAction('/subjects', 'POST', body);
  if (!result.error) revalidatePath('/dashboard/mapel');
  return result;
}

export async function updateSubjectAction(id: string, body: Record<string, unknown>) {
  const result = await apiAction(`/subjects/${id}`, 'PATCH', body);
  if (!result.error) revalidatePath('/dashboard/mapel');
  return result;
}

export async function toggleSubjectActiveAction(id: string, isActive: boolean) {
  const result = await apiAction(`/subjects/${id}`, 'PATCH', { isActive });
  if (!result.error) revalidatePath('/dashboard/mapel');
  return result;
}
