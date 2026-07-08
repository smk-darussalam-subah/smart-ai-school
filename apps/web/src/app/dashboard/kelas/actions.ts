'use server';

import { revalidatePath } from 'next/cache';
import { apiAction } from '@/lib/server-actions';

export async function createClassAction(body: {
  name: string;
  majorCode: string;
  grade: number;
  academicYear: string;
  capacity: number;
  teacherId?: string | null;
}) {
  const result = await apiAction('/classes', 'POST', body);
  if (!result.error) revalidatePath('/dashboard/kelas');
  return result;
}

export async function updateClassAction(id: string, body: Record<string, unknown>) {
  const result = await apiAction(`/classes/${id}`, 'PATCH', body);
  if (!result.error) revalidatePath('/dashboard/kelas');
  return result;
}

export async function deleteClassAction(id: string) {
  const result = await apiAction(`/classes/${id}`, 'DELETE');
  if (!result.error) revalidatePath('/dashboard/kelas');
  return result;
}
