export type LocationStatus = 'INSIDE' | 'OUTSIDE' | 'UNVERIFIED' | 'DISABLED';
export interface AttendanceReceipt {
  id: string;
  userId: string;
  date: string;
  checkInAt: string;
  checkOutAt: string | null;
  arrivalBasis?: ArrivalExpectation['basis'] | null;
  expectedArrivalAt?: string | null;
  recommendedArrivalAt?: string | null;
  firstTeachingAt?: string | null;
  locationInStatus: LocationStatus;
  locationOutStatus: LocationStatus | null;
  locationInReason: string | null;
  locationOutReason: string | null;
  distanceInM: number | null;
  distanceOutM: number | null;
  accuracyInM: number | null;
  accuracyOutM: number | null;
  updatedAt: string;
}
export interface TeachingToday {
  id: string;
  jpStart: number;
  jpEnd: number;
  classes: string[];
  subject: string;
  room: string | null;
  startAt: string;
  endAt: string;
  mode: string | null;
  expired: boolean;
  state: 'CURRENT' | 'UPCOMING' | 'PAST';
  minutesUntil: number;
}
export interface AttendancePolicy {
  attendanceMode: 'REVIEW' | 'STRICT';
  attendanceAccuracyM: number;
  attendanceStartMinute: number;
  attendanceTeacherLeadMin: number;
  attendanceTeacherLeadTarget: number;
  attendanceEndMinute: number;
  attendanceWorkingDays: number[];
  attendancePromptCooldown: number;
  geofenceRadiusM: number;
  geofenceConfigured: boolean;
}
export interface AttendanceContext {
  employee: { id: string; fullName: string; teacher: { id: string } | null; role?: string; isPrincipal?: boolean };
  serverNow: string;
  date: string;
  receipt: AttendanceReceipt | null;
  schedules: TeachingToday[];
  scheduleError: string | null;
  policy: AttendancePolicy;
  workingDay: boolean;
  holiday: string | null;
  eligible: boolean;
  arrival: ArrivalExpectation;
}
export interface ArrivalExpectation {
  basis: 'TEACHING' | 'WORKDAY' | 'NONE' | 'UNAVAILABLE' | 'EXEMPT';
  dueAt: string | null;
  recommendedAt: string | null;
  firstTeachingAt: string | null;
}
export const ATTENDANCE_STATUS_LABEL = {
  ABSENT: 'Belum hadir', PRESENT: 'Hadir', LATE: 'Terlambat',
  NOT_DUE: 'Belum waktunya', NOT_SCHEDULED: 'Tidak ada jadwal', NOT_REQUIRED: 'Tidak terikat jam', UNKNOWN: 'Perlu verifikasi jadwal',
};
export interface LocationInput {
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  capturedAt?: string | null;
  locationFailure?:
    | 'PERMISSION_DENIED'
    | 'POLICY_BLOCKED'
    | 'UNAVAILABLE'
    | 'TIMEOUT'
    | 'INSECURE_CONTEXT'
    | null;
}
export interface LocationResult {
  status: LocationStatus;
  reason: string | null;
  distanceM: number | null;
  accuracyM: number | null;
  serverNow: string;
  policy: AttendancePolicy;
}
export interface AttendanceRow {
  employee: {
    id: string;
    fullName: string;
    role?: string;
    staff: { niy: string | null; employmentStatus: string } | null;
    teacher: { id: string } | null;
  };
  date: string;
  receipt: AttendanceReceipt | null;
  status: keyof typeof ATTENDANCE_STATUS_LABEL;
  arrival: ArrivalExpectation;
  review: boolean;
}
export interface AttendanceReport {
  summary: {
    totalEmployees: number;
    expected: number;
    present: number;
    onTime: number;
    late: number;
    absent: number;
    review: number;
  };
  trend: { date: string; present: number; late: number; absent: number }[];
  attention: AttendanceRow[];
  data: AttendanceRow[];
  total: number;
  page: number;
  limit: number;
  policy: AttendancePolicy;
  serverNow: string;
}
export interface AttendanceEvent {
  id: string;
  kind: string;
  reason: string;
  createdAt: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}
