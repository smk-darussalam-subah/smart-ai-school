import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { apiFetch, apiFetchResult, type ApiFetchResult } from '@/lib/api';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { getEffectiveRoles } from '@/lib/view-as';
import { isMobileOnlyDashboardRoleSet } from '@/lib/dashboard-routing';
import RoleBasedHome from './_components/RoleBasedHome';
import type { PapanCell, PapanRow } from './_components/PapanPembelajaran';

export const metadata: Metadata = { title: 'Beranda' };

interface ActiveAcademicYear {
  id: string;
  name?: string;
  code?: string;
}
interface ActiveSemester {
  id: string;
  name?: string;
  semester?: number;
}
interface ScheduleApi {
  classId: string;
  jpStart: number;
  jpEnd: number;
  room: string | null;
  class: { id: string; name: string; grade: number };
  teachingAssignment: { subject: string; teacher: { user: { fullName: string } } };
}
interface CalendarApi {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}
interface ClassSessionApi {
  id: string;
  status: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  classNameSnapshot: string;
  subjectSnapshot: string;
  roomSnapshot: string | null;
}
interface MonitoringApi {
  counters?: Record<string, number>;
  activeAlerts?: number;
}
interface AiProviderStatus {
  effectiveProvider: 'openai' | 'ollama';
  openaiCircuit: 'closed' | 'open' | 'half_open';
  message: string;
  nextProbeAt: string | null;
}

function wibToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function wibDayOfWeek() {
  const shortDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
  }).format(new Date());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(shortDay);
}

function buildPapanRows(list: ScheduleApi[]): PapanRow[] {
  const byClass = new Map<
    string,
    { className: string; grade: number; cells: (PapanCell | null)[] }
  >();
  for (const schedule of list) {
    let entry = byClass.get(schedule.classId);
    if (!entry) {
      entry = {
        className: schedule.class.name,
        grade: schedule.class.grade,
        cells: Array(12).fill(null),
      };
      byClass.set(schedule.classId, entry);
    }
    for (let jp = schedule.jpStart; jp <= schedule.jpEnd && jp <= 12; jp += 1) {
      const index = jp - 1;
      if (index >= 0 && entry.cells[index] === null) {
        entry.cells[index] = {
          subject: schedule.teachingAssignment.subject,
          teacher: schedule.teachingAssignment.teacher.user.fullName,
          room: schedule.room,
        };
      }
    }
  }
  return [...byClass.entries()]
    .map(([classId, value]) => ({ classId, ...value }))
    .sort(
      (left, right) => left.grade - right.grade || left.className.localeCompare(right.className),
    )
    .map(({ classId, className, cells }) => ({ classId, className, cells }));
}

function AiProviderBanner({ status }: { status: AiProviderStatus | null }) {
  if (!status || status.openaiCircuit === 'closed') return null;
  return (
    <div
      className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
    >
      <p className="font-semibold">
        {status.openaiCircuit === 'half_open'
          ? 'OpenAI sedang diperiksa ulang'
          : 'Generate AI memakai Ollama sementara'}
      </p>
      <p className="mt-1 leading-6">{status.message}</p>
    </div>
  );
}

