import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import KsWorkspace from '@/app/dashboard/akademik/_components/KsWorkspace';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/app/dashboard/akademik/actions', () => ({
  fetchMonitoringKbm: jest.fn(),
  fetchTeacherAttendanceToday: jest.fn(),
}));
jest.mock('@/app/dashboard/akademik/_components/LearningRecap', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/dashboard/akademik/_components/ks/RaporPipelineKs', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/dashboard/akademik/_components/ks/KktpKs', () => ({
  __esModule: true,
  default: () => null,
}));

const render = () =>
  renderToStaticMarkup(
    React.createElement(KsWorkspace, {
      grades: [],
      attendances: [],
      classes: [],
      assignments: [],
      rpp: [],
      schedules: [],
      activities: [],
      lmsModules: [],
      academicYear: '2026/2027',
      semester: 1,
    }),
  );

describe('KS workspace native interaction semantics', () => {
  it('R05 all five interactive overview KPIs are native keyboard buttons', () => {
    const html = render();
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    for (const label of [
      'Kehadiran Siswa',
      'Presensi Guru Tercatat',
      'Kelas Terjadwal Hari Ini',
      'Modul Pending',
      'Sumatif Aktif',
    ]) {
      const card = buttons.find((text) => text.includes(label));
      expect(card).toBeDefined();
      expect(card).toContain('type="button"');
      expect(card).toContain('focus-visible:outline');
      expect(card).not.toContain('tabindex="-1"');
    }
  });
  it('R05 teacher and subject selects have stable accessible names', () => {
    const html = render();
    expect(html).toMatch(/<select[^>]*aria-label="Filter guru"/);
    expect(html).toMatch(/<select[^>]*aria-label="Filter mata pelajaran"/);
  });
  it('unavailable values stay honest and do not disable navigation', () => {
    const html = render();
    expect(html).toContain('Belum tersedia');
    expect(html).toContain('Jadwal tidak tersedia untuk hari ini');
    expect(html).not.toContain('cursor-not-allowed');
    expect(html).not.toContain('role="dialog"');
  });
});