export type AttendanceDetail = AttendanceReceipt & {
  user: { fullName: string };
  events: AttendanceEvent[];
};
export interface AttendanceGateway {
  context(): Promise<AttendanceContext>;
  history(): Promise<AttendanceReceipt[]>;
  location(input: LocationInput): Promise<LocationResult>;
  record(
    input: LocationInput,
    checkout: boolean,
  ): Promise<{ receipt: AttendanceReceipt; replayed: boolean; serverNow: string }>;
  report(query: URLSearchParams): Promise<AttendanceReport>;
  detail(id: string): Promise<AttendanceDetail>;
  correct(id: string, input: Record<string, unknown>): Promise<AttendanceReceipt>;
  note(id: string, reason: string): Promise<AttendanceEvent>;
  policy(input: AttendancePolicy): Promise<AttendancePolicy>;
}
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/backend/staff-attendance/' + path, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String(data.message)
        : 'Layanan presensi belum dapat dihubungi. Silakan coba lagi.';
    throw new Error(
      response.status === 401 ? 'Sesi berakhir. Masuk kembali sebelum mencatat presensi.' : message,
    );
  }
  return data as T;
}
export const attendanceGateway: AttendanceGateway = {
  context: () => request('context'),
  history: () => request('history'),
  location: (input) => request('location', 'POST', input),
  record: (input, checkout) => request(checkout ? 'check-out' : 'check-in', 'POST', input),
  report: (query) => request('report?' + query.toString()),
  detail: (id) => request(id),
  correct: (id, input) => request(id, 'PATCH', input),
  note: (id, reason) => request(id + '/notes', 'POST', { reason }),
  policy: (input) => {
    const { geofenceConfigured: _configured, geofenceRadiusM: _radius, ...policy } = input;
    return request('policy', 'PATCH', policy);
  },
};
export function formatAttendanceTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}
export function formatAttendanceDate(value: string) {
  return new Date(value.slice(0, 10) + 'T00:00:00+07:00').toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
export function closestTeaching(schedules: TeachingToday[], now: Date): TeachingToday | null {
  return (
    schedules.find((slot) => new Date(slot.startAt) <= now && now < new Date(slot.endAt)) ??
    schedules
      .filter((slot) => now < new Date(slot.startAt))
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0] ??
    null
  );
}
export const LOCATION_LABEL: Record<LocationStatus, string> = {
  INSIDE: 'Di area sekolah',
  OUTSIDE: 'Di luar area',
  UNVERIFIED: 'Belum terverifikasi',
  DISABLED: 'Lokasi belum diatur',
};
export const LOCATION_HELP: Record<string, string> = {
  PERMISSION_DENIED:
    'Izin lokasi belum diberikan. Aktifkan izin lokasi pada pengaturan situs, lalu coba lagi.',
  POLICY_BLOCKED:
    'Lokasi dibatasi oleh halaman atau bingkai browser. Buka DIIS langsung di tab browser; admin perlu memeriksa kebijakan lokasi.',
  UNAVAILABLE:
    'Sinyal lokasi belum tersedia. Aktifkan lokasi perangkat dan coba di tempat terbuka.',
  TIMEOUT: 'Pencarian lokasi terlalu lama. Periksa lokasi perangkat lalu coba lagi.',
  INSECURE_CONTEXT: 'Lokasi memerlukan koneksi HTTPS atau localhost yang aman.',
  LOW_ACCURACY: 'Akurasi GPS belum cukup. Coba di tempat terbuka agar lokasi lebih tepat.',
  BOUNDARY_UNCERTAIN:
    'GPS berada dekat batas area. Lokasi belum dapat dipastikan di dalam atau di luar sekolah.',
  STALE_LOCATION: 'Data lokasi sudah terlalu lama. Ambil lokasi terbaru.',
  GEOFENCE_NOT_CONFIGURED: 'Titik dan radius sekolah belum dikonfigurasi oleh admin.',
  NO_LOCATION: 'Lokasi belum tersedia.',
};
export function captureLocation(): Promise<LocationInput> {
  if (!window.isSecureContext) return Promise.resolve({ locationFailure: 'INSECURE_CONTEXT' });
  const policy =
    (
      document as Document & {
        permissionsPolicy?: { allowsFeature(feature: string): boolean };
        featurePolicy?: { allowsFeature(feature: string): boolean };
      }
    ).permissionsPolicy ??
    (document as Document & { featurePolicy?: { allowsFeature(feature: string): boolean } })
      .featurePolicy;
  if (policy && !policy.allowsFeature('geolocation'))
    return Promise.resolve({ locationFailure: 'POLICY_BLOCKED' });
  if (!navigator.geolocation) return Promise.resolve({ locationFailure: 'UNAVAILABLE' });
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
        }),
      (error) =>
        resolve({
          locationFailure:
            error.code === 1 ? 'PERMISSION_DENIED' : error.code === 3 ? 'TIMEOUT' : 'UNAVAILABLE',
        }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    ),
  );
}
