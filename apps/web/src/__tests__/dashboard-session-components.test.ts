import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const mockPreview = jest.fn(),
  mockPrepare = jest.fn();
jest.mock('@/app/dashboard/jadwal/session-actions', () => ({
  previewClassSessions: (...args: unknown[]) => mockPreview(...args),
  prepareClassSessions: (...args: unknown[]) => mockPrepare(...args),
}));
jest.mock('@/app/dashboard/jadwal/actions', () => ({
  startClassSession: jest.fn(),
  completeClassSession: jest.fn(),
  cancelClassSession: jest.fn(),
  reassignClassSession: jest.fn(),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
import SessionPreparationPanel from '@/app/dashboard/jadwal/_components/SessionPreparationPanel';
import SessionActivationPanel from '@/app/dashboard/jadwal/_components/SessionActivationPanel';
import TodayClassSessions from '@/app/dashboard/jadwal/_components/TodayClassSessions';
import RingkasanGuru from '@/app/dashboard/akademik/_components/RingkasanGuru';

const sessions = [true, false].map((canOperate, index) => ({
  id: String(index),
  canOperate,
  classNameSnapshot: 'Kelas Sintetis',
  subjectSnapshot: 'Mapel Sintetis',
  roomSnapshot: null,
  status: 'SCHEDULED',
  scheduledStartAt: '2026-10-20T02:00:00Z',
  scheduledEndAt: '2026-10-20T03:00:00Z',
}));
describe('production session components (SSR, not browser acceptance)', () => {
  it('activation is unknown on first render and cannot mutate before server status and preview', () => {
    const html = renderToStaticMarkup(
      React.createElement(SessionActivationPanel, { today: '2026-10-20' }),
    );
    expect(html).toContain('Status belum terverifikasi');
    expect(html).not.toContain('Konfirmasi aktivasi');
    expect(html).not.toContain('Periksa &amp; aktifkan');
    expect(html).toContain('Cara kerja sesi harian');
  });
  it('blocked new start and allowed completion remain distinct', () => {
    const html = renderToStaticMarkup(
      React.createElement(TodayClassSessions, {
        loadError: null,
        canOperateSessions: true,
        sessions: [
          { ...sessions[0]!, canOperate: false, operationBlockedReason: 'Otomasi nonaktif' },
          { ...sessions[1]!, canOperate: true, status: 'STARTED' },
        ],
      }),
    );
    expect(html).not.toContain('Mulai sesi');
    expect(html).toContain('Otomasi nonaktif');
    expect(html).toContain('Selesaikan');
  });
  it('routes teacher summary to real sessions only with read permission', () => {
    const props = {
      grades: [],
      attendances: [],
      activities: [],
      rpp: [],
      todayClasses: [],
      onAbsen: jest.fn(),
      onJurnal: jest.fn(),
    };
    expect(renderToStaticMarkup(React.createElement(RingkasanGuru, props))).not.toContain(
      '/dashboard/jadwal#today-class-sessions',
    );
    expect(
      renderToStaticMarkup(
        React.createElement(RingkasanGuru, { ...props, canReadClassSessions: true }),
      ),
    ).toContain('/dashboard/jadwal#today-class-sessions');
  });
  it('never previews or mutates on render; requires an explicit preview before confirmation', () => {
    const html = renderToStaticMarkup(
      React.createElement(SessionPreparationPanel, { today: '2026-10-20' }),
    );
    expect(html).toContain('Periksa kesiapan');
    expect(html).not.toContain('Konfirmasi penyiapan');
    expect(html).toContain('min="2026-10-20"');
    expect(html).toContain('max="2026-11-03"');
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockPrepare).not.toHaveBeenCalled();
  });
  it('requires both permission capability and per-session ownership for the start button', () => {
    const denied = renderToStaticMarkup(
      React.createElement(TodayClassSessions, { sessions, loadError: null }),
    );
    expect(denied).not.toContain('Mulai sesi');
    const allowed = renderToStaticMarkup(
      React.createElement(TodayClassSessions, {
        sessions,
        loadError: null,
        canOperateSessions: true,
      }),
    );
    expect(allowed.match(/Mulai sesi/g) ?? []).toHaveLength(1);
    const staff = renderToStaticMarkup(
      React.createElement(TodayClassSessions, { sessions, loadError: null, canManage: true }),
    );
    expect(staff).not.toContain('Mulai sesi');
  });
});
