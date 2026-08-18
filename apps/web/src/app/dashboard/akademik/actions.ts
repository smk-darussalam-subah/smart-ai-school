'use server';

import type { AssessmentQuestion } from '@smk/types';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiErrorMessage } from '@/lib/api';
import type { FamilyRemedialListResponse } from './_components/ortu/ortu-remedial-ui';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

async function apiCall(path: string, method: string, body?: unknown) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    // T2-05: No session → redirect ke login
    redirect('/login?reason=session');
  }
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers: body
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.accessToken}` }
        : { Authorization: `Bearer ${session!.accessToken}` },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      // T2-05: 401 → redirect ke login (bukan silent error)
      if (res.status === 401) {
        redirect('/login?reason=session');
      }
      const err = await res.json().catch(() => null);
      return { success: false, error: apiErrorMessage(err), errorCode: apiErrorCode(err) };
    }
    return { success: true, data: await res.json() };
  } catch (err) {
    // redirect() throws a NEXT_REDIRECT error — re-throw it, jangan swallow
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
    return { success: false, error: 'Koneksi ke server gagal. Coba lagi.' };
  }
}

function apiErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('error' in body)) return undefined;
  const value = (body as { error?: unknown }).error;
  return typeof value === 'string' && value.startsWith('AI_') ? value : undefined;
}

export async function createGrade(data: {
  studentId: string;
  assignmentId: string;
  semester: number;
  academicYear: string;
  score: number;
  type: string;
  notes?: string;
}) {
  const r = await apiCall('/grades', 'POST', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function updateGrade(id: string, data: { score: number; notes?: string }) {
  const r = await apiCall(`/grades/${id}`, 'PATCH', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function createAttendance(data: {
  classId: string;
  date: string;
  records: { studentId: string; status: string; notes?: string }[];
}) {
  const r = await apiCall('/attendance', 'POST', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function createAssignment(data: {
  teacherId: string;
  classId: string;
  subject: string;
  hoursPerWeek: number;
  academicYear: string;
}) {
  const r = await apiCall('/teaching-assignments', 'POST', data);
  revalidatePath('/dashboard/akademik');
  revalidatePath('/dashboard/jadwal');
  return r;
}

export async function updateAssignment(
  id: string,
  data: { subject?: string; hoursPerWeek?: number; academicYear?: string },
) {
  const r = await apiCall(`/teaching-assignments/${id}`, 'PATCH', data);
  revalidatePath('/dashboard/akademik');
  revalidatePath('/dashboard/jadwal');
  return r;
}

export async function deleteAssignment(id: string) {
  const r = await apiCall(`/teaching-assignments/${id}`, 'DELETE');
  revalidatePath('/dashboard/akademik');
  revalidatePath('/dashboard/jadwal');
  return r;
}

export async function fetchTeachingAssignments(params: {
  page: number;
  limit: number;
  search?: string;
  academicYear?: string;
  classId?: string;
}) {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search) query.set('search', params.search);
  if (params.academicYear) query.set('academicYear', params.academicYear);
  if (params.classId) query.set('classId', params.classId);
  return apiCall(`/teaching-assignments?${query.toString()}`, 'GET');
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
  if (!session?.accessToken) {
    redirect('/login?reason=session');
  }
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/students?classId=${classId}&status=active&limit=100`,
      {
        headers: { Authorization: `Bearer ${session!.accessToken}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      if (res.status === 401) redirect('/login?reason=session');
      return [];
    }
    const json = (await res.json()) as {
      data?: { id: string; nis: string; user?: { fullName?: string } }[];
    };
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
    id: string;
    code: string;
    name: string;
    description: string | null;
    icon: string;
    tier: string;
  }>;
  error?: string;
}> {
  const r = await apiCall('/badges?limit=50', 'GET');
  if (!r.success) return { success: false, error: r.error };
  // API returns { data: [...], total, page, limit }
  const body = r.data as {
    data?: Array<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      icon: string;
      tier: string;
    }>;
  };
  return { success: true, data: body?.data ?? [] };
}

// ── Report Cards (T2-01 — Rapor sections B-G) ─────────────────────────────

export interface OfficialReportSections {
  reportCardId: string;
  snapshotStatus: string;
  identity: { studentName: string; nis: string };
  muatanLokal: { subjects: { name: string; na: number; kktp: number | null; kktpProvenance?: string | null; predikat: string }[] };
  attendance: { hadir: number; izin: number; sakit: number; alpha: number; total: number };
  development: { description: string; spiritual: string; social: string; academic: string };
  approval: {
    homeroomTeacher: string;
    principal: string;
    approvedAt: string | null;
    schoolYear: string;
    semester: number;
    className: string;
  };
}

/** Read every official section from one immutable report-card snapshot. */
export async function fetchOfficialReportSections(studentId: string, year: string, semester: number) {
  const r = await apiCall(
    `/report-cards/${studentId}/official-sections?year=${encodeURIComponent(year)}&semester=${semester}`,
    'GET',
  );
  if (!r.success) return { success: false as const, error: r.error };
  return { success: true as const, data: r.data as OfficialReportSections };
}

/** T2-01: Fetch muatan lokal (Section B) for a student. */
export async function fetchMuatanLokal(studentId: string, year: string, semester: number) {
  const r = await apiCall(
    `/report-cards/${studentId}/muatan-lokal?year=${encodeURIComponent(year)}&semester=${semester}`,
    'GET',
  );
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as { subjects: { name: string; na: number; kktp: number; predikat: string }[] },
  };
}

/** T2-01: Fetch attendance summary (Section D) for a student. */
export async function fetchAttendanceSummary(studentId: string, year: string, semester: number) {
  const r = await apiCall(
    `/report-cards/${studentId}/attendance-summary?year=${encodeURIComponent(year)}&semester=${semester}`,
    'GET',
  );
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as { hadir: number; izin: number; sakit: number; alpha: number; total: number },
  };
}

/** T2-01: Fetch development description (Section F) for a student. */
export async function fetchDevelopmentDescription(
  studentId: string,
  year: string,
  semester: number,
) {
  const r = await apiCall(
    `/report-cards/${studentId}/development-description?year=${encodeURIComponent(year)}&semester=${semester}`,
    'GET',
  );
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as { description: string; spiritual: string; social: string; academic: string },
  };
}

/** T2-01: Fetch approval info (Section G) for a student. */
export async function fetchApprovalInfo(studentId: string, year: string, semester: number) {
  const r = await apiCall(
    `/report-cards/${studentId}/approval?year=${encodeURIComponent(year)}&semester=${semester}`,
    'GET',
  );
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as {
      homeroomTeacher: string;
      principal: string;
      approvedAt: string | null;
      schoolYear: string;
      semester: number;
      className: string;
    },
  };
}

export interface PushNotificationHistoryItem {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  sentAt: string | null;
  refType: string | null;
  createdAt: string;
}

export async function fetchMyNotifications(): Promise<PushNotificationHistoryItem[] | null> {
  const r = await apiCall('/push/my-notifications', 'GET');
  if (!r.success) return null;
  return Array.isArray(r.data) ? (r.data as PushNotificationHistoryItem[]) : [];
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
      classes: Array<{
        classId: string;
        className: string;
        grade: number;
        cells: Array<{ date: string; total: number; hadir: number; pct: number | null }>;
      }>;
      overall: { today: { pct: number | null }; yesterday?: { pct: number | null } };
    },
  };
}

/** Ambil progres siswa untuk satu Modul LMS (monitor guru). */
export async function fetchLmsProgress(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    redirect('/login?reason=session');
  }
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
  id: string; // "c1", "c2", etc.
  name: string; // "Pemahaman konsep"
  weight: number; // 0.3 (30%)
  maxScore: number; // 100
  description: string; // "Siswa menunjukkan pemahaman..."
}

export type QuestionType = 'multiple_choice' | 'essay' | 'true_false' | 'matching';
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type CognitiveLevel = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';
export interface QuestionOption {
  id: string;
  text: string;
}
export interface MatchingPair {
  id: string;
  prompt: string;
  match: string;
}

interface QuestionBaseData {
  subject: string;
  type: QuestionType;
  body: string;
  difficulty: QuestionDifficulty;
  tags?: string[];
}

export type QuestionData =
  | (QuestionBaseData & { type: 'multiple_choice'; options: QuestionOption[]; answer: string })
  | (QuestionBaseData & { type: 'true_false'; answer: boolean })
  | (QuestionBaseData & { type: 'matching'; pairs: MatchingPair[]; answer: Record<string, string> })
  | (QuestionBaseData & { type: 'essay'; guideAnswer?: string; rubric: EssayRubricCriteria[] });

/** Fetch questions for a subject (or all if no subject). */
export async function fetchQuestions(
  subject?: string,
  params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: QuestionType;
    difficulty?: QuestionDifficulty;
  },
) {
  const searchParams = new URLSearchParams();
  if (subject) searchParams.set('subject', subject);
  searchParams.set('limit', String(params?.limit ?? 50));
  searchParams.set('page', String(params?.page ?? 1));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.type) searchParams.set('type', params.type);
  if (params?.difficulty) searchParams.set('difficulty', params.difficulty);
  const path = `/questions?${searchParams.toString()}`;
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
export async function updateQuestion(id: string, data: QuestionData) {
  const r = await apiCall(`/questions/${id}`, 'PATCH', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

export interface QuestionSelectionData {
  questionId: string;
  points: number;
  order: number;
}

export interface CreateAssessmentSessionData {
  moduleId: string;
  title: string;
  type: 'diagnostik' | 'formatif' | 'sumatif';
  questionSelections: QuestionSelectionData[];
  gradeTarget?: 'uh' | 'uts' | 'uas' | null;
  classId?: string | null;
  academicYear: string;
  semester: number;
  durationMinutes?: number;
  randomizeOrder?: boolean;
}

export async function createAssessmentSession(
  data: CreateAssessmentSessionData,
): Promise<{ success: boolean; data?: AssessmentSessionData; error?: string }> {
  const r = await apiCall('/assessment/sessions', 'POST', data);
  if (!r.success) return { success: false, error: r.error };
  revalidatePath('/dashboard/akademik');
  return { success: true, data: r.data as AssessmentSessionData };
}

/** Delete a question. */
export async function deleteQuestion(id: string) {
  const r = await apiCall(`/questions/${id}`, 'DELETE');
  revalidatePath('/dashboard/akademik');
  return r;
}

// ── AI Generate (P20 — W3-5) ───────────────────────────────────────────────

/** AI-0A: Generate one saved Modul Ajar section from authoritative server context. */
export async function aiGenerateRppStep(data: { rppId: string; section: string }): Promise<{
  success: boolean;
  data?: { type: string; output: unknown };
  error?: string;
  errorCode?: string;
}> {
  const r = await apiCall('/ai/generate-rpp-step', 'POST', data);
  if (!r.success) return { success: false, error: r.error, errorCode: r.errorCode };
  return { success: true, data: r.data as { type: string; output: unknown } };
}

export interface AiQuestionDraftRequest {
  rppId?: string;
  moduleId?: string;
  purpose: 'diagnostik' | 'formatif' | 'sumatif-uts' | 'sumatif-uas';
  questionCount: number;
  typeDistribution: Record<QuestionType, number>;
  difficultyDistribution: Record<QuestionDifficulty, number>;
  cognitiveDistribution: Record<CognitiveLevel, number>;
  tpRefs: string[];
  contextMode: 'umum' | 'auto_vokasi' | 'produktif';
  character: 'konseptual' | 'studi_kasus' | 'praktik' | 'literasi' | 'numerasi';
  teacherInstruction?: string;
  idempotencyKey?: string;
}

export interface AiQuestionDraftItem {
  itemKey: string;
  question: QuestionData;
  tpRefs: string[];
  cognitiveLevel: CognitiveLevel;
  rationale: string;
  warnings: string[];
}

export async function generateQuestionDrafts(data: AiQuestionDraftRequest): Promise<{
  success: boolean;
  data?: { generationId: string; model: string; items: AiQuestionDraftItem[] };
  error?: string;
  errorCode?: string;
}> {
  const r = await apiCall('/ai/question-drafts', 'POST', data);
  if (!r.success) return { success: false, error: r.error, errorCode: r.errorCode };
  return {
    success: true,
    data: r.data as { generationId: string; model: string; items: AiQuestionDraftItem[] },
  };
}

export async function acceptQuestionDrafts(
  generationId: string,
  idempotencyKey: string,
  items: Array<{
    itemKey: string;
    question: QuestionData;
    tpRefs: string[];
    cognitiveLevel: CognitiveLevel;
  }>,
) {
  const r = await apiCall(`/ai/question-drafts/${generationId}/accept`, 'POST', {
    idempotencyKey,
    items,
  });
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function rejectQuestionDrafts(generationId: string, idempotencyKey: string) {
  const r = await apiCall(`/ai/question-drafts/${generationId}/reject`, 'POST', { idempotencyKey });
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function regenerateQuestionDraftItem(
  generationId: string,
  itemKey: string,
  teacherInstruction?: string,
): Promise<{
  success: boolean;
  data?: { generationId: string; item: AiQuestionDraftItem };
  error?: string;
  errorCode?: string;
}> {
  const r = await apiCall(
    `/ai/question-drafts/${generationId}/items/${encodeURIComponent(itemKey)}/regenerate`,
    'POST',
    {
      ...(teacherInstruction?.trim() ? { teacherInstruction: teacherInstruction.trim() } : {}),
    },
  );
  if (!r.success) return { success: false, error: r.error, errorCode: r.errorCode };
  return { success: true, data: r.data as { generationId: string; item: AiQuestionDraftItem } };
}

// ── Assessment Sessions (U2 — comprehensive assessment) ────────────────────

/** U2 Wave 1: SISWA memulai pengerjaan — mencatat startedAt, return shuffled questions. */
export async function startAssessmentResponse(sessionId: string) {
  const r = await apiCall(`/assessment/sessions/${sessionId}/start-response`, 'POST');
  return r;
}

/** U2 Wave 1: SISWA submit jawaban dengan timer enforcement. */
export async function autosaveAssessmentResponse(sessionId: string, answers: unknown) {
  const r = await apiCall(`/assessment/sessions/${sessionId}/autosave`, 'POST', { answers });
  return r;
}

export async function submitAssessmentResponse(sessionId: string, answers: unknown) {
  const r = await apiCall(`/assessment/sessions/${sessionId}/submit`, 'POST', { answers });
  revalidatePath('/dashboard/akademik');
  return r;
}

/** U2 Wave 2: GURU menilai essay dengan rubrik (per-criteria scores). */
export async function gradeEssayResponse(
  sessionId: string,
  responseId: string,
  data: { questionId: string; criteriaScores: Record<string, number> },
) {
  const r = await apiCall(
    `/assessment/sessions/${sessionId}/responses/${responseId}/grade-essay`,
    'PATCH',
    data,
  );
  revalidatePath('/dashboard/akademik');
  return r;
}

/** U2 Wave 3: Fetch session analysis (item analysis, score distribution, ketuntasan). */
export async function fetchSessionAnalysis(sessionId: string) {
  const r = await apiCall(`/assessment/sessions/${sessionId}/analysis`, 'GET');
  return r;
}

export interface AssessmentEssayCorrection {
  responseId: string;
  questionId: string;
  studentName: string;
  nis: string;
  body: string;
  rubric: EssayRubricCriteria[];
  answer: string;
  status: 'manual_pending' | 'manual_scored' | 'auto';
  scorePct: number | null;
}

export interface AssessmentResultsData {
  session: { id: string; title: string; type: string; status: string };
  classStudentCount: number | null;
  submitted: number;
  finalCount: number;
  pendingManualCount: number;
  avgScore: number | null;
  responses: Array<{
    id: string;
    name: string;
    nis: string;
    score: number | null;
    submittedAt: string | null;
    startedAt: string | null;
    timeSpentSec: number | null;
    itemScores: unknown;
  }>;
  essayCorrections: AssessmentEssayCorrection[];
}

export async function fetchAssessmentResults(
  sessionId: string,
): Promise<{ success: boolean; data?: AssessmentResultsData; error?: string }> {
  const r = await apiCall(`/assessment/sessions/${sessionId}/results`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as AssessmentResultsData };
}

/** P2 (S-01): Fetch a single assessment session with its questions (for preview mode). */
export async function fetchAssessmentSession(
  sessionId: string,
): Promise<{ success: boolean; data?: AssessmentSessionData; error?: string }> {
  const r = await apiCall(`/assessment/sessions/${sessionId}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as AssessmentSessionData };
}

