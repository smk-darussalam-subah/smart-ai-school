'use server';

import { getServerSession } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/api';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
const PATH = '/dashboard/penutupan-semester';

async function apiCall<T>(path: string, method: string, body?: unknown): Promise<
  { success: true; data: T } | { success: false; error: string; status?: number }
> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/login?reason=session');
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers: body
        ? { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' }
        : { Authorization: `Bearer ${session.accessToken}` },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) as unknown : null;
    if (!res.ok) {
      if (res.status === 401) redirect('/login?reason=session');
      return { success: false, status: res.status, error: apiErrorMessage(json, 'Permintaan penutupan semester gagal.') };
    }
    revalidatePath(PATH);
    return { success: true, data: json as T };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { success: false, error: 'Koneksi ke server gagal. Coba lagi.' };
  }
}

async function apiTextCall(path: string, method: string): Promise<
  { success: true; data: string } | { success: false; error: string; status?: number }
> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/login?reason=session');
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: 'no-store',
    });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) redirect('/login?reason=session');
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = { message: text };
      }
      return { success: false, status: res.status, error: apiErrorMessage(parsed, 'Export laporan semester gagal.') };
    }
    return { success: true, data: text };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { success: false, error: 'Koneksi ke server gagal. Coba lagi.' };
  }
}

export async function refreshSemesterReadiness(semesterId?: string) {
  const query = semesterId ? `?semesterId=${encodeURIComponent(semesterId)}` : '';
  return apiCall<SemesterReadiness>(`/semester-closing/readiness${query}`, 'GET');
}

export async function closeSemesterAction(input: {
  semesterId: string;
  nextSemesterId?: string | null;
  readinessVersion: string;
  readinessHash: string;
  idempotencyKey: string;
  confirmation: 'TUTUP SEMESTER';
}) {
  return apiCall<SemesterClosureDetail>('/semester-closing/close', 'POST', input);
}

export async function listSemesterClosuresAction() {
  return apiCall<{ data: SemesterClosureSummary[] }>('/semester-closing/closures', 'GET');
}

export async function getSemesterClosureDetailAction(id: string) {
  return apiCall<SemesterClosureDetail>(`/semester-closing/closures/${encodeURIComponent(id)}`, 'GET');
}

export async function exportClosureCsvAction(id: string) {
  return apiTextCall(`/semester-closing/closures/${id}/export.csv`, 'GET');
}

export type ReadinessItem = {
  code: string;
  owner: string;
  count: number;
  action: string;
  message: string;
};

export type ReadinessMetric = {
  code: string;
  label: string;
  value: number;
  total?: number;
};

export type SemesterReadiness = {
  ready: boolean;
  readinessVersion: string;
  readinessHash: string;
  generatedAt: string;
  closedAt: string | null;
  period: {
    academicYearId: string;
    academicYear: string;
    semesterId: string;
    semester: number;
    startDate: string;
    endDate: string;
  };
  nextPeriod: null | {
    academicYearId: string;
    academicYear: string;
    semesterId: string;
    semester: number;
    startDate: string;
    endDate: string;
  };
  scope: {
    kind: 'school' | 'major' | 'teacher';
    majorCodes?: string[];
  };
  metrics: ReadinessMetric[];
  blockers: ReadinessItem[];
  warnings: ReadinessItem[];
  finalReport?: SemesterFinalReport;
};

export type SemesterClosureSnapshot = {
  readinessVersion: string;
  period: SemesterReadiness['period'];
  nextPeriod: SemesterReadiness['nextPeriod'];
  scope: SemesterReadiness['scope'];
  metrics: ReadinessMetric[];
  blockers: ReadinessItem[];
  warnings: ReadinessItem[];
  finalReport: SemesterFinalReport;
};

export type SemesterFinalReport = {
  classHeatmap: Array<{
    className: string;
    majorCode: string | null;
    activeStudents: number;
    distributedReports: number;
    gradeRecords: number;
    averageScore: number | null;
    belowKktpCount: number;
  }>;
  majorHeatmap: Array<{
    majorCode: string;
    activeStudents: number;
    distributedReports: number;
    gradeRecords: number;
    averageScore: number | null;
    belowKktpCount: number;
  }>;
  subjectKktp: Array<{
    subject: string;
    kktp: number | null;
    provenance: string;
    gradeRecords: number;
    belowKktpCount: number;
    passRate: number | null;
  }>;
  curriculumMap: Array<{
    className: string;
    subject: string;
    cpCount: number;
    tpCount: number;
    atpCount: number;
    cpStatus: 'terisi' | 'belum_terisi';
    tpRefs: string[];
    mappedAtpCount: number;
    unmappedAtpCount: number;
    invalidReasonCodes: string[];
  }>;
};

export type SemesterClosureSummary = {
  id: string;
  closedAt: string;
  readinessVersion: string;
  readinessHash: string;
  semester: { number: number; academicYear: { code: string } };
  closedBy: { fullName: string | null };
};

export type SemesterClosureDetail = {
  id: string;
  closedAt: string;
  readinessVersion: string;
  readinessHash: string;
  semesterId: string;
  nextSemesterId: string | null;
  semester: { number: number; academicYear: { code: string } };
  closedBy: { fullName: string | null };
  snapshot: SemesterClosureSnapshot;
};
