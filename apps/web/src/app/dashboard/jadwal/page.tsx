import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { redirect } from 'next/navigation';
import { apiFetchResult } from '@/lib/api';
import JadwalMatrix, { type ScheduleItem } from './_components/JadwalMatrix';
import AcademicDataNotice from '../_components/AcademicDataNotice';
import TodayClassSessions, { type TodayClassSession } from './_components/TodayClassSessions';
import BellScheduleManager, { type BellScheduleProfile } from './_components/BellScheduleManager';

interface ListResponse {
  data: ScheduleItem[];
  total: number;
  page: number;
  limit: number;
}

interface ClassItem {
  id: string;
  name: string;
  grade: number;
}

interface AcademicYearItem {
  id: string;
  code: string;
  isActive: boolean;
}

interface ActiveSemester {
  number: number;
  academicYear: { code: string };
}

interface ActiveOptions {
  classes: ClassItem[];
  teachers: Array<{
    id: string;
    user: { fullName: string };
  }>;
}

function wibToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default async function JadwalPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const authority = await resolveDashboardAuthority(session);
  const roles = authority.roles;
  if (roles.includes('INDUSTRI')) redirect('/dashboard');

  const token = session.accessToken ?? '';
  const isStaff = authority.hasRole(
    'SUPER_ADMIN',
    'KEPALA_SEKOLAH',
    'TATA_USAHA',
    'WAKA_KURIKULUM',
  );
  const canManage =
    authority.can('academic.schedule.manage') &&
    authority.hasRole('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM');
  const canReadOptions = isStaff && authority.can('academic.teaching.read');

  const [activeSemesterRes, academicYearsRes, optionsRes] = await Promise.all([
    apiFetchResult<ActiveSemester>('/school/semesters/active', token),
    apiFetchResult<AcademicYearItem[]>('/school/academic-years', token),
    canReadOptions
      ? apiFetchResult<ActiveOptions>('/teaching-assignments/options/active', token)
      : Promise.resolve(null),
  ]);

  if (activeSemesterRes.status === 'notFound') {
    return (
      <AcademicDataNotice
        href="/dashboard/jadwal"
        message="Semester aktif belum disiapkan. Jadwal belum dapat ditentukan sebelum periode aktif tersedia."
      />
    );
  }
  if (activeSemesterRes.status !== 'success') {
    return <AcademicDataNotice href="/dashboard/jadwal" message={activeSemesterRes.message} />;
  }
  if (academicYearsRes.status !== 'success') {
    return <AcademicDataNotice href="/dashboard/jadwal" message={academicYearsRes.message} />;
  }

  const initialAcademicYear = activeSemesterRes.data?.academicYear?.code ?? '';
  const initialSemester = activeSemesterRes.data?.number;
  if (!initialAcademicYear || !initialSemester) {
    return (
      <AcademicDataNotice
        href="/dashboard/jadwal"
        message="Konteks semester aktif tidak lengkap. Periksa konfigurasi periode akademik."
      />
    );
  }

  const query = new URLSearchParams({ page: '1', limit: '20', semester: String(initialSemester) });
  if (initialAcademicYear) query.set('academicYear', initialAcademicYear);
  const schedulesRes = await apiFetchResult<ListResponse>(`/schedules?${query.toString()}`, token);

  if (schedulesRes.status !== 'success') {
    return (
      <AcademicDataNotice
        href="/dashboard/jadwal"
        message={schedulesRes.message || 'Jadwal belum dapat dimuat.'}
      />
    );
  }

  const optionWarning =
    canReadOptions && optionsRes?.status !== 'success'
      ? (optionsRes?.message ??
        'Pilihan kelas belum dapat dimuat. Jadwal tetap tersedia tanpa filter kelas.')
      : null;
  const options = canReadOptions && optionsRes?.status === 'success' ? optionsRes.data : null;
  const canReadSessions = authority.can('academic.class-session.read');
  const sessionsRes = canReadSessions
    ? await apiFetchResult<{ data: TodayClassSession[] }>(
        `/class-sessions?date=${wibToday()}&limit=100`,
        token,
      )
    : null;
  const sessions = sessionsRes?.status === 'success' ? sessionsRes.data.data : [];
  const sessionLoadError =
    sessionsRes && sessionsRes.status !== 'success'
      ? sessionsRes.message || 'Sesi hari ini belum dapat dimuat.'
      : null;
  const bellProfilesRes = authority.can('academic.schedule.read')
    ? await apiFetchResult<BellScheduleProfile[]>('/bell-schedules?scope=SCHOOL', token)
    : null;
  const bellProfiles = bellProfilesRes?.status === 'success' ? bellProfilesRes.data : [];
  const bellLoadError =
    bellProfilesRes && bellProfilesRes.status !== 'success'
      ? bellProfilesRes.message || 'Bell Schedule belum dapat dimuat.'
      : null;
  const teacherOptions =
    options?.teachers.map((teacher) => ({ id: teacher.id, name: teacher.user.fullName })) ?? [];

  return (
    <div className="space-y-4">
      {canReadSessions && (
        <TodayClassSessions
          sessions={sessions}
          loadError={sessionLoadError}
          canManage={canManage}
          teachers={teacherOptions}
        />
      )}
      {bellProfilesRes && (
        <BellScheduleManager
          profiles={bellProfiles}
          canManage={canManage}
          loadError={bellLoadError}
        />
      )}
      {optionWarning && <AcademicDataNotice href="/dashboard/jadwal" message={optionWarning} />}
      <JadwalMatrix
        initialSchedules={schedulesRes.data.data}
        initialTotal={schedulesRes.data.total}
        initialPage={schedulesRes.data.page ?? 1}
        classes={options?.classes ?? []}
        academicYears={academicYearsRes.data}
        initialAcademicYear={initialAcademicYear}
        initialSemester={initialSemester}
        isStaff={isStaff}
        canManage={canManage}
      />
    </div>
  );
}
