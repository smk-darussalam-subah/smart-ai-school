import {
  claimClassSessionAction,
  classSessionAction,
} from '../app/dashboard/jadwal/_components/class-session-ui';
import { bellSegmentProblem } from '../app/dashboard/jadwal/_components/BellScheduleManager';
import { classSessionStatusMeta } from '../lib/class-session-status';

describe('Wave 8.5 class session UI contract', () => {
  it('maps every server status to concise Indonesian copy with a safe fallback', () => {
    expect([
      'SCHEDULED',
      'REASSIGNED',
      'STARTED',
      'COMPLETED',
      'MISSED',
      'CANCELLED',
      'SUPERSEDED',
    ].map((status) => classSessionStatusMeta(status).label)).toEqual([
      'Dijadwalkan',
      'Guru pengganti',
      'Berlangsung',
      'Selesai',
      'Tidak dimulai',
      'Dibatalkan',
      'Digantikan',
    ]);
    expect(classSessionStatusMeta('UNEXPECTED').label).toBe('Status tidak dikenal');
  });

  it.each([
    ['SCHEDULED', 'start'],
    ['REASSIGNED', 'start'],
    ['STARTED', 'complete'],
    ['COMPLETED', null],
    ['MISSED', null],
    ['CANCELLED', null],
  ])('maps %s to the authoritative action %s', (status, expected) => {
    expect(classSessionAction(status)).toBe(expected);
  });

  it('claims synchronously and rejects a same-action double click', () => {
    const inFlight = new Set<string>();
    expect(claimClassSessionAction(inFlight, 'session-1:start')).toBe(true);
    expect(claimClassSessionAction(inFlight, 'session-1:start')).toBe(false);
    expect(claimClassSessionAction(inFlight, 'session-2:start')).toBe(true);
  });

  it('rejects overlapping Bell Schedule segments before submit', () => {
    const base = [
      {
        key: '1',
        label: 'JP 1',
        type: 'INSTRUCTION' as const,
        jpNumber: '1',
        start: '07:30',
        end: '08:10',
      },
      {
        key: '2',
        label: 'JP 2',
        type: 'INSTRUCTION' as const,
        jpNumber: '2',
        start: '08:00',
        end: '08:40',
      },
    ];
    expect(bellSegmentProblem(base)).toContain('bertumpuk');
    expect(bellSegmentProblem([{ ...base[0]! }, { ...base[1]!, start: '08:10' }])).toBeNull();
  });
});
