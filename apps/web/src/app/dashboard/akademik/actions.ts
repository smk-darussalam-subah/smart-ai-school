'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiErrorMessage } from '@/lib/api';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

async function apiCall(path: string, method: string, body?: unknown) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    // T2-05: No session → redirect ke login
    redirect('/login?reason=session');
  }
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.accessToken}` },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    });
    if (!res.ok) {
      // T2-05: 401 → redirect ke login (bukan silent error)
      if (res.status === 401) {
        redirect('/login?reason=session');
      }
      const err = await res.json().catch(() => null);
      return { success: false, error: apiErrorMessage(err) };
    }
    return { success: true, data: await res.json() };
  } catch (err) {
    // redirect() throws a NEXT_REDIRECT error — re-throw it, jangan swallow
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
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
  if (!session?.accessToken) { redirect('/login?reason=session'); }
  try {
    const res = await fetch(`${API_BASE}/api/v1/students?classId=${classId}&status=active&limit=100`, {
      headers: { Authorization: `Bearer ${session!.accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      if (res.status === 401) redirect('/login?reason=session');
      return [];
    }
    const json = (await res.json()) as { data?: { id: string; nis: string; user?: { fullName?: string } }[] };
    return (json.data ?? []).map((s) => ({ id: s.id, nis: s.nis, name: s.user?.fullName ?? '—' }));
  } catch (err) {
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
    return [];
  }
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

// ── Report Cards (T2-01 — Rapor sections B-G) ─────────────────────────────

/** T2-01: Fetch muatan lokal (Section B) for a student. */
export async function fetchMuatanLokal(studentId: string, year: string, semester: number) {
  const r = await apiCall(
    `/report-cards/${studentId}/muatan-lokal?year=${encodeURIComponent(year)}&semester=${semester}`,
    'GET',
  );
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { subjects: { name: string; na: number; kktp: number; predikat: string }[] } };
}

/** T2-01: Fetch attendance summary (Section D) for a student. */
export async function fetchAttendanceSummary(studentId: string, year: string, semester: number) {
  const r = await apiCall(
    `/report-cards/${studentId}/attendance-summary?year=${encodeURIComponent(year)}&semester=${semester}`,
    'GET',
  );
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { hadir: number; izin: number; sakit: number; alpha: number; total: number } };
}

/** T2-01: Fetch development description (Section F) for a student. */
export async function fetchDevelopmentDescription(studentId: string, year: string, semester: number) {
  const r = await apiCall(
    `/report-cards/${studentId}/development-description?year=${encodeURIComponent(year)}&semester=${semester}`,
    'GET',
  );
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { description: string; spiritual: string; social: string; academic: string } };
}

/** T2-01: Fetch approval info (Section G) for a student. */
export async function fetchApprovalInfo(studentId: string, year: string, semester: number) {
  const r = await apiCall(
    `/report-cards/${studentId}/approval?year=${encodeURIComponent(year)}&semester=${semester}`,
    'GET',
  );
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { homeroomTeacher: string; principal: string; approvedAt: string | null; schoolYear: string; semester: number; className: string } };
}

// ── Analytics (T2-02 — KS health & tren) ───────────────────────────────────

/** T2-02: Fetch attendance heatmap for trend analysis. */
export async function fetchAttendanceHeatmap(days: number) {
  const r = await apiCall(`/attendance/heatmap?days=${days}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as {
      dates: string[];
      classes: Array<{ classId: string; className: string; grade: number; cells: Array<{ date: string; total: number; hadir: number; pct: number | null }> }>;
      overall: { today: { pct: number | null }; yesterday?: { pct: number | null } };
    },
  };
}

/** Ambil progres siswa untuk satu Modul LMS (monitor guru). */
export async function fetchLmsProgress(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) { redirect('/login?reason=session'); }
  try {
    const res = await fetch(`${API_BASE}/api/v1/lms/modules/${id}/progress`, {
      headers: { Authorization: `Bearer ${session!.accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      if (res.status === 401) redirect('/login?reason=session');
      const err = await res.json().catch(() => null);
      return { success: false, error: apiErrorMessage(err) };
    }
    return { success: true, data: await res.json() };
  } catch (err) {
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
    return { success: false, error: 'Koneksi ke server gagal. Coba lagi.' };
  }
}

// ── Question Bank (P20 — W3-2) ─────────────────────────────────────────────

// U2 Wave 2: Essay rubric criteria type
export interface EssayRubricCriteria {
  id: string;          // "c1", "c2", etc.
  name: string;        // "Pemahaman konsep"
  weight: number;      // 0.3 (30%)
  maxScore: number;    // 100
  description: string; // "Siswa menunjukkan pemahaman..."
}