export async function fetchAssessmentSessions(params?: {
  page?: number;
  limit?: number;
  status?: 'draft' | 'active' | 'completed' | 'cancelled';
  purpose?: 'regular' | 'remedial';
  type?: 'diagnostik' | 'formatif' | 'sumatif';
  subject?: string;
  classId?: string;
  academicYear?: string;
  semester?: number;
}): Promise<{
  success: boolean;
  data?: { data: AssessmentSessionData[]; total: number; page: number; limit: number };
  error?: string;
}> {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params?.page ?? 1));
  searchParams.set('limit', String(params?.limit ?? 100));
  if (params?.status) searchParams.set('status', params.status);
  if (params?.purpose) searchParams.set('purpose', params.purpose);
  if (params?.type) searchParams.set('type', params.type);
  if (params?.subject) searchParams.set('subject', params.subject);
  if (params?.classId) searchParams.set('classId', params.classId);
  if (params?.academicYear) searchParams.set('academicYear', params.academicYear);
  if (params?.semester) searchParams.set('semester', String(params.semester));
  const r = await apiCall(`/assessment/sessions?${searchParams.toString()}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as { data: AssessmentSessionData[]; total: number; page: number; limit: number },
  };
}

export interface AssessmentSessionData {
  id: string;
  teacherId?: string;
  moduleId?: string | null;
  teachingAssignmentId?: string | null;
  classId?: string | null;
  title: string;
  type: string;
  status: string;
  purpose?: 'regular' | 'remedial';
  questions: AssessmentQuestion[];
  gradeTarget?: string | null;
  dueAt?: string | null;
  instructions?: string | null;
  remedialParticipants?: RemedialParticipantData[];
  durationMinutes: number | null;
  randomizeOrder: boolean;
  startedAt: string | null;
  completedAt: string | null;
  module?: { id: string; title: string; subject: string };
  teachingAssignment?: { id: string; subject: string } | null;
  class?: { id: string; name: string };
  _count?: { responses: number; remedialParticipants?: number };
}

export interface RemedialCandidateData {
  gradeId: string;
  studentId: string;
  studentName: string;
  nis: string;
  score: number;
  type: string;
  kktpValue: number;
  kktpProvenance: string;
  gradeUpdatedAt: string;
}

export interface RemedialParticipantData {
  id: string;
  status: 'assigned' | 'in_progress' | 'submitted' | 'passed' | 'needs_retry' | 'cancelled';
  sourceScore: string | number;
  rawScore: number | null;
  effectiveScore: string | number | null;
  kktpValue: string | number;
  kktpProvenance: string;
  finalizedAt: string | null;
  sourceGradeUpdatedAt: string;
  sourceGrade: { id: string; type: string; updatedAt: string; score: string | number };
  student: { id: string; nis: string; user: { fullName: string } };
}

export async function fetchRemedialCandidates(params: {
  classId: string;
  subject: string;
  academicYear: string;
  semester: number;
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ success: boolean; data?: { data: RemedialCandidateData[]; total: number; page: number; limit: number }; error?: string }> {
  const searchParams = new URLSearchParams({
    classId: params.classId,
    subject: params.subject,
    academicYear: params.academicYear,
    semester: String(params.semester),
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 50),
  });
  if (params.type) searchParams.set('type', params.type);
  if (params.search) searchParams.set('search', params.search);
  const r = await apiCall(`/assessment/remedials/candidates?${searchParams.toString()}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { data: RemedialCandidateData[]; total: number; page: number; limit: number } };
}

