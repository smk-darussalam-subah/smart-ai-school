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

export async function createGrade(data: { studentId: string; assignmentId: string; semester: number; academicYear: string; score: number; type: string; notes?: string }) {
  const r = await apiCall('/grades', 'POST', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function updateGrade(id: string, data: { score: number; notes?: string }) {
  const r = await apiCall(`/grades/${id}`, 'PATCH', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function createAttendance(data: { classId: string; date: string; records: { studentId: string; status: string; notes?: string }[] }) {
  const r = await apiCall('/attendance', 'POST', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function createAssignment(data: { teacherId: string; classId: string; subject: string; hoursPerWeek: number; academicYear: string }) {
  const r = await apiCall('/teaching-assignments', 'POST', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function createSubject(data: { code: string; name: string }) {
  const r = await apiCall('/subjects', 'POST', data);
  return r;
}

// ── Dashboard Guru ────────────────────────────────────────────────────────────

export interface RosterStudent {
  id: string;
  nis: string;
  name: string;
}

/** Roster siswa aktif satu kelas (untuk modal Absen). */
export async function fetchClassRoster(classId: string): Promise<RosterStudent[]> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return [];
  const res = await fetch(`${API_BASE}/api/v1/students?classId=${classId}&status=active&limit=100`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: { id: string; nis: string; user?: { fullName?: string } }[] };
  return (json.data ?? []).map((s) => ({ id: s.id, nis: s.nis, name: s.user?.fullName ?? '—' }));
}

/** Simpan Jurnal Mengajar (disimpan sebagai ClassActivity / Kegiatan Kelas). */
export async function createJurnal(data: {
  classId: string;
  date: string;
  title: string;
  description: string;
  category?: string;
}) {
  const r = await apiCall('/class-activities', 'POST', {
    classId: data.classId,
    date: data.date,
    title: data.title,
    description: data.description,
    category: data.category ?? 'pembelajaran',
  });
  revalidatePath('/dashboard/akademik');
  return r;
}

// ── Modul Ajar / RPP (pipeline guru → Wakakur) ─────────────────────────────────

export interface RppFormData {
  subject: string;
  title: string;
  content?: string | null;
  fileUrl?: string | null;
  classId?: string | null;
  academicYear: string;
  semester: number;
  /** true = langsung diajukan ke Wakakur (status submitted). */
  submit?: boolean;
}

/** Buat Modul Ajar (draft, atau langsung diajukan bila submit=true). */
export async function createRpp(data: RppFormData) {
  const r = await apiCall('/rpp', 'POST', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

/** Edit Modul Ajar milik sendiri (hanya status draft/revision). */
export async function updateRpp(id: string, data: Partial<Omit<RppFormData, 'submit'>>) {
  const r = await apiCall(`/rpp/${id}`, 'PATCH', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

/** Ajukan Modul Ajar (draft/revision → submitted) ke Wakakur. */
export async function submitRpp(id: string) {
  const r = await apiCall(`/rpp/${id}/submit`, 'PATCH');
  revalidatePath('/dashboard/akademik');
  return r;
}

/** Hapus Modul Ajar milik sendiri (hanya status draft). */
export async function deleteRpp(id: string) {
  const r = await apiCall(`/rpp/${id}`, 'DELETE');
  revalidatePath('/dashboard/akademik');
  return r;
}

// ── Modul LMS (materi belajar siswa) ───────────────────────────────────────────

export interface LmsFormData {
  subject: string;
  title: string;
  tp?: string | null;
  jpAllocation?: number | null;
  kktp?: number;
  content?: string | null;
  classId?: string | null;
  rppId?: string | null;
  orderIndex?: number;
  academicYear: string;
  semester: number;
  /** true = langsung dipublikasikan ke siswa. */
  publish?: boolean;
}

/** Buat Modul LMS (draft, atau langsung publish). */
export async function createLmsModule(data: LmsFormData) {
  const r = await apiCall('/lms/modules', 'POST', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

/** Edit Modul LMS milik sendiri. */
export async function updateLmsModule(id: string, data: Partial<Omit<LmsFormData, 'publish'>>) {
  const r = await apiCall(`/lms/modules/${id}`, 'PATCH', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

/** Publikasikan / tarik / arsipkan Modul LMS. */
export async function setLmsModuleStatus(id: string, action: 'publish' | 'unpublish' | 'archive') {
  const r = await apiCall(`/lms/modules/${id}/${action}`, 'PATCH');
  revalidatePath('/dashboard/akademik');
  return r;
}

/** Hapus Modul LMS milik sendiri. */
export async function deleteLmsModule(id: string) {
  const r = await apiCall(`/lms/modules/${id}`, 'DELETE');
  revalidatePath('/dashboard/akademik');
  return r;
}
