'use server';

import { revalidatePath } from 'next/cache';
import { apiAction } from '@/lib/server-actions';

export async function assignPositionAction(body: {
  userId: string;
  positionId: string;
  academicYearId: string;
  majorId?: string;
}) {
  const result = await apiAction('/positions/assign', 'POST', body);
  if (!result.error) revalidatePath('/dashboard/struktur-organisasi');
  return result;
}

export async function unassignPositionAction(id: string) {
  const result = await apiAction(`/positions/assignments/${id}`, 'DELETE');
  if (!result.error) revalidatePath('/dashboard/struktur-organisasi');
  return result;
}
