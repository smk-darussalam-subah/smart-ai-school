import { haversineMeters } from '../teacher-attendance/haversine';
import type { AttendanceLocation } from './staff-attendance.dto';

export function schoolDate(now: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function schoolMinute(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  return (
    Number(parts.find((part) => part.type === 'hour')?.value) * 60 +
    Number(parts.find((part) => part.type === 'minute')?.value)
  );
}
export type LocationStatus = 'INSIDE' | 'OUTSIDE' | 'UNVERIFIED' | 'DISABLED';
export function evaluateLocation(
  input: AttendanceLocation,
  school: {
    latitude: unknown;
    longitude: unknown;
    geofenceRadiusM: number;
    attendanceAccuracyM: number;
  },
  now: Date,
): {
  status: LocationStatus;
  reason: string | null;
  distanceM: number | null;
  accuracyM: number | null;
} {
  const accuracyM = input.accuracyM ?? null;
  if (school.latitude == null || school.longitude == null)
    return { status: 'DISABLED', reason: 'GEOFENCE_NOT_CONFIGURED', distanceM: null, accuracyM };
  if (input.locationFailure || input.lat == null || input.lng == null)
    return {
      status: 'UNVERIFIED',
      reason: input.locationFailure ?? 'NO_LOCATION',
      distanceM: null,
      accuracyM,
    };
  const distanceM = haversineMeters(
    input.lat,
    input.lng,
    Number(school.latitude),
    Number(school.longitude),
  );
  const age = input.capturedAt ? now.getTime() - new Date(input.capturedAt).getTime() : Infinity;
  if (age < -30000 || age > 120000)
    return { status: 'UNVERIFIED', reason: 'STALE_LOCATION', distanceM, accuracyM };
  if (accuracyM == null || accuracyM > school.attendanceAccuracyM)
    return { status: 'UNVERIFIED', reason: 'LOW_ACCURACY', distanceM, accuracyM };
  // Do not claim a precise side of the boundary when GPS uncertainty crosses it.
  if (distanceM + accuracyM <= school.geofenceRadiusM)
    return { status: 'INSIDE', reason: null, distanceM, accuracyM };
  if (distanceM - accuracyM > school.geofenceRadiusM)
    return { status: 'OUTSIDE', reason: null, distanceM, accuracyM };
  return { status: 'UNVERIFIED', reason: 'BOUNDARY_UNCERTAIN', distanceM, accuracyM };
}