function successfulEmpty<T>(data: T): ApiFetchResult<T> {
  return { status: 'success', data, httpStatus: 200 };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const identityRoles = await getEffectiveRoles(session);
  if (isMobileOnlyDashboardRoleSet(identityRoles)) redirect('/dashboard/akademik');

  const authority = await resolveDashboardAuthority(session);
  const token = session.accessToken ?? '';
  const firstName = session.user?.name?.trim().split(/\s+/)[0] || 'Pengguna';
  const dayOfWeek = wibDayOfWeek();

  const [academicYear, semester] = await Promise.all([
    apiFetch<ActiveAcademicYear>('/school/academic-years/active', token),
    apiFetch<ActiveSemester>('/school/semesters/active', token),
  ]);
  const periodLabel = academicYear
    ? `${academicYear.name ?? academicYear.code ?? 'Tahun ajaran aktif'}${semester ? ` · Semester ${semester.semester ?? semester.name ?? 'aktif'}` : ''}`
    : null;

  const canReadStudents = authority.can('student.read');
  const canReadClasses = authority.can('class.read') || authority.can('academic.class.read');
  const canReadPpdb = authority.can('ppdb.read');
  const canReadSchedule = authority.can('academic.schedule.read');
  const canReadMonitoring = authority.can('operational.monitoring.read');
  const [
    students,
    classes,
    attendance,
    ppdb,
    rpp,
    schedule,
    calendar,
    sessions,
    monitoring,
    aiStatus,
  ] = await Promise.all([
    canReadStudents
      ? apiFetch<{ total: number }>('/students?limit=1', token)
      : Promise.resolve(null),
    canReadClasses ? apiFetch<{ total: number }>('/classes?limit=1', token) : Promise.resolve(null),
    authority.can('attendance.read')
      ? apiFetch<{ overall?: { today?: { pct?: number | null } } }>(
          '/attendance/heatmap?days=2',
          token,
        )
      : Promise.resolve(null),
    canReadPpdb
      ? apiFetch<{ total?: number; data?: { total?: number } }>('/ppdb/stats', token)
      : Promise.resolve(null),
    authority.can('academic.rpp.review')
      ? apiFetch<{ total: number }>('/rpp?status=submitted&limit=1', token)
      : Promise.resolve(null),
    canReadSchedule && dayOfWeek > 0
      ? apiFetchResult<{ data: ScheduleApi[] }>(`/schedules?dayOfWeek=${dayOfWeek}&limit=500`, token)
      : Promise.resolve(successfulEmpty({ data: [] as ScheduleApi[] })),
    academicYear
      ? apiFetchResult<CalendarApi[]>('/school/calendar', token, { academicYearId: academicYear.id })
      : Promise.resolve({ status: 'unavailable', message: 'Periode aktif belum tersedia.' } as ApiFetchResult<CalendarApi[]>),
    canReadSchedule
      ? apiFetchResult<{ data: ClassSessionApi[] }>(`/class-sessions?date=${wibToday()}`, token)
      : Promise.resolve(successfulEmpty({ data: [] as ClassSessionApi[] })),
    canReadMonitoring
      ? apiFetch<MonitoringApi>('/operational-monitoring/snapshot', token)
      : Promise.resolve(null),
    authority.hasRole('SUPER_ADMIN')
      ? apiFetch<AiProviderStatus>('/ai/provider-status', token)
      : Promise.resolve(null),
  ]);

  const ppdbTotal =
    typeof ppdb?.total === 'number'
      ? ppdb.total
      : typeof ppdb?.data?.total === 'number'
        ? ppdb.data.total
        : null;

  return (
    <>
      <AiProviderBanner status={aiStatus} />
      <RoleBasedHome
        firstName={firstName}
        roles={authority.roles}
        permissions={authority.permissions}
        periodLabel={periodLabel}
        stats={{
          totalSiswa: students?.total ?? null,
          totalKelas: classes?.total ?? null,
          kehadiranHariIni: attendance?.overall?.today?.pct ?? null,
          ppdbLeads: ppdbTotal,
          rppMenunggu: rpp?.total ?? null,
        }}
        scheduleRows={buildPapanRows(schedule.status === 'success' ? schedule.data.data : [])}
        agenda={(calendar.status === 'success' ? calendar.data : []).map((item) => ({
          id: item.id,
          name: item.name,
          date: item.startDate.slice(0, 10),
          endDate: item.endDate.slice(0, 10),
        }))}
        sessions={(sessions.status === 'success' ? sessions.data.data : []).map((item) => ({
          id: item.id,
          className: item.classNameSnapshot,
          subject: item.subjectSnapshot,
          room: item.roomSnapshot,
          scheduledStartAt: item.scheduledStartAt,
          scheduledEndAt: item.scheduledEndAt,
          status: item.status,
          canStart: ['SCHEDULED', 'REASSIGNED'].includes(item.status),
          canComplete: item.status === 'STARTED',
        }))}
        monitoringSummary={
          monitoring
            ? {
                active: monitoring.counters?.STARTED ?? 0,
                late: monitoring.activeAlerts ?? 0,
                missed: monitoring.counters?.MISSED ?? 0,
              }
            : null
        }
        dataAvailability={{
          schedule: schedule.status === 'success',
          agenda: calendar.status === 'success',
          sessions: sessions.status === 'success',
        }}
        generatedAt={new Date().toISOString()}
      />
    </>
  );
}
