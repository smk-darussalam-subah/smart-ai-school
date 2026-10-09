import {
  AttendanceLocationSchema,
  AttendanceQuerySchema,
  AttendanceCorrectionSchema,
} from '../staff-attendance/staff-attendance.dto';
import { evaluateLocation, schoolDate, schoolMinute } from '../staff-attendance/attendance-rules';
import { ResolveBellProfileQuerySchema } from '../bell-schedule/bell-schedule.dto';
const now = new Date('2026-10-06T00:31:00Z');
const school = { latitude: 0, longitude: 0, geofenceRadiusM: 300, attendanceAccuracyM: 100 };
const input = { lat: 0, lng: 0, accuracyM: 8, capturedAt: now.toISOString() };
describe('Location is independent of attendance', () => {
  it('treats zero coordinates as configured and verifies inside conservatively', () => {
    expect(evaluateLocation(input, school, now)).toMatchObject({ status: 'INSIDE', distanceM: 0 });
  });
  it('does not label missing/denied GPS as outside', () => {
    for (const value of [
      {},
      { locationFailure: 'POLICY_BLOCKED' as const },
      { locationFailure: 'PERMISSION_DENIED' as const },
    ])
      expect(evaluateLocation(value, school, now).status).toBe('UNVERIFIED');
  });
  it('handles disabled geofence, poor accuracy, stale/future samples and boundary uncertainty', () => {
    expect(evaluateLocation(input, { ...school, latitude: null }, now).status).toBe('DISABLED');
    expect(evaluateLocation({ ...input, accuracyM: 200 }, school, now).reason).toBe('LOW_ACCURACY');
    expect(
      evaluateLocation({ ...input, capturedAt: '2026-10-05T23:00:00Z' }, school, now).reason,
    ).toBe('STALE_LOCATION');
    expect(
      evaluateLocation({ ...input, capturedAt: '2026-10-06T00:32:00Z' }, school, now).reason,
    ).toBe('STALE_LOCATION');
    expect(evaluateLocation({ ...input, lat: 0.00269, accuracyM: 30 }, school, now).reason).toBe(
      'BOUNDARY_UNCERTAIN',
    );
    expect(evaluateLocation({ ...input, lat: 0.01 }, school, now).status).toBe('OUTSIDE');
  });
  it('uses WIB across UTC midnight with an exact 07:00 boundary', () => {
    expect(schoolDate(new Date('2026-10-05T17:00:00Z'))).toBe('2026-10-06');
    expect(schoolMinute(new Date('2026-10-06T00:00:00Z'))).toBe(420);
  });
  it('rejects incomplete/non-finite/spoofed payloads and calendar-invalid dates', () => {
    for (const value of [
      { lat: 0 },
      { lat: Infinity, lng: 0 },
      { lat: 0, lng: 0, locationFailure: 'TIMEOUT' },
      { teacherId: 'spoof' },
      { checkInAt: now.toISOString() },
    ])
      expect(AttendanceLocationSchema.safeParse(value).success).toBe(false);
    expect(AttendanceQuerySchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(
      false,
    );
    expect(ResolveBellProfileQuerySchema.safeParse({ date: '2026-02-30' }).success).toBe(false);
    expect(AttendanceQuerySchema.safeParse({ from: '2026-01-01', to: '2026-10-06' }).success).toBe(
      false,
    );
    expect(AttendanceCorrectionSchema.safeParse({ reason: 'just reason' }).success).toBe(false);
  });
});
