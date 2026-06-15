// =============================================================================
// Tipe bersama Dasbor Eksekutif — cermin keluaran endpoint /analytics + reuse.
// =============================================================================

export interface ExecFilters {
  academicYear?: string;
  semester?: number;
  majorCode?: string;
}

export interface MajorRef {
  code: string;
  name: string;
}

// ── /analytics/grades ────────────────────────────────────────────────────────
export interface GradeBox {
  majorCode: string;
  count: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
  kkmPassRate: number;
}
export interface KkmMatrix {
  majors: string[];
  subjects: string[];
  cells: { majorCode: string; subject: string; count: number; passRate: number | null }[];
}
export interface GradeAnalytics {
  filters: { academicYear: string; semester: number; kkm: number; majorCode: string | null; classId: string | null };
  overall: { count: number; mean: number; median: number; q1: number; q3: number; min: number; max: number; kkmPassRate: number };
  byMajor: GradeBox[];
  bySubject: { subject: string; count: number; mean: number; kkmPassRate: number }[];
  kkmMatrix: KkmMatrix;
  correlation: { r: number; n: number; points: { x: number; y: number }[] };
}

// ── /analytics/at-risk ───────────────────────────────────────────────────────
export interface AtRisk {
  total: number;
  byClass: { className: string; majorCode: string; grade: number; count: number }[];
  windowDays: number;
  threshold: number;
}

// ── /analytics/finance/aging ─────────────────────────────────────────────────
export interface Aging {
  buckets: { key: string; label: string; amount: number; students: number }[];
  totalAmount: number;
  totalStudents: number;
}

// ── /analytics/teacher-compliance ────────────────────────────────────────────
export interface TeacherCompliance {
  totalTeachers: number;
  presentToday: number;
  gpsPct: number | null;
  rpp: { draft: number; submitted: number; approved: number; revision: number; total: number; approvalRate: number | null };
}

// ── /ppdb/stats ──────────────────────────────────────────────────────────────
export interface PpdbStats {
  total: number;
  byStatus: Record<string, number>;
  conversionRate: number;
}

// ── Derived (dihitung server-side) ───────────────────────────────────────────
export interface HealthPilar {
  label: string;
  pct: number | null;
  fase2?: boolean;
}
export interface KioskHealth {
  score: number | null;
  delta: number | null;
  pilars: HealthPilar[];
}
export interface Kpi {
  studentPct: number | null;
  studentDelta: number | null;
  studentSpark: number[];
  teacherPct: number | null;
  avgGrade: number | null;
  sppCollectedPct: number | null;
  ppdbConversion: number | null;
}
export interface TrenSeries {
  labels: string[];
  pcts: number[];
}
export interface SppMonth {
  month: number;
  year: number;
  paid: number;
  total: number;
  pct: number;
}
export interface SystemStatus {
  overall: 'ok' | 'error' | 'unknown';
  services: { label: string; ok: boolean }[];
}

export interface ExecutiveData {
  filters: ExecFilters & { academicYear: string; semester: number };
  majors: MajorRef[];
  studentsActive: number | null;
  health: KioskHealth;
  kpi: Kpi;
  tren: TrenSeries;
  grades: GradeAnalytics | null;
  atRisk: AtRisk | null;
  aging: Aging | null;
  teacher: TeacherCompliance | null;
  ppdb: PpdbStats | null;
  spp: SppMonth[];
  system: SystemStatus;
}