export async function fetchRemedialSessions(params: {
  page?: number;
  limit?: number;
  status?: 'draft' | 'active' | 'completed' | 'cancelled';
  subject?: string;
  classId?: string;
  academicYear?: string;
  semester?: number;
}): Promise<{ success: boolean; data?: { data: AssessmentSessionData[]; total: number; page: number; limit: number }; error?: string }> {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('limit', String(params.limit ?? 50));
  if (params.status) searchParams.set('status', params.status);
  if (params.subject) searchParams.set('subject', params.subject);
  if (params.classId) searchParams.set('classId', params.classId);
  if (params.academicYear) searchParams.set('academicYear', params.academicYear);
  if (params.semester) searchParams.set('semester', String(params.semester));
  const r = await apiCall(`/assessment/remedials?${searchParams.toString()}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { data: AssessmentSessionData[]; total: number; page: number; limit: number } };
}

export async function fetchFamilyRemedials(params: {
  studentId: string;
  page?: number;
  limit?: number;
}): Promise<{ success: boolean; data?: FamilyRemedialListResponse; error?: string }> {
  const searchParams = new URLSearchParams({
    studentId: params.studentId,
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 5),
  });
  const r = await apiCall(`/assessment/remedials/family?${searchParams.toString()}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as FamilyRemedialListResponse };
}

