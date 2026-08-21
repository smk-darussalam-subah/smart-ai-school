import type { ReadinessMetric } from './actions';

export type SemesterClosingAuthority = {
  can: (permission: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
};

export function formatReadinessMetric(metric: Pick<ReadinessMetric, 'value' | 'total'>): string {
  return metric.total === undefined ? String(metric.value) : `${metric.value}/${metric.total}`;
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