export interface QuestionData {
  subject: string;
  type: 'multiple_choice' | 'essay' | 'true_false';
  body: string;
  options?: string[];
  answer?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags?: string[];
  rubric?: EssayRubricCriteria[]; // U2 Wave 2
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

// ── Assessment Sessions (U2 — comprehensive assessment) ────────────────────

/** U2 Wave 1: SISWA memulai pengerjaan — mencatat startedAt, return shuffled questions. */
export async function startAssessmentResponse(sessionId: string) {
  const r = await apiCall(`/assessment/sessions/${sessionId}/start-response`, 'POST');
  return r;
}

/** U2 Wave 1: SISWA submit jawaban dengan timer enforcement. */
export async function submitAssessmentResponse(sessionId: string, answers: unknown, startedAt?: string) {
  const r = await apiCall(`/assessment/sessions/${sessionId}/submit`, 'POST', { answers, startedAt });
  revalidatePath('/dashboard/akademik');
  return r;
}

/** U2 Wave 2: GURU menilai essay dengan rubrik (per-criteria scores). */
export async function gradeEssayResponse(sessionId: string, responseId: string, data: { questionId: string; criteriaScores: Record<string, number> }) {
  const r = await apiCall(`/assessment/sessions/${sessionId}/responses/${responseId}/grade-essay`, 'PATCH', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

/** U2 Wave 3: Fetch session analysis (item analysis, score distribution, ketuntasan). */
export async function fetchSessionAnalysis(sessionId: string) {
  const r = await apiCall(`/assessment/sessions/${sessionId}/analysis`, 'GET');
  return r;
}

/** U2 Wave 4: Export questions as CSV. */
export async function exportQuestionsCsv(subject?: string) {
  const path = subject ? `/questions/export?subject=${encodeURIComponent(subject)}` : '/questions/export';
  const r = await apiCall(path, 'GET');
  return r;
}

/** U2 Wave 4: Import questions from CSV rows. */
export async function importQuestionsCsv(subject: string, rows: Array<{ type: string; body: string; options?: string; answer?: string; difficulty: string; tags?: string }>) {
  const r = await apiCall('/questions/import', 'POST', { subject, rows });
  revalidatePath('/dashboard/akademik');
  return r;
}

// ── Push Notifications (T3-03 — PWA) ────────────────────────────────────────

/** T3-03: Subscribe to push notifications via POST /push/subscribe. */
export async function subscribePush(dto: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<boolean> {
  const r = await apiCall('/push/subscribe', 'POST', dto);
  return r.success;
}

/** T3-03: Unsubscribe from push notifications via POST /push/unsubscribe. */
export async function unsubscribePush(endpoint: string): Promise<boolean> {
  const r = await apiCall('/push/unsubscribe', 'POST', { endpoint });
  return r.success;
}

// ── LMS Progress + WA Log (T3-06 — Orphan endpoints) ───────────────────────

/** T3-06: Update student LMS module progress via PATCH /lms/modules/:id/progress. */
export async function updateLmsProgress(moduleId: string, progress: number): Promise<{ success: boolean; error?: string }> {
  const r = await apiCall(`/lms/modules/${moduleId}/progress`, 'PATCH', { progress });
  if (!r.success) return { success: false, error: r.error };
  return { success: true };
}

/** T3-06: Fetch WA notification logs for admin (KS/SA). */
export async function fetchWaLogs(params?: { page?: number; limit?: number; studentId?: string }): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const query = params
    ? `?${Object.entries({ page: 1, limit: 50, ...params })
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&')}`
    : '?page=1&limit=50';
  const r = await apiCall(`/wa-log${query}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data };
}

// ── KKTP Config (T3-02 / B5 — per-subject persistence) ──────────────────────

/** T3-02: Fetch KKTP configs from backend. */
export async function fetchKktpConfigs(academicYear?: string, semester?: number): Promise<{
  success: boolean;
  data?: Array<{ id: string; subject: string; kktp: number; academicYear: string; semester: number }>;
  error?: string;
}> {
  const params = new URLSearchParams();
  if (academicYear) params.set('academicYear', academicYear);
  if (semester) params.set('semester', String(semester));
  const r = await apiCall(`/kktp-config${params.toString() ? '?' + params.toString() : ''}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as Array<{ id: string; subject: string; kktp: number; academicYear: string; semester: number }> };
}

/** T3-02: Save (upsert) a KKTP config. */
export async function saveKktpConfig(data: { subject: string; kktp: number; academicYear: string; semester: number }): Promise<{ success: boolean; error?: string }> {
  const r = await apiCall('/kktp-config', 'POST', data);
  if (!r.success) return { success: false, error: r.error };
  return { success: true };
}

// ── B1+B2+B3+B4+B6+B7 Frontend Server Actions (Skenario B wiring) ──────────

/** B1: Fetch daily quests for siswa. */
export async function fetchDailyQuests(): Promise<{ success: boolean; data?: { date: string; quests: Array<{ id: string; title: string; desc: string; xp: number; icon: string; type: string; completed: boolean }> }; error?: string }> {
  const r = await apiCall('/gamification/daily-quests', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { date: string; quests: Array<{ id: string; title: string; desc: string; xp: number; icon: string; type: string; completed: boolean }> } };
}

/** B2: Fetch personal calendar for siswa/ortu. */
export async function fetchPersonalCalendar(): Promise<{ success: boolean; data?: { className: string; schedule: unknown[]; events: unknown[] }; error?: string }> {
  const r = await apiCall('/gamification/personal-calendar', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { className: string; schedule: unknown[]; events: unknown[] } };
}

/** B3: Fetch learning timeline for siswa/ortu. */
export async function fetchTimeline(): Promise<{ success: boolean; data?: Array<{ date: string; type: string; title: string; description: string; subject?: string }>; error?: string }> {
  const r = await apiCall('/student-dashboard/timeline', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as Array<{ date: string; type: string; title: string; description: string; subject?: string }> };
}

/** B4: Fetch teachers for siswa/ortu. */
export async function fetchTeachers(): Promise<{ success: boolean; data?: Array<{ subject: string; teacherName: string; phone: string | null; email: string | null; hoursPerWeek: number }>; error?: string }> {
  const r = await apiCall('/student-dashboard/teachers', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as Array<{ subject: string; teacherName: string; phone: string | null; email: string | null; hoursPerWeek: number }> };
}

/** B6: Fetch monitoring KBM for KS/SA. */
export async function fetchMonitoringKbm(academicYear?: string, semester?: number): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const params = new URLSearchParams();
  if (academicYear) params.set('academicYear', academicYear);
  if (semester) params.set('semester', String(semester));
  const r = await apiCall(`/analytics/monitoring-kbm${params.toString() ? '?' + params.toString() : ''}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data };
}

/** B7: Fetch rekap audit for KS/SA. */
export async function fetchRekapAudit(academicYear?: string, semester?: number): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const params = new URLSearchParams();
  if (academicYear) params.set('academicYear', academicYear);
  if (semester) params.set('semester', String(semester));
  const r = await apiCall(`/analytics/rekap-audit${params.toString() ? '?' + params.toString() : ''}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data };
}

/** B8: Preview auto-scheduling. */
export async function fetchAutoSchedule(academicYear: string, semester: number, config?: { days?: number; jpPerDay?: number; maxJpGuru?: number }): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const params = new URLSearchParams({ academicYear, semester: String(semester) });
  if (config?.days) params.set('days', String(config.days));
  if (config?.jpPerDay) params.set('jpPerDay', String(config.jpPerDay));
  if (config?.maxJpGuru) params.set('maxJpGuru', String(config.maxJpGuru));
  const r = await apiCall(`/schedules/auto-generate?${params.toString()}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data };
}

// ── Rapor Pipeline (U1 — GAP-5: wali kelas compile → KS approve) ───────────────

/** U1: Generate rapor massal untuk satu kelas (idempotent — skips existing). */
export async function generateReportCards(classId: string, academicYear: string, semester: number): Promise<{
  success: boolean;
  data?: { generated: number; skipped: number; totalStudents: number };
  error?: string;
}> {
  const r = await apiCall('/report-cards/generate', 'POST', { classId, academicYear, semester });
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { generated: number; skipped: number; totalStudents: number } };
}

/** U1: Transition rapor status (check → publish → distribute). */
export async function transitionReportStatus(reportId: string, action: 'check' | 'return' | 'publish' | 'distribute'): Promise<{
  success: boolean;
  data?: ReportCardItem;
  error?: string;
}> {
  const r = await apiCall(`/report-cards/${reportId}/status`, 'PATCH', { action });
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as ReportCardItem };
}

/** U1: Update catatan wali kelas (only when status = draft). */
export async function updateReportNotes(reportId: string, notes: string | null): Promise<{
  success: boolean;
  data?: ReportCardItem;
  error?: string;
}> {
  const r = await apiCall(`/report-cards/${reportId}/notes`, 'PATCH', { notes });
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as ReportCardItem };
}

/** U1: Fetch rapor by class with optional filters. */
export async function fetchReportCardsByClass(classId?: string, academicYear?: string, semester?: number, status?: string): Promise<{
  success: boolean;
  data?: { data: ReportCardItem[]; total: number; page: number; limit: number };
  error?: string;
}> {
  const params = new URLSearchParams();
  if (classId) params.set('classId', classId);
  if (academicYear) params.set('academicYear', academicYear);
  if (semester) params.set('semester', String(semester));
  if (status) params.set('status', status);
  const r = await apiCall(`/report-cards${params.toString() ? '?' + params.toString() : ''}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { data: ReportCardItem[]; total: number; page: number; limit: number } };
}

/** U1: Type for report card items returned by backend. */
export interface ReportCardItem {
  id: string;
  studentId: string;
  classId: string;
  academicYear: string;
  semester: number;
  status: 'draft' | 'checked' | 'published' | 'distributed';
  grades: unknown;
  attendance: { hadir: number; izin: number; sakit: number; alpha: number };
  notes: string | null;
  generatedAt: string | null;
  checkedAt: string | null;
  publishedAt: string | null;
  distributedAt: string | null;
  student: { id: string; nis: string; user: { fullName: string } };
  class: { id: string; name: string };
}