export async function createRemedialSession(data: {
  title: string;
  sourceGradeIds: string[];
  questionSelections: QuestionSelectionData[];
  dueAt?: string;
  instructions?: string;
  durationMinutes?: number;
  randomizeOrder?: boolean;
}): Promise<{ success: boolean; data?: AssessmentSessionData; error?: string }> {
  const r = await apiCall('/assessment/remedials', 'POST', data);
  if (!r.success) return { success: false, error: r.error };
  revalidatePath('/dashboard/akademik');
  return { success: true, data: r.data as AssessmentSessionData };
}

export async function activateRemedialSession(sessionId: string) {
  const r = await apiCall(`/assessment/remedials/${sessionId}/activate`, 'PATCH');
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function cancelRemedialSession(sessionId: string, reason?: string) {
  const r = await apiCall(`/assessment/remedials/${sessionId}/cancel`, 'PATCH', { ...(reason?.trim() ? { reason: reason.trim() } : {}) });
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function finalizeRemedialParticipant(sessionId: string, participantId: string) {
  const r = await apiCall(`/assessment/remedials/${sessionId}/finalize`, 'POST', { participantId });
  revalidatePath('/dashboard/akademik');
  return r;
}

export async function retryRemedialParticipant(sessionId: string, data: {
  participantId: string;
  title?: string;
  questionSelections: QuestionSelectionData[];
  dueAt?: string;
  instructions?: string;
  durationMinutes?: number;
  randomizeOrder?: boolean;
}) {
  const r = await apiCall(`/assessment/remedials/${sessionId}/retry`, 'POST', data);
  revalidatePath('/dashboard/akademik');
  return r;
}

/** P2 (S-03): GURU starts/activates a session (draft → active). */
export async function startAssessmentSession(
  sessionId: string,
): Promise<{ success: boolean; data?: AssessmentSessionData; error?: string }> {
  const r = await apiCall(`/assessment/sessions/${sessionId}/start`, 'PATCH');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as AssessmentSessionData };
}

/** P2 (S-03): GURU completes a session (active → completed). */
export async function completeAssessmentSession(
  sessionId: string,
): Promise<{ success: boolean; data?: AssessmentSessionData; error?: string }> {
  const r = await apiCall(`/assessment/sessions/${sessionId}/complete`, 'PATCH');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as AssessmentSessionData };
}

