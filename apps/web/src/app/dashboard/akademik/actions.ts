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
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      return { success: false, error: apiErrorMessage(err) };
    }
    return { success: true, data: await res.json() };
  } catch {
    return { success: false, error: 'Koneksi ke server gagal. Coba lagi.' };
  }
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
  body?: import('./_components/guru-types').ModulAjarBody | null;
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

/** Review Modul Ajar (KS/SA: approve atau revise dengan catatan). */
export async function reviewRpp(id: string, decision: 'approved' | 'revision', note?: string) {
  const r = await apiCall(`/rpp/${id}/review`, 'PATCH', { decision, note: note ?? null });
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

/** T2-03: Ambil katalog badge dari /badges (untuk LMS Badge tab). */
export async function fetchBadgeCatalog(): Promise<{
  success: boolean;
  data?: Array<{
    id: string; code: string; name: string; description: string | null;
    icon: string; tier: string;
  }>;
  error?: string;
}> {
  const r = await apiCall('/badges?limit=50', 'GET');
  if (!r.success) return { success: false, error: r.error };
  // API returns { data: [...], total, page, limit }
  const body = r.data as { data?: Array<{ id: string; code: string; name: string; description: string | null; icon: string; tier: string }> };
  return { success: true, data: body?.data ?? [] };
}

/** Ambil progres siswa untuk satu Modul LMS (monitor guru). */
export async function fetchLmsProgress(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return { success: false, error: 'Sesi berakhir — silakan login ulang.' };
  try {
    const res = await fetch(`${API_BASE}/api/v1/lms/modules/${id}/progress`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      return { success: false, error: apiErrorMessage(err) };
    }
    return { success: true, data: await res.json() };
  } catch {
    return { success: false, error: 'Koneksi ke server gagal. Coba lagi.' };
  }
}

// ── Question Bank (P20 — W3-2) ─────────────────────────────────────────────

export interface QuestionData {
  subject: string;
  type: 'multiple_choice' | 'essay' | 'true_false';
  body: string;
  options?: string[];
  answer?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags?: string[];
}

/** Fetch questions for a subject (or all if no subject). */
export async function fetchQuestions(subject?: string) {
  const path = subject ? `/questions?subject=${encodeURIComponent(subject)}&limit=200` : '/questions?limit=200';
  const r = await apiCall(path, 'GET');
  return r;
}

/** Create a new question in the bank. */
export async function createQuestion(data: QuestionData) {
  const r = await apiCall('/questions', 'POST', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

/** Update an existing question. */
export async function updateQuestion(id: string, data: Partial<QuestionData>) {
  const r = await apiCall(`/questions/${id}`, 'PATCH', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

/** Delete a question. */
export async function deleteQuestion(id: string) {
  const r = await apiCall(`/questions/${id}`, 'DELETE');
  revalidatePath('/dashboard/akademik');
  return r;
}

// ── AI Generate (P20 — W3-5) ───────────────────────────────────────────────

/** Generate questions from RPP body via AI. */
export async function aiGenerateQuestions(data: { rppBody: string; subject: string; count: number; type: string }) {
  const r = await apiCall('/ai/generate-questions', 'POST', data);
  return r;
}

/** Generate learning material from RPP body via AI. */
export async function aiGenerateMaterial(data: { rppBody: string; subject: string }) {
  const r = await apiCall('/ai/generate-material', 'POST', data);
  return r;
}

/** Generate ATP from CP + TP via AI. */
export async function aiGenerateAtp(data: { cp: string; tp: string[]; subject: string }) {
  const r = await apiCall('/ai/generate-atp', 'POST', data);
  return r;
}
