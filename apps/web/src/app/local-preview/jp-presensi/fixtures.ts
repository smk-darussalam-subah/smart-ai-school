import type {
  AttendanceContext,
  AttendanceDetail,
  AttendanceGateway,
  AttendancePolicy,
  AttendanceReceipt,
  AttendanceRow,
  ArrivalExpectation,
  LocationInput,
} from '@/lib/staff-attendance';
import type { BellProfile, BellSegment } from '@/lib/bell-patterns';

export const PREVIEW_DATE = '2026-10-06';
export const PREVIEW_NOW = PREVIEW_DATE + 'T07:51:00+07:00';
export const PREVIEW_POLICY: AttendancePolicy = {
  attendanceMode: 'REVIEW',
  attendanceAccuracyM: 100,
  attendanceStartMinute: 420,
  attendanceTeacherLeadMin: 15,
  attendanceTeacherLeadTarget: 30,
  attendanceEndMinute: 900,
  attendanceWorkingDays: [1, 2, 3, 4, 5, 6],
  attendancePromptCooldown: 30,
  geofenceConfigured: true,
  geofenceRadiusM: 300,
};
export const PREVIEW_PROFILE: BellProfile = {
  id: 'preview-bell',
  code: 'REGULER-2026',
  name: 'Jadwal Bel Reguler',
  kind: 'NORMAL',
  effectiveFrom: '2026-07-13',
  effectiveUntil: '2027-06-30',
  provenance: 'Data sintetis untuk tinjau desain',
  revokedAt: null,
  segments: [1, 2, 3, 4, 5, 6].flatMap((day) => {
    let cursor = 415;
    const rows: BellSegment[] = [];
    for (let jp = 1; jp <= (day === 5 ? 8 : day === 6 ? 9 : 10); jp++) {
      if (jp === 5 || jp === 8) {
        const length = jp === 5 ? 15 : 40;
        rows.push({
          dayOfWeek: day,
          type: 'BREAK',
          label: jp === 5 ? 'Istirahat' : 'Ishoma',
          jpNumber: null,
          startMinute: cursor,
          endMinute: cursor + length,
          sortOrder: rows.length + 1,
        });
        cursor += length;
      }
      rows.push({
        dayOfWeek: day,
        type: 'INSTRUCTION',
        label: 'JP ' + jp,
        jpNumber: jp,
        startMinute: cursor,
        endMinute: cursor + 40,
        sortOrder: rows.length + 1,
      });
      cursor += 40;
    }
    return rows;
  }),
};
export const PREVIEW_CONTEXT: AttendanceContext = {
  employee: { id: 'preview-user-0', fullName: 'Bima Aksara', teacher: { id: 'preview-teacher-0' } },
  serverNow: new Date(PREVIEW_NOW).toISOString(),
  date: PREVIEW_DATE,
  receipt: null,
  eligible: true,
  workingDay: true,
  holiday: null,
  policy: PREVIEW_POLICY,
  scheduleError: null,
  arrival: {
    basis: 'TEACHING',
    dueAt: PREVIEW_DATE + 'T08:00:00+07:00',
    recommendedAt: PREVIEW_DATE + 'T07:45:00+07:00',
    firstTeachingAt: PREVIEW_DATE + 'T08:15:00+07:00',
  },
  schedules: [
    {
      id: 'preview-joint',
      jpStart: 3,
      jpEnd: 4,
      classes: ['XI TKJ 1', 'XI TKJ 2'],
      subject: 'Pendidikan Jasmani, Olahraga, dan Kesehatan',
      room: 'LAPANGAN',
      startAt: PREVIEW_DATE + 'T08:15:00+07:00',
      endAt: PREVIEW_DATE + 'T09:35:00+07:00',
      mode: 'JOINT_CLASS',
      expired: false,
      state: 'UPCOMING',
      minutesUntil: 44,
    },
    {
      id: 'preview-next',
      jpStart: 6,
      jpEnd: 7,
      classes: ['X TKJ 1'],
      subject: 'Pendidikan Jasmani, Olahraga, dan Kesehatan',
      room: 'LAPANGAN',
      startAt: PREVIEW_DATE + 'T10:30:00+07:00',
      endAt: PREVIEW_DATE + 'T11:50:00+07:00',
      mode: null,
      expired: false,
      state: 'UPCOMING',
      minutesUntil: 179,
    },
    {
      id: 'preview-final',
      jpStart: 9,
      jpEnd: 10,
      classes: ['X AKL 1'],
      subject: 'Pendidikan Jasmani, Olahraga, dan Kesehatan',
      room: 'LAPANGAN',
      startAt: PREVIEW_DATE + 'T13:10:00+07:00',
      endAt: PREVIEW_DATE + 'T14:30:00+07:00',
      mode: null,
      expired: false,
      state: 'UPCOMING',
      minutesUntil: 339,
    },
  ],
};
export type PreviewScenario = 'INSIDE' | 'OUTSIDE' | 'GPS_FAILED' | 'LOW_ACCURACY';
export type PreviewArrivalKind = 'TEACHER' | 'TU' | 'PRINCIPAL' | 'NO_SCHEDULE';
const clone = <T>(value: T): T => structuredClone(value);
export function previewContext(kind: PreviewArrivalKind): AttendanceContext {
  const context = clone(PREVIEW_CONTEXT);
  context.employee.role = kind === 'TU' ? 'TATA_USAHA' : 'GURU';
  context.employee.isPrincipal = kind === 'PRINCIPAL';
  if (kind === 'TU') {
    context.employee.teacher = null;
    context.schedules = [];
    context.arrival = {
      basis: 'WORKDAY',
      dueAt: PREVIEW_DATE + 'T07:00:00+07:00',
      recommendedAt: PREVIEW_DATE + 'T07:00:00+07:00',
      firstTeachingAt: null,
    };
  } else if (kind === 'PRINCIPAL' || kind === 'NO_SCHEDULE') {
    context.arrival = {
      basis: kind === 'PRINCIPAL' ? 'EXEMPT' : 'NONE',
      dueAt: null,
      recommendedAt: null,
      firstTeachingAt: null,
    };
    if (kind === 'NO_SCHEDULE') {
      context.schedules = [];
      context.eligible = false;
    }
  }
  return context;
}
export function createPreviewGateway(
  options: () => { scenario: PreviewScenario; failSave: boolean },
  kind: PreviewArrivalKind = 'TEACHER',
): AttendanceGateway {
  let context = previewContext(kind);
  let policy = clone(PREVIEW_POLICY);
  const details = new Map<string, AttendanceDetail>();
  const employees = Array.from({ length: 42 }, (_, index) => ({
    id: 'preview-user-' + index,
    fullName:
      [
        'Bima Aksara',
        'Nadia Pramesti',
        'Damar Wicaksana',
        'Laras Kencana',
        'Arga Mahardika',
        'Rani Puspita',
        'Bayu Pradana',
        'Sinta Aulia',
      ][index] ?? (index < 32 ? 'Guru Uji ' : 'Pegawai Uji ') + String(index + 1).padStart(2, '0'),
    staff: { niy: 'SINTETIS-' + String(index + 1).padStart(3, '0'), employmentStatus: 'GTY' },
    role: index >= 32 || (index === 0 && kind === 'TU') ? 'TATA_USAHA' : 'GURU',
    teacher:
      index < 32 && !(index === 0 && kind === 'TU') ? { id: 'preview-teacher-' + index } : null,
  }));
  function receipt(index: number, date: string): AttendanceReceipt {
    const late = index % 7 === 0;
    const status = index % 11 === 0 ? 'OUTSIDE' : index % 9 === 0 ? 'UNVERIFIED' : 'INSIDE';
    return {
      id: 'preview-record-' + index + '-' + date,
      userId: employees[index]!.id,
      date,
      checkInAt: date + (late ? 'T07:12:00+07:00' : 'T06:58:00+07:00'),
      checkOutAt: date === PREVIEW_DATE ? null : date + 'T15:12:00+07:00',
      locationInStatus: status,
      locationOutStatus: date === PREVIEW_DATE ? null : 'INSIDE',
      locationInReason: status === 'UNVERIFIED' ? 'PERMISSION_DENIED' : null,
      locationOutReason: null,
      distanceInM: status === 'OUTSIDE' ? 812 : status === 'UNVERIFIED' ? null : 28,
      distanceOutM: date === PREVIEW_DATE ? null : 32,
      accuracyInM: status === 'UNVERIFIED' ? null : 8,
      accuracyOutM: date === PREVIEW_DATE ? null : 10,
      updatedAt: new Date(PREVIEW_NOW).toISOString(),
    };
  }
  function location() {
    const scenario = options().scenario;
    return Promise.resolve({
      status:
        scenario === 'GPS_FAILED' || scenario === 'LOW_ACCURACY'
          ? ('UNVERIFIED' as const)
          : scenario,
      reason:
        scenario === 'GPS_FAILED'
          ? 'POLICY_BLOCKED'
          : scenario === 'LOW_ACCURACY'
            ? 'LOW_ACCURACY'
            : null,
      distanceM: scenario === 'GPS_FAILED' ? null : scenario === 'OUTSIDE' ? 812 : 28,
      accuracyM: scenario === 'GPS_FAILED' ? null : scenario === 'LOW_ACCURACY' ? 240 : 8,
      serverNow: new Date(PREVIEW_NOW).toISOString(),
      policy,
    });
  }
  return {
    context: async () => clone(context),
    location,
    history: async () => [
      ...(context.receipt ? [clone(context.receipt)] : []),
      ...[1, 2, 3, 5, 6].map((days) =>
        receipt(
          0,
          new Date(new Date(PREVIEW_DATE).getTime() - days * 86400000).toISOString().slice(0, 10),
        ),
      ),
    ],
    record: async (_input: LocationInput, checkout) => {
      if (options().failSave)
        throw new Error(
          'Simulasi koneksi gagal: presensi belum tersimpan. Nonaktifkan skenario gagal lalu coba kembali.',
        );
      const verified = await location();
      if (policy.attendanceMode === 'STRICT' && verified.status !== 'INSIDE')
        throw new Error('Mode ketat: lokasi belum terverifikasi di area sekolah.');
      if ((!checkout && context.receipt) || (checkout && context.receipt?.checkOutAt))
        return { receipt: clone(context.receipt!), replayed: true, serverNow: context.serverNow };
      if (checkout && !context.receipt) throw new Error('Belum melakukan presensi masuk.');
      const result: AttendanceReceipt = checkout
        ? {
            ...context.receipt!,
            checkOutAt: PREVIEW_DATE + 'T15:12:00+07:00',
            locationOutStatus: verified.status,
            locationOutReason: verified.reason,
            distanceOutM: verified.distanceM,
            accuracyOutM: verified.accuracyM,
          }
        : {
            ...receipt(0, PREVIEW_DATE),
            checkInAt: PREVIEW_NOW,
            locationInStatus: verified.status,
            locationInReason: verified.reason,
            distanceInM: verified.distanceM,
            accuracyInM: verified.accuracyM,
          };
      context = { ...context, receipt: result, eligible: false };
      const previous = details.get(result.id);
      details.set(result.id, {
        ...result,
        user: { fullName: employees[0]!.fullName },
        events: [
          ...(previous?.events ?? []),
          {
            id: crypto.randomUUID(),
            kind: checkout ? 'CHECK_OUT' : 'CHECK_IN',
            reason: 'Simulasi presensi lokal',
            createdAt: context.serverNow,
          },
        ],
      });
      return { receipt: clone(result), replayed: false, serverNow: context.serverNow };
    },
    report: async (query) => {
      const from = query.get('from') ?? PREVIEW_DATE;
      const to = query.get('to') ?? PREVIEW_DATE;
      if (
        !from ||
        !to ||
        to < from ||
        new Date(to).getTime() - new Date(from).getTime() > 90 * 86400000
      )
        throw new Error('Periksa rentang tanggal (maksimum 91 hari).');
      const rows: AttendanceRow[] = [];
      const trend: { date: string; present: number; late: number; absent: number }[] = [];
      for (
        let stamp = new Date(from).getTime();
        stamp <= new Date(to).getTime() && stamp <= new Date(PREVIEW_DATE).getTime();
        stamp += 86400000
      ) {
        const date = new Date(stamp).toISOString().slice(0, 10);
        if (!policy.attendanceWorkingDays.includes(new Date(stamp).getUTCDay() || 7)) continue;
        const point = { date, present: 0, late: 0, absent: 0 };
        employees.forEach((employee, index) => {
          let record =
            date === PREVIEW_DATE && (index === 0 || index >= 29) ? null : receipt(index, date);
          if (index === 0 && date === PREVIEW_DATE && context.receipt)
            record = clone(context.receipt);
          const override = record ? details.get(record.id) : null;
          if (override) record = clone(override);
          if (record && !details.has(record.id))
            details.set(record.id, {
              ...record,
              user: { fullName: employee.fullName },
              events: [
                {
                  id: 'event-' + record.id,
                  kind: 'CHECK_IN',
                  reason: 'Data sintetis pratinjau',
                  createdAt: record.checkInAt,
                },
              ],
            });
          const principal = index === 1 || (index === 0 && kind === 'PRINCIPAL');
          const noSchedule = index === 0 && kind === 'NO_SCHEDULE';
          const firstTeachingAt =
            !principal && !noSchedule && employee.teacher
              ? date +
                (index === 0
                  ? 'T08:15:00+07:00'
                  : index % 3 === 0
                    ? 'T10:30:00+07:00'
                    : 'T06:55:00+07:00')
              : null;
          const dueAt =
            principal || noSchedule
              ? null
              : firstTeachingAt
                ? new Date(
                    new Date(firstTeachingAt).getTime() - policy.attendanceTeacherLeadMin * 60000,
                  ).toISOString()
                : date + 'T07:00:00+07:00';
          const arrival: ArrivalExpectation = {
            basis: principal
              ? 'EXEMPT'
              : noSchedule
                ? 'NONE'
                : employee.teacher
                  ? 'TEACHING'
                  : 'WORKDAY',
            dueAt,
            firstTeachingAt,
            recommendedAt: firstTeachingAt
              ? new Date(
                  new Date(firstTeachingAt).getTime() - policy.attendanceTeacherLeadTarget * 60000,
                ).toISOString()
              : dueAt,
          };
          const late = Boolean(record && dueAt && new Date(record.checkInAt) > new Date(dueAt));
          rows.push({
            employee,
            date,
            receipt: record,
            status: record
              ? late
                ? 'LATE'
                : 'PRESENT'
              : principal
                ? 'NOT_REQUIRED'
                : noSchedule
                  ? 'NOT_SCHEDULED'
                  : dueAt && new Date(context.serverNow) <= new Date(dueAt)
                    ? 'NOT_DUE'
                    : 'ABSENT',
            arrival,
            review: Boolean(
              record &&
              (['OUTSIDE', 'UNVERIFIED'].includes(record.locationInStatus) ||
                (date < PREVIEW_DATE && !record.checkOutAt)),
            ),
          });
          if (!record && dueAt && new Date(context.serverNow) > new Date(dueAt)) point.absent++;
          else if (record) {
            point.present++;
            if (late) point.late++;
          }
        });
        trend.push(point);
      }
      const filtered = rows
        .filter(
          (row) =>
            row.employee.fullName
              .toLowerCase()
              .includes((query.get('search') ?? '').toLowerCase()) &&
            (!query.get('unit') ||
              query.get('unit') === 'ALL' ||
              Boolean(row.employee.teacher) === (query.get('unit') === 'TEACHER')) &&
            (!query.get('status') ||
              query.get('status') === 'ALL' ||
              (query.get('status') === 'REVIEW'
                ? row.review
                : query.get('status') === 'NO_CHECKOUT'
                  ? row.receipt && !row.receipt.checkOutAt
                  : row.status === query.get('status'))) &&
            (!query.get('location') ||
              query.get('location') === 'ALL' ||
              row.receipt?.locationInStatus === query.get('location')),
        )
        .sort((a, b) => b.date.localeCompare(a.date));
      const page = Number(query.get('page') ?? 1);
      const limit = Number(query.get('limit') ?? 20);
      return {
        data: clone(filtered.slice((page - 1) * limit, page * limit)),
        total: filtered.length,
        page,
        limit,
        policy: clone(policy),
        serverNow: context.serverNow,
        summary: {
          totalEmployees: employees.length,
          expected: rows.filter((row) => row.arrival.dueAt || row.receipt).length,
          present: rows.filter((row) => row.receipt).length,
          onTime: rows.filter((row) => row.status === 'PRESENT' && row.arrival.dueAt).length,
          late: rows.filter((row) => row.status === 'LATE').length,
          absent: rows.filter((row) => row.status === 'ABSENT').length,
          review: rows.filter((row) => row.review).length,
        },
        trend,
        attention: clone(rows.filter((row) => row.review).slice(-5)),
      };
    },
    detail: async (id) => {
      const data = details.get(id);
      if (!data) throw new Error('Data pratinjau tidak ditemukan.');
      return clone(data);
    },
    correct: async (id, input) => {
      const data = details.get(id);
      if (!data) throw new Error('Data tidak tersedia.');
      const updated = {
        ...data,
        checkInAt: String(input.checkInAt),
        checkOutAt: input.checkOutAt ? String(input.checkOutAt) : null,
      };
      if (updated.checkOutAt && new Date(updated.checkOutAt) < new Date(updated.checkInAt))
        throw new Error('Pulang tidak boleh sebelum masuk.');
      updated.events = [
        ...data.events,
        {
          id: crypto.randomUUID(),
          kind: 'CORRECTION',
          reason: String(input.reason),
          createdAt: context.serverNow,
          before: { checkInAt: data.checkInAt, checkOutAt: data.checkOutAt },
          after: { checkInAt: updated.checkInAt, checkOutAt: updated.checkOutAt },
        },
      ];
      details.set(id, updated);
      return clone(updated);
    },
    note: async (id, reason) => {
      const data = details.get(id);
      if (!data) throw new Error('Data tidak tersedia.');
      const event = { id: crypto.randomUUID(), kind: 'NOTE', reason, createdAt: context.serverNow };
      data.events.push(event);
      return clone(event);
    },
    policy: async (input) => {
      if (input.attendanceEndMinute <= input.attendanceStartMinute)
        throw new Error('Jam pulang harus setelah jam masuk.');
      policy = clone(input);
      context.policy = clone(input);
      return clone(policy);
    },
  };
}
