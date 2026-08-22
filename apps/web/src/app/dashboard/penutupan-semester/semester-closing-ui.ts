import type { ReadinessMetric } from './actions';

const APP_TIME_ZONE = 'Asia/Jakarta';

export type SemesterClosingAuthority = {
  can: (permission: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
};

export type SemesterClosingUnavailableReason =
  | 'access-denied'
  | 'no-active-period'
  | 'api-error';

export function formatSemesterDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}

export function formatReadinessMetric(metric: Pick<ReadinessMetric, 'value' | 'total'>): string {
  return metric.total === undefined ? String(metric.value) : `${metric.value}/${metric.total}`;
}

export function formatKktpProvenance(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'module') return 'Ketentuan modul';
  if (normalized === 'config') return 'Konfigurasi kelas';
  if (normalized === 'system_default') return 'Standar sekolah';
  if (normalized === 'unconfigured') return 'Belum dikonfigurasi';
  if (normalized === 'snapshot') return 'Snapshot resmi';
  return 'Sumber lain';
}

export function buildSemesterCloseIdempotencyKey(readiness: { period: { semesterId: string }; readinessHash: string }): string {
  return `semester-close:${readiness.period.semesterId}:${readiness.readinessHash}`;
}

export function canSubmitSemesterClose(input: {
  canCloseSemester: boolean;
  readiness: { ready: boolean; closedAt: string | null } | null;
  confirmation: string;
  stale: boolean;
  pending: boolean;
}): boolean {
  return (
    input.canCloseSemester &&
    input.readiness?.ready === true &&
    !input.readiness.closedAt &&
    input.confirmation === 'TUTUP SEMESTER' &&
    !input.stale &&
    !input.pending
  );
}

export function canReadSemesterClosingReadiness(authority: SemesterClosingAuthority): boolean {
  return authority.hasRole('SUPER_ADMIN', 'GURU', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG');
}

export function canReadSemesterFinalReport(authority: SemesterClosingAuthority): boolean {
  return (
    authority.can('academic.final-report.read') &&
    authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG')
  );
}

export function canCloseSemesterFromAuthority(authority: SemesterClosingAuthority): boolean {
  return (
    authority.can('academic.semester.close') &&
    authority.hasRole('KEPALA_SEKOLAH')
  );
}

export function semesterClosingUnavailableCopy(reason: SemesterClosingUnavailableReason): {
  title: string;
  description: string;
  className: string;
} {
  if (reason === 'access-denied') {
    return {
      title: 'Akses penutupan semester ditolak',
      description: 'Fitur ini hanya tersedia untuk Super Admin, Guru, Kepala Sekolah, Waka Kurikulum, atau Kaprog dengan kewenangan aktif.',
      className: 'border-amber-200 bg-amber-50 text-amber-950',
    };
  }
  if (reason === 'no-active-period') {
    return {
      title: 'Periode aktif belum valid',
      description: 'Tahun ajaran dan semester aktif harus tepat satu sebelum preview penutupan semester dapat dihitung.',
      className: 'border-slate-200 bg-slate-50 text-slate-900',
    };
  }
  return {
    title: 'Data penutupan semester tidak dapat dimuat',
    description: 'Koneksi atau layanan akademik sedang bermasalah. Coba segarkan halaman atau ulangi setelah layanan pulih.',
    className: 'border-red-200 bg-red-50 text-red-950',
  };
}

export function safeCsvFilenameSegment(value: string | number): string {
  const normalized = String(value)
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || 'periode';
}

export function closureCsvFilename(period: { academicYear: string; semester: number }): string {
  const academicYear = safeCsvFilenameSegment(period.academicYear);
  const semester = safeCsvFilenameSegment(period.semester);
  return `laporan-penutupan-semester-${academicYear}-semester-${semester}.csv`;
}

export function isReadinessStale(
  readiness: { generatedAt: string; readinessHash: string } | null,
  latestHash: string,
  nowMs = Date.now(),
  maxAgeMs = 5 * 60_000,
): boolean {
  if (!readiness) return true;
  if (latestHash && latestHash !== readiness.readinessHash) return true;
  const generatedAt = new Date(readiness.generatedAt).getTime();
  if (!Number.isFinite(generatedAt)) return true;
  return nowMs - generatedAt > maxAgeMs;
}
