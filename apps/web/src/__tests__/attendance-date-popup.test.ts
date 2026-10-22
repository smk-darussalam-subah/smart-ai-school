import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ParentDay from '@/app/dashboard/akademik/_components/ortu/DayDetailModal';
import { DailyKehadiranOrtu as KehadiranOrtu } from '@/app/dashboard/akademik/_components/ortu/KehadiranOrtu';
import type { AttendanceItem } from '@/lib/api';
import type { AttendanceCellStatus } from '@/lib/academic';

// Static content checks only; the browser recipe exercises the unmocked Radix dialog.
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('section', null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement('h2', null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement('p', null, children),
}));
const render = (overrides: Partial<React.ComponentProps<typeof ParentDay>> = {}) =>
  renderToStaticMarkup(
    React.createElement(ParentDay, {
      day: 2,
      month: 'Okt',
      year: 2026,
      status: 'izin',
      date: '2026-10-02',
      notes: 'Izin keluarga sintetis',
      onClose: jest.fn(),
      ...overrides,
    }),
  );
function findButton(
  node: React.ReactNode,
  label: string,
): React.ReactElement<{ onClick: () => void }> | null {
  let result: React.ReactElement<{ onClick: () => void }> | null = null;
  React.Children.forEach(node, (child) => {
    if (
      !React.isValidElement<{
        children?: React.ReactNode;
        'aria-label'?: string;
        onClick: () => void;
      }>(child)
    )
      return;
    if (child.type === 'button' && child.props['aria-label'] === label) result = child;
    else result = result ?? findButton(child.props.children, label);
  });
  return result;
}

describe('attendance date popup content and calendar wiring', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-22T10:00:00+07:00'));
  });
  afterEach(() => jest.useRealTimers());
  it('shows the exact date and school note without duplicating daily status into JP', () => {
    const html = render();
    expect(html).toContain('2 Oktober 2026');
    expect(html).toContain('Izin keluarga sintetis');
    expect(html).toContain('Keterangan sekolah');
    expect(html).toContain('terpisah dari rincian sesi pada bagian Kehadiran per JP');
    expect(html).not.toContain('100%');
  });
  it.each(['hadir', 'izin', 'sakit', 'alpha'] as AttendanceCellStatus[])(
    'preserves written %s status',
    (status) => {
      expect(render({ status })).toContain(
        { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpha: 'Alpha' }[
          status as 'hadir' | 'izin' | 'sakit' | 'alpha'
        ],
      );
    },
  );
  it.each([undefined, null, '', '   '])('uses an honest fallback for missing notes %p', (notes) => {
    expect(render({ notes })).toContain('Tidak ada keterangan tambahan.');
  });
  it('escapes user supplied notes rather than interpreting HTML', () => {
    const html = render({ notes: '<img src=x onerror=alert(1)>\nBaris kedua' });
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).toContain('Baris kedua');
  });
  it('unknown daily data cannot display a stale school note or imply Alpha', () => {
    const html = render({ status: 'none', notes: 'STALE-NOTE' });
    expect(html).toContain('Belum ada catatan');
    expect(html).not.toContain('STALE-NOTE');
    expect(html).not.toContain('Alpha');
  });
  it.each(['2026-02-31', '2026-13-01', 'invalid', ''])(
    'rejects invalid date %s without throwing or substituting today',
    (date) => {
      const html = render({ date });
      expect(html).toContain('Tanggal belum tersedia');
      expect(html).not.toContain('22 Oktober');
      expect(html).not.toContain('Izin keluarga sintetis');
      expect(html).not.toContain('Pola Jam Pelajaran');
    },
  );
  it('supports a legacy month label and reports missing bell configuration honestly', () => {
    const html = render({ date: undefined, month: 'Oktober' });
    expect(html).toContain('2 Oktober 2026');
    expect(html).toContain('Pola bel belum tersedia untuk tanggal ini.');
  });
  it('uses the exact ISO date rather than an obsolete display month', () => {
    expect(render({ day: 1, month: 'September' })).toContain('2 Oktober 2026');
  });
  it('calendar passes only the selected date note to its real modal callback', () => {
    const setModal = jest.fn();
    const attendance = [
      {
        id: '1',
        studentId: 'a',
        classId: 'c',
        date: '2026-10-01',
        status: 'hadir',
        notes: 'WRONG-DAY',
      },
      {
        id: '2',
        studentId: 'a',
        classId: 'c',
        date: '2026-10-02',
        status: 'izin',
        notes: 'SELECTED-DAY',
      },
    ] as AttendanceItem[];
    const element = KehadiranOrtu({ setModal, attendance, attendanceState: 'ready', waLog: [] });
    const button = findButton(element, '2 Okt — Izin');
    expect(button).not.toBeNull();
    button!.props.onClick();
    expect(setModal).toHaveBeenCalledWith({
      type: 'day',
      data: {
        day: 2,
        status: 'izin',
        month: 'Okt',
        year: 2026,
        date: '2026-10-02',
        notes: 'SELECTED-DAY',
        studentId: 'a',
      },
    });
    expect(JSON.stringify(setModal.mock.calls)).not.toContain('WRONG-DAY');
  });
});
