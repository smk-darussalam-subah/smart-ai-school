'use server';

import { revalidatePath } from 'next/cache';
import { apiAction } from '@/lib/server-actions';

export interface UpdateProfileBody {
  name?: string;
  npsn?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  headmasterName?: string | null;
  headmasterNip?: string | null;
  logoUrl?: string | null;
  accreditation?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusM?: number;
}

export async function updateProfileAction(body: UpdateProfileBody) {
  const result = await apiAction('/school/profile', 'PUT', body);
  if (!result.error) revalidatePath('/dashboard/profil');
  return result;
}

export interface CreateMajorBody {
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
}

export async function createMajorAction(body: CreateMajorBody) {
  const result = await apiAction('/school/majors', 'POST', body);
  if (!result.error) revalidatePath('/dashboard/profil');
  return result;
}

export async function updateMajorAction(id: string, body: Record<string, unknown>) {
  const result = await apiAction(`/school/majors/${id}`, 'PATCH', body);
  if (!result.error) revalidatePath('/dashboard/profil');
  return result;
}

export async function toggleMajorActiveAction(id: string, isActive: boolean) {
  const result = await apiAction(`/school/majors/${id}`, 'PATCH', { isActive });
  if (!result.error) revalidatePath('/dashboard/profil');
  return result;
}
