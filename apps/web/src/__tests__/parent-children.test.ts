import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ApiFetchResult } from '@/lib/api';
import { readParentChildren, type ParentChildrenState } from '@/lib/parent-children';
import { BellPatternProvider } from '@/components/providers/BellPatternProvider';
import ParentChildrenNotice from '@/app/dashboard/akademik/_components/ortu/ParentChildrenNotice';
import OrtuWorkspace from '@/app/dashboard/akademik/_components/ortu/OrtuWorkspace';

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh, push: jest.fn(), replace: jest.fn() }) }));
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { name: 'Orang tua sintetis' } } }) }));
jest.mock('@/app/dashboard/akademik/actions', () => ({}));
jest.mock('@/components/layout/ViewAsBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/shared/PushNotificationToggle', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/shared/LogoutButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/ortu/RemedialOrtu', () => ({ __esModule: true, default: () => null }));
// Keep the actual workspace, home and identity notice; unrelated screens/modals
// use the framework's automatic JSX runtime, not this legacy Jest transform.
jest.mock('@/app/dashboard/akademik/_components/ortu/KehadiranOrtu', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/ortu/NilaiOrtu', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/ortu/PembayaranOrtu', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/ortu/CapaianOrtu', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/ortu/GradeDetailModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/ortu/DayDetailModal', () => ({
  __esModule: true,
  default: ({ date, notes, status }: { date?: string; notes?: string | null; status: string }) =>
    React.createElement('output', { 'data-day-popup': date }, `${status}: ${notes ?? ''}`),
}));
jest.mock('@/app/dashboard/akademik/_components/ortu/PayDetailModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/ortu/PengumumanModal', () => ({ __esModule: true, default: () => null }));

const children = [{ id: 1, studentId: 'synthetic-child', name: 'IDENTITY-MUST-NOT-LEAK', kelas: 'CLASS-MUST-NOT-LEAK', active: true, avg: 0, att: 0, wali: '—' }];
function workspace(state: ParentChildrenState): string {
  return renderToStaticMarkup(React.createElement(BellPatternProvider, { profiles: [], children:
    React.createElement(OrtuWorkspace, { children, childrenState: state, scheduleStates: { 'synthetic-child': 'ready' } }),
  }));
}

describe('parent identity read outcomes', () => {
  it('exports real SSR identity-state specimens only when explicitly requested', () => {
    const directory = process.env.DIIS_QA_RENDER_DIR;
    if (!directory) return;
    mkdirSync(directory, { recursive: true });
    for (const state of ['denied', 'error', 'empty', 'ready'] as const) {
      writeFileSync(path.join(directory, `parent-child-${state}.html`),
        `<!doctype html><html lang="id" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"></head><body>${workspace(state)}</body></html>`);
    }
  });
  it.each(['forbidden', 'unavailable', 'notFound', 'requestError'] as const)('never retains child data on %s', (status) => {
    const result = { status, httpStatus: 403, message: 'synthetic', data: { data: children } } as ApiFetchResult<{ data: typeof children }>;
    expect(readParentChildren(result)).toEqual({ data: [], state: status === 'forbidden' ? 'denied' : 'error' });
  });
  it('preserves empty success independently of null class', () => {
    expect(readParentChildren({ status: 'success', httpStatus: 200, data: { data: [] } })).toEqual({ state: 'empty', data: [] });
    const assignedIdentity = [{ id: 'child', class: null, user: { fullName: 'Anak sintetis' } }];
    expect(readParentChildren({ status: 'success', httpStatus: 200, data: { data: assignedIdentity } })).toEqual({ state: 'ready', data: assignedIdentity });
  });
  it('rejects a malformed child-list response rather than treating it as empty success', () => {
    const result = { status: 'success', httpStatus: 200, data: { data: null } } as unknown as ApiFetchResult<{ data: typeof children }>;
    expect(readParentChildren(result)).toEqual({ state: 'error', data: [] });
  });
  it.each([null, {}, { id: 'child', user: { fullName: 'Anak' } }, { id: 'child', class: null }])('does not infer class absence from malformed identity %p', (child) => {
    expect(readParentChildren({ status: 'success', httpStatus: 200, data: { data: [child] } })).toEqual({ state: 'error', data: [] });
  });
  it('projects only identity fields required by the parent workspace', () => {
    const child = { id: 'child', class: null, user: { fullName: 'Anak sintetis', email: 'fixture@example.invalid' }, extraPrivateField: 'must-not-forward' };
    expect(readParentChildren({ status: 'success', httpStatus: 200, data: { data: [child] } }).data).toEqual([
      { id: 'child', class: null, user: { fullName: 'Anak sintetis' } },
    ]);
  });
  it.each(['denied', 'error', 'empty'] as const)('real workspace hides supplied stale child identity on %s', (state) => {
    const html = workspace(state);
    expect(html).not.toContain('IDENTITY-MUST-NOT-LEAK');
    expect(html).not.toContain('CLASS-MUST-NOT-LEAK');
    expect(html).not.toContain('melengkapi penempatan kelas');
    expect(html).not.toContain('Libur');
    expect(html).toContain(state === 'denied' ? 'Akses data anak tidak diizinkan'
      : state === 'empty' ? 'Belum ada anak yang terhubung' : 'Data anak belum dapat dimuat');
  });
  it('renders linked identity again after access restoration', () => {
    expect(workspace('denied')).not.toContain('IDENTITY-MUST-NOT-LEAK');
    const html = workspace('ready');
    expect(html).toContain('IDENTITY-MUST-NOT-LEAK');
    expect(html).toContain('CLASS-MUST-NOT-LEAK');
    expect(html).not.toContain('Akses data anak tidak diizinkan');
  });
  it('provides retry only for failed loads and keeps truthful distinct messages', () => {
    const error = renderToStaticMarkup(React.createElement(ParentChildrenNotice, { state: 'error' }));
    expect(error).toContain('role="alert"');
    expect(error).toContain('Muat ulang data anak');
    for (const state of ['denied', 'empty'] as const) {
      const html = renderToStaticMarkup(React.createElement(ParentChildrenNotice, { state }));
      expect(html).toContain('role="status"');
      expect(html).not.toContain('Muat ulang data anak');
    }
  });
});

describe('parent attendance modal uses the current child and current record', () => {
  const modal = {
    type: 'day',
    data: {
      studentId: 'synthetic-child',
      date: '2026-10-02',
      day: 2,
      month: 'Okt',
      year: 2026,
      status: 'alpha',
      notes: 'STALE-SNAPSHOT',
    },
  };
  const record = {
    id: 'attendance-1',
    studentId: 'synthetic-child',
    classId: 'class-1',
    date: '2026-10-02',
    status: 'izin' as const,
    notes: 'LATEST-SCHOOL-NOTE',
    student: { id: 'synthetic-child', nis: 'SYN', user: { fullName: 'Sintetis' } },
    class: { id: 'class-1', name: 'X AKL', majorCode: 'AKL' },
  };
  function opened(
    options: {
      state?: 'ready' | 'unavailable' | 'denied';
      modalStudent?: string;
      records?: (typeof record)[];
    } = {},
  ) {
    const originalUseState = React.useState;
    const useState = ((initial: unknown) => {
      if (initial && typeof initial === 'object' && 'type' in initial && initial.type === null) {
        return [
          {
            ...modal,
            data: { ...modal.data, studentId: options.modalStudent ?? 'synthetic-child' },
          },
          jest.fn(),
        ];
      }
      return originalUseState(initial);
    }) as typeof React.useState;
    const spy = jest.spyOn(React, 'useState').mockImplementation(useState);
    try {
      return renderToStaticMarkup(
        React.createElement(OrtuWorkspace, {
          children,
          childrenState: 'ready',
          attendance: options.records ?? [record],
          attendanceStates: { 'synthetic-child': options.state ?? 'ready' },
        }),
      );
    } finally {
      spy.mockRestore();
    }
  }
  it('resolves status and notes from the latest record instead of the modal snapshot', () => {
    const html = opened();
    expect(html).toContain('data-day-popup="2026-10-02"');
    expect(html).toContain('izin: LATEST-SCHOOL-NOTE');
    expect(html).not.toContain('STALE-SNAPSHOT');
  });
  it('cannot keep a popup for a different child', () => {
    expect(opened({ modalStudent: 'other-child' })).not.toContain('data-day-popup');
  });
  it.each(['unavailable', 'denied'] as const)(
    'hides previous popup data when attendance becomes %s',
    (state) => {
      const html = opened({ state });
      expect(html).not.toContain('data-day-popup');
      expect(html).not.toContain('LATEST-SCHOOL-NOTE');
    },
  );
  it('does not retain stale notes if the selected record disappears', () => {
    const html = opened({ records: [] });
    expect(html).toContain('none: ');
    expect(html).not.toContain('STALE-SNAPSHOT');
    expect(html).not.toContain('LATEST-SCHOOL-NOTE');
  });
});
