import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  buildSemesterCloseIdempotencyKey,
  canCloseSemesterFromAuthority,
  canReadSemesterClosingReadiness,
  canReadSemesterFinalReport,
  canSubmitSemesterClose,
  closureCsvFilename,
  formatKktpProvenance,
  formatSemesterDateTime,
  formatReadinessMetric,
  isReadinessStale,
  safeCsvFilenameSegment,
  semesterClosingUnavailableCopy,
} from '../app/dashboard/penutupan-semester/semester-closing-ui';
import SemesterClosingClient, { HistoricalReportPanel } from '../app/dashboard/penutupan-semester/_components/SemesterClosingClient';
import { getRoutePermissions } from '../lib/permissions';

jest.mock('../app/dashboard/penutupan-semester/actions', () => ({
  closeSemesterAction: jest.fn(),
  exportClosureCsvAction: jest.fn(),
  getSemesterClosureDetailAction: jest.fn(),
  listSemesterClosuresAction: jest.fn(),
  refreshSemesterReadiness: jest.fn(),
}));

const readiness = {
  ready: true,
  closedAt: null,
  period: {
    academicYearId: 'ay-1',
    academicYear: '2026/2027',
    semesterId: 'sem-1',
    semester: 1,
    startDate: '2026-07-01',
    endDate: '2026-12-31',
  },
  nextPeriod: null,
  scope: { kind: 'teacher' as const },
  readinessVersion: 'wave7.v1',
  readinessHash: 'a'.repeat(64),
  generatedAt: '2026-08-20T01:00:00.000Z',
  metrics: [{ code: 'rpp', label: 'Modul Ajar', value: 1, total: 2 }],
  blockers: [],
  warnings: [],
  finalReport: {
    classHeatmap: [{ className: 'X TKJ 1', majorCode: 'TKJ', activeStudents: 30, distributedReports: 30, gradeRecords: 60, averageScore: 82.5, belowKktpCount: 3 }],
    majorHeatmap: [{ majorCode: 'TKJ', activeStudents: 30, distributedReports: 30, gradeRecords: 60, averageScore: 82.5, belowKktpCount: 3 }],
    subjectKktp: [{ subject: 'Matematika', kktp: 75, provenance: 'config', gradeRecords: 30, belowKktpCount: 2, passRate: 93.33 }],
    curriculumMap: [{
      className: 'X TKJ 1',
      subject: 'Matematika',
      cpCount: 1,
      tpCount: 3,
      atpCount: 3,
      cpStatus: 'terisi' as const,
      tpRefs: ['TP 1', 'TP 2', 'TP 3'],
      mappedAtpCount: 3,
      unmappedAtpCount: 0,
      invalidReasonCodes: [],
    }],
  },
};

