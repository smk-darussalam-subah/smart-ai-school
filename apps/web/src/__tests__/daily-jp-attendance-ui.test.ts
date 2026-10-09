import { slotsForDay, profileForDate, patternProblem, normalizeDay } from '@/lib/bell-patterns';
import { closestTeaching, captureLocation } from '@/lib/staff-attendance';
import {
  PREVIEW_PROFILE,
  PREVIEW_CONTEXT,
  previewContext,
  createPreviewGateway,
} from '@/app/local-preview/jp-presensi/fixtures';
import { currentJp } from '@/lib/bell-times';

describe('Daily JP and attendance UI contracts', () => {
  it('uses actual per-day slots, including 9/10 JP and empty/missing/ambiguous dates', () => {
    expect(slotsForDay(PREVIEW_PROFILE, 2)).toHaveLength(10);
    expect(slotsForDay(PREVIEW_PROFILE, 5)).toHaveLength(8);
    expect(slotsForDay(PREVIEW_PROFILE, 6)).toHaveLength(9);
    expect(slotsForDay(null, 2)).toEqual([]);
    expect(profileForDate([PREVIEW_PROFILE], '2028-01-01')).toBeNull();
    expect(
      profileForDate([PREVIEW_PROFILE, { ...PREVIEW_PROFILE, id: 'ambiguous' }], '2026-10-06'),
    ).toBeNull();
    expect(currentJp(840, slotsForDay(PREVIEW_PROFILE, 2))).toBe(10);
    expect(currentJp(840, slotsForDay(PREVIEW_PROFILE, 5))).toBe(0);
  });
  it('validates overlaps and copies independent daily rows without mutating source', () => {
    const copy = normalizeDay(
      PREVIEW_PROFILE.segments.filter((row) => row.dayOfWeek === 2),
      5,
    );
    expect(copy.every((row) => row.dayOfWeek === 5)).toBe(true);
    expect(
      PREVIEW_PROFILE.segments.filter((row) => row.dayOfWeek === 5 && row.type === 'INSTRUCTION'),
    ).toHaveLength(8);
    expect(patternProblem(copy)).toBeNull();
    expect(
      patternProblem([
        { ...copy[0]!, startMinute: 410 },
        { ...copy[1]!, startMinute: 420 },
      ]),
    ).toMatch(/bertumpuk/);
  });
  it('highlights an actual current/nearest session and never fabricates one after the last lesson', () => {
    expect(
      closestTeaching(PREVIEW_CONTEXT.schedules, new Date('2026-10-06T09:00:00+07:00'))?.id,
    ).toBe('preview-joint');
    expect(
      closestTeaching(PREVIEW_CONTEXT.schedules, new Date('2026-10-06T10:00:00+07:00'))?.id,
    ).toBe('preview-next');
    expect(
      closestTeaching(PREVIEW_CONTEXT.schedules, new Date('2026-10-06T16:00:00+07:00')),
    ).toBeNull();
    expect(closestTeaching([], new Date())).toBeNull();
  });
  it('demonstrates teacher, TU, and principal rules without flattening their arrival time', () => {
    expect(previewContext('TEACHER').arrival.dueAt).toContain('08:00');
    expect(previewContext('TU').arrival.dueAt).toContain('07:00');
    expect(previewContext('PRINCIPAL').arrival).toMatchObject({ basis: 'EXEMPT', dueAt: null });
    expect(previewContext('NO_SCHEDULE').eligible).toBe(false);
  });
  it('keeps exempt principals and not-yet-due teachers out of false late/absent aggregates in the preview', async () => {
    const gateway = createPreviewGateway(
      () => ({ scenario: 'INSIDE', failSave: false }),
      'PRINCIPAL',
    );
    const report = await gateway.report(
      new URLSearchParams({ from: '2026-10-06', to: '2026-10-06', limit: '100' }),
    );
    expect(report.data.find((row) => row.employee.id === 'preview-user-0')).toMatchObject({
      status: 'NOT_REQUIRED',
      arrival: { basis: 'EXEMPT', dueAt: null },
    });
    expect(report.data.find((row) => row.employee.id === 'preview-user-1')).toMatchObject({
      status: 'PRESENT',
      arrival: { basis: 'EXEMPT', dueAt: null },
    });
    expect(report.trend[0]!.present).toBe(report.summary.present);
    expect(report.trend[0]!.absent).toBe(report.summary.absent);
  });
  it('returns a policy-blocked state without invoking a prohibited location request', async () => {
    const getCurrentPosition = jest.fn();
    Object.defineProperty(globalThis, 'window', {
      value: { isSecureContext: true },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: { permissionsPolicy: { allowsFeature: () => false } },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { geolocation: { getCurrentPosition } },
      configurable: true,
    });
    try {
      await expect(captureLocation()).resolves.toEqual({ locationFailure: 'POLICY_BLOCKED' });
      expect(getCurrentPosition).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(globalThis, 'window');
      Reflect.deleteProperty(globalThis, 'document');
      Reflect.deleteProperty(globalThis, 'navigator');
    }
  });
});
