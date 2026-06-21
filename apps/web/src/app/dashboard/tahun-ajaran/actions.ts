'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { apiErrorMessage } from '@/lib/api';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

async function apiCall(path: string, method: string, body?: unknown) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return { success: false, error: 'Sesi berakhir — silakan login ulang.' };
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      return { success: false, error: apiErrorMessage(err) };
    }
    revalidatePath('/dashboard/tahun-ajaran');
    return { success: true, data: await res.json() };
  } catch {
    return { success: false, error: 'Koneksi ke server gagal. Coba lagi.' };
  }
}

export interface AcademicYearInput {
  code: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}

export interface SemesterInput {
  academicYearId: string;
  number: number;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}

export async function createAcademicYear(data: AcademicYearInput) {
  return apiCall('/school/academic-years', 'POST', data);
}

/** Aktifkan TA (PATCH isActive:true → backend menonaktifkan TA lain). */
export async function activateAcademicYear(id: string) {
  return apiCall(`/school/academic-years/${id}`, 'PATCH', { isActive: true });
}

export async function createSemester(data: SemesterInput) {
  return apiCall('/school/semesters', 'POST', data);
}

/** Aktifkan semester (PATCH isActive:true → backend menonaktifkan semester lain). */
export async function activateSemester(id: string) {
  return apiCall(`/school/semesters/${id}`, 'PATCH', { isActive: true });
}