describe('semester closing UI helpers', () => {
  it('requires active Kepala Sekolah view, exact confirmation, fresh hash, and no pending request', () => {
    expect(canSubmitSemesterClose({
      canCloseSemester: true,
      readiness,
      confirmation: 'TUTUP SEMESTER',
      stale: false,
      pending: false,
    })).toBe(true);

    expect(canSubmitSemesterClose({
      canCloseSemester: false,
      readiness,
      confirmation: 'TUTUP SEMESTER',
      stale: false,
      pending: false,
    })).toBe(false);
    expect(canSubmitSemesterClose({
      canCloseSemester: true,
      readiness,
      confirmation: 'TUTUP SEMESTER',
      stale: true,
      pending: false,
    })).toBe(false);
    expect(canSubmitSemesterClose({
      canCloseSemester: true,
      readiness: { ...readiness, closedAt: '2026-08-20T00:00:00.000Z' },
      confirmation: 'TUTUP SEMESTER',
      stale: false,
      pending: false,
    })).toBe(false);
    expect(canSubmitSemesterClose({
      canCloseSemester: true,
      readiness,
      confirmation: 'tutup semester',
      stale: false,
      pending: false,
    })).toBe(false);
  });

  it('derives final-report and close UI capability from effective dashboard roles, so view-as hides Appointment controls', () => {
    const realKsAuthority = {
      can: (permission: string) => ['academic.final-report.read', 'academic.semester.close'].includes(permission),
      hasRole: (...roles: string[]) => roles.includes('KEPALA_SEKOLAH'),
    };
    const viewAsGuruAuthority = {
      can: (permission: string) => ['academic.final-report.read', 'academic.semester.close'].includes(permission),
      hasRole: (...roles: string[]) => roles.includes('GURU'),
    };

    expect(canReadSemesterFinalReport(realKsAuthority)).toBe(true);
    expect(canCloseSemesterFromAuthority(realKsAuthority)).toBe(true);
    expect(canReadSemesterFinalReport(viewAsGuruAuthority)).toBe(false);
    expect(canCloseSemesterFromAuthority(viewAsGuruAuthority)).toBe(false);
  });

  it('builds deterministic idempotency key, PII-free CSV filename, and bounded stale checks', () => {
    expect(buildSemesterCloseIdempotencyKey(readiness)).toBe(`semester-close:sem-1:${'a'.repeat(64)}`);
    expect(closureCsvFilename({ academicYear: '2026/2027', semester: 1 })).toBe('laporan-penutupan-semester-2026-2027-semester-1.csv');
    expect(safeCsvFilenameSegment(' 2026/2027 <script> ')).toBe('2026-2027-script');
    expect(isReadinessStale(readiness, readiness.readinessHash, new Date(readiness.generatedAt).getTime() + 60_000)).toBe(false);
    expect(isReadinessStale(readiness, readiness.readinessHash, new Date(readiness.generatedAt).getTime() + 301_000)).toBe(true);
    expect(isReadinessStale(readiness, readiness.readinessHash, new Date(readiness.generatedAt).getTime() + 300_001)).toBe(true);
    expect(isReadinessStale(readiness, 'b'.repeat(64), new Date(readiness.generatedAt).getTime() + 60_000)).toBe(true);
  });

  it('formats metric totals and keeps the scoped route permission-neutral', () => {
    expect(formatReadinessMetric({ value: 3 })).toBe('3');
    expect(formatReadinessMetric({ value: 7, total: 10 })).toBe('7/10');
    expect(getRoutePermissions('/dashboard/penutupan-semester')).toEqual([]);
  });

  it('formats semester timestamps with the app timezone to avoid hydration drift', () => {
    expect(formatSemesterDateTime('2026-08-20T01:00:00.000Z')).toContain('08.00');
  });

  it('maps KKTP provenance to operator-safe labels without leaking raw internal codes', () => {
    expect(formatKktpProvenance('system_default')).toBe('Standar sekolah');
    expect(formatKktpProvenance('config')).toBe('Konfigurasi kelas');
    expect(formatKktpProvenance('module')).toBe('Ketentuan modul');
    expect(formatKktpProvenance('unconfigured')).toBe('Belum dikonfigurasi');
    expect(formatKktpProvenance('legacy_internal_code')).toBe('Sumber lain');
  });

  it('keeps readiness route access explicit before fetching semester data', () => {
    expect(canReadSemesterClosingReadiness({
      can: () => false,
      hasRole: (...roles: string[]) => roles.includes('GURU'),
    })).toBe(true);
    expect(canReadSemesterClosingReadiness({
      can: () => false,
      hasRole: (...roles: string[]) => roles.includes('TATA_USAHA'),
    })).toBe(false);
    expect(semesterClosingUnavailableCopy('access-denied').title).toContain('Akses penutupan semester ditolak');
    expect(semesterClosingUnavailableCopy('no-active-period').title).toContain('Periode aktif belum valid');
    expect(semesterClosingUnavailableCopy('api-error').title).toContain('tidak dapat dimuat');
  });

  it('renders GURU readiness without final report or history tabs', () => {
    const html = renderToString(React.createElement(SemesterClosingClient, {
      initialReadiness: readiness,
      initialClosures: [],
      canReadFinalReport: false,
      canCloseSemester: false,
    }));

    expect(html).toContain('Scope guru');
    expect(html).toContain('Kesiapan');
    expect(html).not.toContain('Capaian');
    expect(html).not.toContain('Riwayat');
    expect(html).not.toContain('Tutup Semester Final');
  });

  it('renders close action only for Kepala Sekolah close authority', () => {
    const html = renderToString(React.createElement(SemesterClosingClient, {
      initialReadiness: readiness,
      initialClosures: [],
      canReadFinalReport: true,
      canCloseSemester: true,
    }));

    expect(html).toContain('Capaian');
    expect(html).toContain('Riwayat');
    expect(html).toContain('Tutup Semester Final');
  });

  it('renders read-only policy note for oversight readers without close authority', () => {
    const html = renderToString(React.createElement(SemesterClosingClient, {
      initialReadiness: readiness,
      initialClosures: [],
      canReadFinalReport: true,
      canCloseSemester: false,
    }));

    expect(html).toContain('Capaian');
    expect(html).toContain('Riwayat');
    expect(html).toContain('Mode Tinjau');
    expect(html).not.toContain('Ketik TUTUP SEMESTER');
    expect(html).not.toContain('Tutup Semester Final');
  });

  it('renders distinct no-access state without generic configuration copy', () => {
    const html = renderToString(React.createElement(SemesterClosingClient, {
      initialReadiness: null,
      initialClosures: [],
      canReadFinalReport: false,
      canCloseSemester: false,
      unavailableReason: 'access-denied',
    }));

    expect(html).toContain('Akses penutupan semester ditolak');
    expect(html).not.toContain('Periksa izin atau konfigurasi periode aktif');
  });

  it('renders history rows with report-open and period-bound CSV actions', () => {
    const html = renderToString(React.createElement(SemesterClosingClient, {
      initialReadiness: readiness,
      initialClosures: [{
        id: 'closure-1',
        closedAt: '2026-08-20T02:00:00.000Z',
        readinessVersion: 'wave7.v1',
        readinessHash: 'b'.repeat(64),
        semester: { number: 1, academicYear: { code: '2026/2027' } },
        closedBy: { fullName: 'Kepala Sekolah' },
      }],
      canReadFinalReport: true,
      canCloseSemester: true,
      initialTab: 'history',
    }));

    expect(html).toContain('Lihat laporan');
    expect(html).toContain('CSV');
    expect(html).toContain('Pilih laporan dari tabel riwayat');
  });

  it('renders history API failure as retryable error instead of false empty state', () => {
    const html = renderToString(React.createElement(SemesterClosingClient, {
      initialReadiness: readiness,
      initialClosures: [],
      canReadFinalReport: true,
      canCloseSemester: false,
      initialTab: 'history',
      initialClosuresError: 'Riwayat gagal dimuat',
    }));

    expect(html).toContain('Riwayat belum dapat dimuat.');
    expect(html).toContain('Riwayat gagal dimuat');
    expect(html).toContain('Coba lagi');
    expect(html).not.toContain('Belum ada semester yang ditutup.');
  });

  it('renders retry-success history state as real rows without stale error copy', () => {
    const html = renderToString(React.createElement(SemesterClosingClient, {
      initialReadiness: readiness,
      initialClosures: [{
        id: 'closure-retry',
        closedAt: '2026-08-20T02:00:00.000Z',
        readinessVersion: 'wave7.v1',
        readinessHash: 'd'.repeat(64),
        semester: { number: 1, academicYear: { code: '2026/2027' } },
        closedBy: { fullName: 'Kepala Sekolah' },
      }],
      canReadFinalReport: true,
      canCloseSemester: false,
      initialTab: 'history',
      initialClosuresError: null,
    }));

    expect(html).toMatch(/Semester[\s\S]*1[\s\S]*2026\/2027/);
    expect(html).toContain('Lihat laporan');
    expect(html).not.toContain('Riwayat belum dapat dimuat.');
  });

  it('renders historical report from immutable closure snapshot rather than current readiness preview', () => {
    const historicalSnapshot = {
      ...readiness,
      ready: undefined,
      generatedAt: undefined,
      closedAt: undefined,
      readinessHash: undefined,
      period: { ...readiness.period, academicYear: '2025/2026', semester: 2 },
      finalReport: {
        classHeatmap: [{ className: 'XII AKL 1', majorCode: 'AKL', activeStudents: 28, distributedReports: 28, gradeRecords: 56, averageScore: 91, belowKktpCount: 0 }],
        majorHeatmap: [{ majorCode: 'AKL', activeStudents: 28, distributedReports: 28, gradeRecords: 56, averageScore: 91, belowKktpCount: 0 }],
        subjectKktp: [{ subject: 'Akuntansi', kktp: 78, provenance: 'snapshot', gradeRecords: 28, belowKktpCount: 0, passRate: 100 }],
        curriculumMap: [{
          className: 'XII AKL 1',
          subject: 'Akuntansi',
          cpCount: 1,
          tpCount: 2,
          atpCount: 2,
          cpStatus: 'terisi' as const,
          tpRefs: ['TP 1', 'TP 2'],
          mappedAtpCount: 2,
          unmappedAtpCount: 0,
          invalidReasonCodes: [],
        }],
      },
    };
    const html = renderToString(React.createElement(HistoricalReportPanel, {
      closure: {
        id: 'closure-old',
        closedAt: '2026-06-30T02:00:00.000Z',
        readinessVersion: 'wave7.v1',
        readinessHash: 'c'.repeat(64),
        semesterId: 'sem-old',
        nextSemesterId: 'sem-next',
        semester: { number: 2, academicYear: { code: '2025/2026' } },
        closedBy: { fullName: 'Kepala Sekolah' },
        snapshot: historicalSnapshot,
      },
      onDownload: jest.fn(),
      onPrint: jest.fn(),
      pending: false,
    }));

    expect(html).toContain('Laporan Final Historis');
    expect(html).toContain('Semester 2 2025/2026');
    expect(html).toContain('XII AKL 1');
    expect(html).not.toContain('X TKJ 1');
  });

  it('keeps selected closure visible when post-close history refresh fails', () => {
    const historicalSnapshot = {
      ...readiness,
      ready: undefined,
      generatedAt: undefined,
      closedAt: undefined,
      readinessHash: undefined,
      period: { ...readiness.period, academicYear: '2026/2027', semester: 1 },
    };
    const html = renderToString(React.createElement(SemesterClosingClient, {
      initialReadiness: readiness,
      initialClosures: [],
      canReadFinalReport: true,
      canCloseSemester: true,
      initialTab: 'history',
      initialClosuresError: 'Riwayat belum berhasil dimuat ulang. API riwayat gagal.',
      initialSelectedClosure: {
        id: 'closure-new',
        closedAt: '2026-08-20T02:00:00.000Z',
        readinessVersion: 'wave7.v1',
        readinessHash: 'e'.repeat(64),
        semesterId: 'sem-1',
        nextSemesterId: null,
        semester: { number: 1, academicYear: { code: '2026/2027' } },
        closedBy: { fullName: 'Kepala Sekolah' },
        snapshot: historicalSnapshot,
      },
    }));

    expect(html).toContain('Laporan Final Historis');
    expect(html).toContain('Semester 1 2026/2027');
    expect(html).toContain('Riwayat belum berhasil dimuat ulang.');
    expect(html).not.toContain('Belum ada semester yang ditutup.');
  });
});