/** U2 Wave 4: Export questions as CSV. */
export async function exportQuestionsCsv(subject?: string) {
  const path = subject
    ? `/questions/export?subject=${encodeURIComponent(subject)}`
    : '/questions/export';
  const r = await apiCall(path, 'GET');
  return r;
}

/** U2 Wave 4: Import questions from CSV rows. */
export async function importQuestionsCsv(
  subject: string,
  batchKey: string,
  rows: Array<{ rowKey: string; question: QuestionData }>,
) {
  const r = await apiCall('/questions/import', 'POST', { subject, batchKey, rows });
  revalidatePath('/dashboard/akademik');
  return r;
}

// ── Push Notifications (T3-03 — PWA) ────────────────────────────────────────

/** T3-03: Subscribe to push notifications via POST /push/subscribe. */
export async function subscribePush(dto: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<boolean> {
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
export async function updateLmsProgress(
  moduleId: string,
  progress: number,
): Promise<{ success: boolean; error?: string }> {
  const r = await apiCall(`/lms/modules/${moduleId}/progress`, 'PATCH', { progress });
  if (!r.success) return { success: false, error: r.error };
  return { success: true };
}

/** T3-06: Fetch WA notification logs for admin (KS/SA). */
export async function fetchWaLogs(params?: {
  page?: number;
  limit?: number;
  studentId?: string;
}): Promise<{
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
export async function fetchKktpConfigs(
  academicYear?: string,
  semester?: number,
): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    subject: string;
    kktp: number;
    academicYear: string;
    semester: number;
  }>;
  error?: string;
}> {
  const params = new URLSearchParams();
  if (academicYear) params.set('academicYear', academicYear);
  if (semester) params.set('semester', String(semester));
  const r = await apiCall(`/kktp-config${params.toString() ? '?' + params.toString() : ''}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as Array<{
      id: string;
      subject: string;
      kktp: number;
      academicYear: string;
      semester: number;
    }>,
  };
}

/** T3-02: Save (upsert) a KKTP config. */
export async function saveKktpConfig(data: {
  subject: string;
  kktp: number;
  academicYear: string;
  semester: number;
}): Promise<{ success: boolean; error?: string }> {
  const r = await apiCall('/kktp-config', 'POST', data);
  if (!r.success) return { success: false, error: r.error };
  return { success: true };
}

// ── B1+B2+B3+B4+B6+B7 Frontend Server Actions (Skenario B wiring) ──────────

/** B1: Fetch daily quests for siswa. */
export async function fetchDailyQuests(): Promise<{
  success: boolean;
  data?: {
    date: string;
    quests: Array<{
      id: string;
      title: string;
      desc: string;
      xp: number;
      icon: string;
      type: string;
      completed: boolean;
    }>;
  };
  error?: string;
}> {
  const r = await apiCall('/gamification/daily-quests', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as {
      date: string;
      quests: Array<{
        id: string;
        title: string;
        desc: string;
        xp: number;
        icon: string;
        type: string;
        completed: boolean;
      }>;
    },
  };
}

/** B2: Fetch personal calendar for siswa/ortu. */
export async function fetchPersonalCalendar(): Promise<{
  success: boolean;
  data?: { className: string; schedule: unknown[]; events: unknown[] };
  error?: string;
}> {
  const r = await apiCall('/gamification/personal-calendar', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as { className: string; schedule: unknown[]; events: unknown[] },
  };
}

type StudentAttendanceMonthItem = {
  id: string;
  studentId: string;
  classId: string;
  date: string;
  status: 'hadir' | 'izin' | 'sakit' | 'alpha';
  notes: string | null;
};

/** Fetch attendance rows for the viewed month. SISWA ownership is enforced by API. */
export async function fetchStudentAttendanceMonth(
  year: number,
  monthIndex0: number,
): Promise<{ success: boolean; data?: StudentAttendanceMonthItem[]; error?: string }> {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex0) ||
    monthIndex0 < 0 ||
    monthIndex0 > 11
  ) {
    return { success: false, error: 'Bulan kehadiran tidak valid.' };
  }

  const month = String(monthIndex0 + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  const dateFrom = `${year}-${month}-01`;
  const dateTo = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  const r = await apiCall(`/attendance?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=200`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  const body = r.data as { data?: StudentAttendanceMonthItem[] };
  return { success: true, data: body.data ?? [] };
}

/** B3: Fetch learning timeline for siswa/ortu. */
export async function fetchTimeline(): Promise<{
  success: boolean;
  data?: Array<{
    date: string;
    type: string;
    title: string;
    description: string;
    subject?: string;
  }>;
  error?: string;
}> {
  const r = await apiCall('/student-dashboard/timeline', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as Array<{
      date: string;
      type: string;
      title: string;
      description: string;
      subject?: string;
    }>,
  };
}

/** B4: Fetch teachers for siswa/ortu. */
export async function fetchTeachers(): Promise<{
  success: boolean;
  data?: Array<{
    subject: string;
    teacherName: string;
    phone: string | null;
    email: string | null;
    hoursPerWeek: number;
  }>;
  error?: string;
}> {
  const r = await apiCall('/student-dashboard/teachers', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as Array<{
      subject: string;
      teacherName: string;
      phone: string | null;
      email: string | null;
      hoursPerWeek: number;
    }>,
  };
}

/** B6: Fetch monitoring KBM for KS/SA. */
export async function fetchMonitoringKbm(
  academicYear?: string,
  semester?: number,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const params = new URLSearchParams();
  if (academicYear) params.set('academicYear', academicYear);
  if (semester) params.set('semester', String(semester));
  const r = await apiCall(
    `/analytics/monitoring-kbm${params.toString() ? '?' + params.toString() : ''}`,
    'GET',
  );
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data };
}

/** B7: Fetch rekap audit for KS/SA. */
export async function fetchRekapAudit(
  academicYear?: string,
  semester?: number,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const params = new URLSearchParams();
  if (academicYear) params.set('academicYear', academicYear);
  if (semester) params.set('semester', String(semester));
  const r = await apiCall(
    `/analytics/rekap-audit${params.toString() ? '?' + params.toString() : ''}`,
    'GET',
  );
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data };
}

/** B8: Preview auto-scheduling. */
export async function fetchAutoSchedule(
  academicYear: string,
  semester: number,
  config?: { days?: number; jpPerDay?: number; maxJpGuru?: number },
): Promise<{ success: boolean; data?: unknown; error?: string }> {
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
export async function generateReportCards(
  classId: string,
  academicYear: string,
  semester: number,
): Promise<{
  success: boolean;
  data?: { generated: number; refreshed: number; skipped: number; totalStudents: number };
  error?: string;
}> {
  const r = await apiCall('/report-cards/generate', 'POST', { classId, academicYear, semester });
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as {
      generated: number;
      refreshed: number;
      skipped: number;
      totalStudents: number;
    },
  };
}

/** U1: Update catatan wali kelas (only when status = draft). */
export async function updateReportNotes(
  reportId: string,
  notes: string | null,
  expectedUpdatedAt: string,
): Promise<{
  success: boolean;
  data?: ReportCardItem;
  error?: string;
}> {
  const r = await apiCall(`/report-cards/${reportId}/notes`, 'PATCH', { notes, expectedUpdatedAt });
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as ReportCardItem };
}

/** U1: Fetch rapor by class with optional filters. */
export async function fetchReportCardsByClass(
  classId?: string,
  academicYear?: string,
  semester?: number,
  status?: string,
): Promise<{
  success: boolean;
  data?: { data: ReportCardItem[]; total: number; page: number; limit: number };
  error?: string;
}> {
  const params = new URLSearchParams();
  if (classId) params.set('classId', classId);
  if (academicYear) params.set('academicYear', academicYear);
  if (semester) params.set('semester', String(semester));
  if (status) params.set('status', status);
  const r = await apiCall(
    `/report-cards${params.toString() ? '?' + params.toString() : ''}`,
    'GET',
  );
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as { data: ReportCardItem[]; total: number; page: number; limit: number },
  };
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
  updatedAt: string;
  checkedAt: string | null;
  publishedAt: string | null;
  distributedAt: string | null;
  student: { id: string; nis: string; user: { fullName: string } };
  class: { id: string; name: string };
}

// ── Wave 2: GURU live-data endpoints (W2-A-1 ~ W2-A-4) ────────────────────────

/** R-11: Get SSE stream token (EventSource can't send Authorization header).
 * Returns a short-lived, one-time-use token for ?token=xxx query param.
 * This is NOT the full Keycloak JWT — it's a throwaway token that expires
 * in 5 minutes and can only be used once. Prevents JWT exposure in URLs/logs.
 */
export async function getSseToken(): Promise<{ success: boolean; token?: string; error?: string }> {
  const r = await apiCall('/auth/sse-token', 'POST');
  if (r.success && r.data) {
    return { success: true, token: (r.data as { token: string }).token };
  }
  return { success: false, error: r.error ?? 'Gagal mendapatkan token SSE' };
}

/** W2-A-1: Fetch rekap kehadiran per sesi (agregasi). */
export interface AttendanceSessionItem {
  date: string;
  subject: string;
  className: string;
  hadir: number;
  izin: number;
  sakit: number;
  alpha: number;
  total: number;
  pct: number;
  notes: string | null;
}
export interface AttendanceAttentionItem {
  studentName: string;
  className: string;
  subject: string;
  alphaCount: number;
  reason: string;
}
export interface AttendanceTrendItem {
  date: string;
  pct: number | null;
}
export async function fetchAttendanceSessions(params?: {
  classId?: string;
  subject?: string;
  from?: string;
  to?: string;
  trendDays?: number;
}): Promise<{
  success: boolean;
  data?: {
    sessions: AttendanceSessionItem[];
    attention: AttendanceAttentionItem[];
    trend: AttendanceTrendItem[];
  };
  error?: string;
}> {
  const searchParams = new URLSearchParams();
  if (params?.classId) searchParams.set('classId', params.classId);
  if (params?.subject) searchParams.set('subject', params.subject);
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  if (params?.trendDays) searchParams.set('trendDays', String(params.trendDays));
  const qs = searchParams.toString();
  const r = await apiCall(`/attendance/sessions${qs ? '?' + qs : ''}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as {
      sessions: AttendanceSessionItem[];
      attention: AttendanceAttentionItem[];
      trend: AttendanceTrendItem[];
    },
  };
}

/** W2-A-2: Fetch submissions (tugas list). */
export interface SubmissionItem {
  id: string;
  title: string;
  subject: string;
  className: string;
  deadline: string;
  submitted: number;
  graded: number;
  total: number;
  status: 'aktif' | 'selesai';
}
export interface SubmissionDetailStudent {
  name: string;
  status: 'Terkumpul' | 'Terlambat' | 'Belum';
  fileName: string | null;
  score: number | null;
}
export async function fetchSubmissions(params?: {
  classId?: string;
  subject?: string;
  status?: string;
}): Promise<{
  success: boolean;
  data?: { data: SubmissionItem[]; total: number };
  error?: string;
}> {
  const searchParams = new URLSearchParams();
  if (params?.classId) searchParams.set('classId', params.classId);
  if (params?.subject) searchParams.set('subject', params.subject);
  if (params?.status) searchParams.set('status', params.status);
  const qs = searchParams.toString();
  const r = await apiCall(`/submissions${qs ? '?' + qs : ''}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { data: SubmissionItem[]; total: number } };
}

/** W2-A-2: Fetch submission detail (per-student). */
export async function fetchSubmissionDetails(sessionId: string): Promise<{
  success: boolean;
  data?: {
    id: string;
    title: string;
    subject: string;
    className: string;
    students: SubmissionDetailStudent[];
  };
  error?: string;
}> {
  const r = await apiCall(`/submissions/${sessionId}/details`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as {
      id: string;
      title: string;
      subject: string;
      className: string;
      students: SubmissionDetailStudent[];
    },
  };
}

/** W2-A-3: Fetch CP progress (mapel + CP breakdown). */
export interface MapelProgressItem {
  mapel: string;
  progres: number;
  na: number;
  tuntas: number;
  total: number;
  tp: string;
}
export interface CpBreakdownItem {
  cp: string;
  desc: string;
  progres: number;
  tuntas: number;
  total: number;
}
export async function fetchCpProgress(params?: {
  classId?: string;
  academicYear?: string;
  semester?: number;
}): Promise<{
  success: boolean;
  data?: { mapelProgress: MapelProgressItem[]; cpBreakdown: CpBreakdownItem[] };
  error?: string;
}> {
  const searchParams = new URLSearchParams();
  if (params?.classId) searchParams.set('classId', params.classId);
  if (params?.academicYear) searchParams.set('academicYear', params.academicYear);
  if (params?.semester) searchParams.set('semester', String(params.semester));
  const qs = searchParams.toString();
  const r = await apiCall(`/analytics/cp-progress${qs ? '?' + qs : ''}`, 'GET');
  if (!r.success) return { success: false, error: r.error };
  return {
    success: true,
    data: r.data as { mapelProgress: MapelProgressItem[]; cpBreakdown: CpBreakdownItem[] },
  };
}

/** W2-A-4: Fetch wali kelas classes (homeroom teacher). */
export interface WaliClassItem {
  id: string;
  name: string;
  majorCode: string;
  grade: number;
  academicYear: string;
}
export async function fetchWaliClasses(): Promise<{
  success: boolean;
  data?: { classes: WaliClassItem[]; isWaliKelas: boolean };
  error?: string;
}> {
  const r = await apiCall('/teachers/me/wali-classes', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as { classes: WaliClassItem[]; isWaliKelas: boolean } };
}

// ── P1: Data-integrity endpoints (S-05 teacher attendance + S-09 profile CV) ─────

/** P1 (S-05): Fetch today's teacher attendance summary for KS dashboard. */
export async function fetchTeacherAttendanceToday(): Promise<{
  success: boolean;
  data?: TeacherAttendanceSummary;
  error?: string;
}> {
  const r = await apiCall('/teacher-attendance/today-summary', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as TeacherAttendanceSummary };
}

export interface TeacherAttendanceSummary {
  date: string;
  total: number;
  hadir: number;
  selesai: number;
  belum: number;
  outsideGeofence: number;
  roster: Array<{
    teacherId: string;
    nama: string;
    inisial: string;
    mapel: string;
    status: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    outsideGeofence: boolean;
  }>;
}

/** P1 (S-09): Fetch siswa profile CV aggregate (identity + academic stats). */
export async function fetchProfileCv(): Promise<{
  success: boolean;
  data?: ProfileCvData;
  error?: string;
}> {
  const r = await apiCall('/students/me/profile-cv', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as ProfileCvData };
}

export interface ProfileCvData {
  name: string;
  nis: string;
  email: string;
  phone: string;
  class: string;
  school: string;
  enrollmentDate: string;
  xp: number;
  level: number;
  avgGrade: number | null;
  attendance: number | null;
  modulesCompleted: number;
  streak: number;
}
