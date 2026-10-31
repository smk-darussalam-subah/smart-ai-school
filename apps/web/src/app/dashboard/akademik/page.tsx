import React from 'react';
import { academicPages, academicPagesResult, academicCatalog } from '@/lib/academic-pages-server';
import {
  periodPath,
  selectAcademicPeriod,
  lessonLinks,
  type AcademicPeriod,
} from '@/lib/academic-scheduling';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getActiveViewAs } from '@/lib/view-as';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { redirect } from 'next/navigation';
import { apiFetch, apiFetchResult, GradeItem, AttendanceItem } from '@/lib/api';
import { readParentChildren } from '@/lib/parent-children';
import { fetchLearnerGrades } from '@/lib/learner-grades-server';
import { fetchStudentTasks, fetchParentSpp } from '@/lib/learner-dashboard-server';
import { attendanceStats, readLearnerAttendance } from '@/lib/learner-attendance';
import type {
  SiswaBadge,
  SiswaXP,
  SiswaLeaderboardEntry,
  SiswaModul,
} from './_components/siswa/siswa-types';
import { slotsForDay, type BellProfile } from '@/lib/bell-patterns';
import { wibTodayISO, scheduleDayOfWeek, currentJp, jpStartLabel, wibNow } from '@/lib/bell-times';
import AcademicOperationsWorkspace from './_components/AcademicOperationsWorkspace';
import AttendanceJpSummary from './_components/AttendanceJpSummary';
import AcademicRoleModeSwitcher from './_components/AcademicRoleModeSwitcher';
import AcademicDataNotice from '../_components/AcademicDataNotice';
import type {
  TeachingAssignmentItem,
  TeachingAssignmentOptions,
} from './_components/TeachingAssignmentManager';
import AkademikWorkspace from './_components/AkademikWorkspace';
import SiswaWorkspace from './_components/siswa/SiswaWorkspace';
import SiswaRefreshWrapper from './_components/siswa/SiswaRefreshWrapper';
import OrtuWorkspace from './_components/ortu/OrtuWorkspace';
import { validSessionDate } from '@/lib/session-attendance';
import OrtuRefreshWrapper from './_components/ortu/OrtuRefreshWrapper';
import KsWorkspace from './_components/KsWorkspace';
import type {
  ScheduleItem,
  ActivityItem,
  RppItem,
  TodayClass,
  LmsModuleItem,
} from './_components/guru-types';
import type { AssessmentSessionData } from './actions';
import {
  normalizeAssignmentGroups,
  type StudentDashboardAssignmentGroup as OrtuStudentDashboardAssignmentGroup,
} from './_components/ortu/ortu-mappers';
import { resolveAcademicWorkflowView } from '@/lib/academic-workflow-deep-link';
import {
  childSchedulePath,
  OWN_STUDENT_SCHEDULE_PATH,
  readLearnerSchedule,
} from '@/lib/learner-schedule';
import {
  readTeacherThresholds,
  mergeTeacherThresholds,
  teacherTodayState,
  type SummaryReadState,
} from '@/lib/teacher-summary';
import type { ApiFetchResult } from '@/lib/api';

const summaryState = (result: ApiFetchResult<unknown>): SummaryReadState =>
  result.status === 'success' ? 'ready' : result.status === 'forbidden' ? 'denied' : 'unavailable';

type Assignment = TeachingAssignmentItem;
interface ClassItem {
  id: string;
  name: string;
}
export interface SubjectItem {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

type ActiveSemester = AcademicPeriod;
const ASSESSMENT_SESSION_PAGE_SIZE = 100;
type AcademicSearchParams = Promise<Record<string, string | string[] | undefined>>;
const oneSearchParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

async function fetchInitialAssessmentSessions(
  token: string,
  period: AcademicPeriod | null,
  own = false,
): Promise<{
  data: AssessmentSessionData[];
  all: AssessmentSessionData[];
  total: number;
  page: number;
  limit: number;
  failed: boolean;
  state: SummaryReadState;
}> {
  const read = await academicPagesResult<AssessmentSessionData>(
    periodPath(`/assessment/sessions?purpose=regular${own ? '&scope=own' : ''}`, period),
    token,
  );
  if (read.status !== 'success')
    return {
      data: [],
      all: [],
      total: 0,
      page: 1,
      limit: ASSESSMENT_SESSION_PAGE_SIZE,
      failed: true,
      state: summaryState(read),
    };
  const first = read.data;
  return {
    data: first.data.slice(0, ASSESSMENT_SESSION_PAGE_SIZE),
    all: first.data,
    total: first.total ?? first.data.length,
    page: first.page ?? 1,
    limit: ASSESSMENT_SESSION_PAGE_SIZE,
    failed: false,
    state: 'ready',
  };
}

export default async function AkademikPage({
  searchParams,
}: {
  searchParams: AcademicSearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const requestedParams = await searchParams;
  const openNotifications = oneSearchParam(requestedParams.panel) === 'notifications';
  const initialStudentId = oneSearchParam(requestedParams.studentId).trim();
  const requestedAttendanceDate = oneSearchParam(requestedParams.attendanceDate).trim();
  const initialAttendanceDate = validSessionDate(requestedAttendanceDate)
    ? requestedAttendanceDate
    : undefined;
  const token = session?.accessToken ?? '';
  const [activePeriod, configuredPeriods] = await Promise.all([
    apiFetch<ActiveSemester>('/school/semesters/active', token),
    apiFetch<ActiveSemester[]>('/school/semesters', token),
  ]);
  const selectedPeriod = selectAcademicPeriod(activePeriod, configuredPeriods ?? [], {
    academicYear: oneSearchParam(requestedParams.academicYear),
    semester: oneSearchParam(requestedParams.semester),
  });
  const pp = (path: string, mode?: 'semester' | 'year' | 'attendance' | 'journal') =>
    periodPath(path, selectedPeriod, mode);
  const academicYear = selectedPeriod?.academicYear.code ?? '';
  const semester = selectedPeriod?.number ?? 0;
  const inSelectedPeriod =
    !!selectedPeriod &&
    wibTodayISO() >= selectedPeriod.startDate.slice(0, 10) &&
    wibTodayISO() <= selectedPeriod.endDate.slice(0, 10);
  const bellProfile = inSelectedPeriod
    ? await apiFetch<BellProfile>(
        '/bell-schedules/resolve?' + new URLSearchParams({ scope: 'SCHOOL', date: wibTodayISO() }),
        token,
      )
    : null;
  const dailySlots = slotsForDay(bellProfile, scheduleDayOfWeek());
  const authority = await resolveDashboardAuthority(session);
  const roles = authority.roles;
  const viewAs = await getActiveViewAs(session);

  if (roles.includes('INDUSTRI')) redirect('/dashboard');
  const isGuru =
    roles.includes('GURU') && !authority.hasRole('KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG');
  const isDualRoleTeacher =
    (session.roles ?? []).includes('GURU') &&
    authority.hasRole('KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG') &&
    !authority.hasRole('SUPER_ADMIN');
  const operationsLabel = authority.hasRole('KEPALA_SEKOLAH')
    ? 'Kepemimpinan Sekolah'
    : authority.hasRole('KAPROG') && !authority.hasRole('WAKA_KURIKULUM')
      ? 'Operasional Jurusan'
      : 'Operasional Kurikulum';
  const initialAcademicMode =
    oneSearchParam(requestedParams.workspace) === 'teaching' ||
    ['teaching', 'question-bank', 'remedial'].includes(oneSearchParam(requestedParams.view))
      ? 'teaching'
      : oneSearchParam(requestedParams.workspace) === 'operations' ||
          authority.hasRole('KEPALA_SEKOLAH') ||
          (authority.hasRole('KAPROG') && !authority.hasRole('WAKA_KURIKULUM'))
        ? 'operations'
        : 'teaching';
  const isSiswa =
    roles.includes('SISWA') && !roles.includes('GURU') && !roles.includes('KEPALA_SEKOLAH');
  const isOrtu =
    roles.includes('ORANG_TUA') && !roles.includes('GURU') && !roles.includes('KEPALA_SEKOLAH');
  const isKs = authority.hasRole('KEPALA_SEKOLAH') && !roles.includes('SUPER_ADMIN');
  const canEditAssignment =
    authority.can('academic.teaching.manage') &&
    authority.hasRole('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM');
  const canReadAllClasses = authority.hasRole(
    'SUPER_ADMIN',
    'KEPALA_SEKOLAH',
    'TATA_USAHA',
    'WAKA_KURIKULUM',
  );

  const canReadAssignmentOptions =
    authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'WAKA_KURIKULUM', 'KAPROG') &&
    authority.can('academic.teaching.read');
  const [
    gradesRead,
    attendanceRead,
    classesRes,
    assignmentsRes,
    subjectsRes,
    assignmentOptionsRes,
  ] = await Promise.all([
    !isSiswa && !isOrtu
      ? academicPagesResult<GradeItem>(pp('/grades'), token)
      : Promise.resolve(null),
    !isSiswa && !isOrtu
      ? academicPagesResult<AttendanceItem>(pp('/attendance', 'attendance'), token)
      : Promise.resolve(null),
    canReadAllClasses
      ? academicPages<ClassItem>(pp('/classes', 'year'), token)
      : Promise.resolve({ data: [] as ClassItem[] }),
    !isSiswa && !isOrtu
      ? academicPages<Assignment>(
          pp(isGuru ? '/teaching-assignments?scope=own' : '/teaching-assignments', 'year'),
          token,
        )
      : Promise.resolve(null),
    !isSiswa && !isOrtu ? academicCatalog<SubjectItem>('/subjects', token) : Promise.resolve(null),
    canReadAssignmentOptions
      ? apiFetch<TeachingAssignmentOptions>('/teaching-assignments/options/active', token)
      : Promise.resolve(null),
  ]);
  const gradesData = gradesRead?.status === 'success' ? gradesRead.data : null;
  const attendanceData = attendanceRead?.status === 'success' ? attendanceRead.data : null;
  const todayDate = wibTodayISO();
  const todayPeriodState = teacherTodayState(activePeriod, selectedPeriod, todayDate);

  // JANGAN blokir dashboard. apiFetch null = gagal-muat (bukan kosong). Bila ada
  // sumber inti yang gagal → tampilkan peringatan NON-BLOK di workspace; guru tetap
  // bisa memakai tab lain. (Hindari menutup seluruh halaman seperti regresi LoadError.)
  const dataWarning =
    selectedPeriod === null ||
    gradesData === null ||
    attendanceData === null ||
    (canReadAllClasses && classesRes === null) ||
    assignmentsRes === null ||
    subjectsRes === null;

  // ── Dashboard Siswa (W2 — mobile-first, 7 bottom-nav tabs). ──────────────
  if (isSiswa) {
    const initialWorkflowView = resolveAcademicWorkflowView(requestedParams.view, 'student');
    // Snapshot before page reads: an update during rendering is detected by
    // the first poll rather than accepted as a new, already-rendered baseline.
    const initialChanges = await apiFetch<{ revision: string }>(
      '/student-dashboard/changes',
      token,
    );
    // Fetch siswa-specific data
    // Note: studentId lookup from keycloakId — backend should resolve this
    const studentId = session.keycloakId ?? '';
    const [
      gradesRes,
      attendanceRes,
      scheduleRes,
      announcementsRes,
      badgesRes,
      xpRes,
      leaderboardRes,
      assignmentsRes,
      modulesRes,
      cpRes,
    ] = await Promise.all([
      fetchLearnerGrades(pp('/analytics/grades/student'), token),
      academicPagesResult<AttendanceItem>(pp('/attendance', 'attendance'), token),
      academicPagesResult<ScheduleItem>(pp(OWN_STUDENT_SCHEDULE_PATH), token),
      apiFetch<{ data: { id: string; title: string; createdAt: string }[] }>(
        '/announcements?limit=5',
        token,
      ),
      // Wave 3 API integration (P19) — fail-soft, empty if null
      apiFetch<
        Array<{
          id: string;
          awardedAt: string;
          badge: {
            id: string;
            code: string;
            name: string;
            description: string;
            icon: string;
            tier: string;
          };
        }>
      >('/badges/my', token),
      apiFetch<{
        id: string;
        studentId: string;
        totalXp: number;
        level: number;
        streakDays: number;
        nextLevelXp: number | null;
        xpToNextLevel: number | null;
      }>('/gamification/my-xp', token),
      apiFetch<
        Array<{
          id: string;
          studentId: string;
          totalXp: number;
          level: number;
          rank: number;
          student: {
            nis: string;
            user: { fullName: string };
            class: { id: string; name: string } | null;
          };
        }>
      >('/gamification/leaderboard-xp?limit=10', token),
      // P26: Wire pure SIM data sources to real APIs
      fetchStudentTasks(token),
      apiFetch<{ data: LmsModuleItem[] }>('/lms/modules/my-learning?limit=50', token),
      // Grade aggregates are not evidence of CP/TP attainment.
      Promise.resolve(null),
    ]);

    // Transform badges API response → SiswaBadge[]
    const TIER_COLORS: Record<string, string> = {
      BRONZE: '#cd7f32',
      SILVER: '#c0c0c0',
      GOLD: '#ffd700',
      PLATINUM: '#e5e4e2',
    };
    const realBadges: SiswaBadge[] | null = badgesRes
      ? badgesRes.map((sb) => ({
          name: sb.badge.name,
          icon: sb.badge.icon || 'award',
          color: TIER_COLORS[sb.badge.tier] ?? '#10b981',
          earned: true,
          cat: sb.badge.code,
          score: null,
          prog: null,
          desc: sb.badge.description ?? '',
        }))
      : null;

    // Transform XP API response → SiswaXP
    const realXp: SiswaXP | null = xpRes
      ? {
          level: xpRes.level,
          current: xpRes.totalXp,
          next: xpRes.nextLevelXp ?? xpRes.totalXp,
          streakDays: xpRes.streakDays,
        }
      : null;

    // Transform attendance stats → add pct (P26)
    const attendanceRead = readLearnerAttendance(selectedPeriod ? attendanceRes : null);
    const realAttStats =
      attendanceRead.state === 'ready' ? attendanceStats(attendanceRead.data) : null;

    // Transform leaderboard API response → SiswaLeaderboardEntry[]
    const realLeaderboard: SiswaLeaderboardEntry[] | null = leaderboardRes
      ? leaderboardRes.map((entry) => ({
          name: entry.student?.user?.fullName ?? 'Siswa',
          kelas: entry.student?.class?.name ?? '—',
          xp: entry.totalXp,
          badges: 0, // Not available from XP leaderboard endpoint
          avg: 0, // Not available from XP leaderboard endpoint
          me: entry.studentId === studentId,
        }))
      : null;

    // Transform LMS modules API → SiswaModul[] (field-name mapping).
    // Sebelumnya cast langsung LmsModuleItem→SiswaModul menyebabkan field mapel/judul
    // undefined (modul tampil kosong). mapping ini benarkan agar judul+mapel real tampil.
    // T3-06: uuid dipreserve agar PATCH /lms/modules/:id/progress bisa dipanggil dari UI.
    const realModules: SiswaModul[] | null = modulesRes
      ? modulesRes.data.map((m, i) => {
          const published = m.status === 'published';
          const myProg = m.myProgress as { progress?: number; status?: string } | null;
          const prog = myProg?.progress ?? 0;
          const status: SiswaModul['status'] =
            myProg?.status === 'completed' ? 'Selesai' : !published ? 'Terkunci' : 'Aktif';
          return {
            id: i + 1,
            uuid: m.id, // T3-06: preserve real UUID for progress endpoint
            tp: m.tp ?? '—',
            judul: m.title,
            content: m.content,
            alokasi: `${m.jpAllocation ?? 0} JP`,
            kktp: m.kktp,
            status,
            lms: published,
            prog,
            badge: null,
            mapel: m.subject,
          };
        })
      : null;

    const ownedSchedule = readLearnerSchedule(scheduleRes);
    return (
      <SiswaRefreshWrapper key={studentId} initialRevision={initialChanges?.revision ?? null}>
        <SiswaWorkspace
          initialAttendanceDate={initialAttendanceDate}
          grades={gradesRes.data}
          gradeState={gradesRes.state}
          attendance={attendanceRead.data}
          attendanceState={attendanceRead.state}
          attendancePeriod={
            selectedPeriod
              ? {
                  dateFrom: selectedPeriod.startDate.slice(0, 10),
                  dateTo: selectedPeriod.endDate.slice(0, 10),
                  academicYear,
                  semester,
                }
              : undefined
          }
          schedule={ownedSchedule.data}
          scheduleState={ownedSchedule.state}
          announcements={announcementsRes?.data ?? []}
          realBadges={realBadges}
          realXp={realXp}
          realLeaderboard={realLeaderboard}
          taskRead={assignmentsRes}
          realModules={realModules}
          realCp={cpRes}
          realAttStats={realAttStats}
          viewAs={viewAs}
          openNotifications={openNotifications}
          initialWorkflowView={initialWorkflowView}
        />
      </SiswaRefreshWrapper>
    );
  }

  // ── Dashboard Guru (IA baru). Role lain → tampilan lama (fallback). ─────────
  if (isGuru) {
    const initialWorkflowView = resolveAcademicWorkflowView(requestedParams.view, 'teacher');
    const [schedulesRead, activitiesRead, rppRead, lmsRes, assessmentRes, thresholdRead] =
      await Promise.all([
        academicPagesResult<ScheduleItem>(pp('/schedules?scope=own'), token),
        academicPagesResult<ActivityItem>(pp('/class-activities?scope=own', 'journal'), token),
        academicPagesResult<RppItem>(pp('/rpp?scope=own'), token),
        academicPages<LmsModuleItem>(pp('/lms/modules?scope=own'), token),
        fetchInitialAssessmentSessions(token, selectedPeriod, true),
        selectedPeriod
          ? apiFetchResult<unknown>(
              periodPath('/analytics/cp-progress?scope=own', selectedPeriod)!,
              token,
            )
          : Promise.resolve({ status: 'unavailable' as const, message: 'Periode belum tersedia.' }),
      ]);
    const schedulesRes = schedulesRead.status === 'success' ? schedulesRead.data : null;
    const activitiesRes = activitiesRead.status === 'success' ? activitiesRead.data : null;
    const rppRes = rppRead.status === 'success' ? rppRead.data : null;
    const thresholds =
      thresholdRead.status === 'success' ? readTeacherThresholds(thresholdRead.data) : null;

    const schedules = schedulesRes?.data ?? [];
    const { minutes } = wibNow();
    const dow = scheduleDayOfWeek();
    const nowJp = currentJp(minutes, dailySlots);

    const assessmentSessions = assessmentRes.all.filter(
      (s) => s.academicYear === academicYear && s.semester === semester,
    );

    const todayClasses: TodayClass[] = schedules
      .filter((s) => todayPeriodState === 'ready' && s.dayOfWeek === dow)
      .sort((a, b) => a.jpStart - b.jpStart)
      .map((s) => ({
        scheduleId: s.id,
        classId: s.classId,
        className: s.class?.name ?? '—',
        subject: s.teachingAssignment?.subject ?? '—',
        room: s.room ?? null,
        jpStart: s.jpStart,
        jpEnd: s.jpEnd,
        startLabel: jpStartLabel(s.jpStart, dailySlots),
        isNow: nowJp >= s.jpStart && nowJp <= s.jpEnd,
        ...lessonLinks(s, { academicYear, semester }, lmsRes?.data ?? [], assessmentSessions),
      }));

    return (
      <AkademikWorkspace
        allowGeneralLmsClass={roles.some((role) =>
          ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM'].includes(role),
        )}
        canReadClassSessions={authority.can('academic.class-session.read')}
        canOperateClassSessions={authority.can('academic.class-session.manage')}
        grades={gradesData?.data ?? []}
        attendances={attendanceData?.data ?? []}
        classes={classesRes?.data ?? []}
        assignments={assignmentsRes?.data ?? []}
        schedules={schedules}
        scheduleAvailable={!!schedulesRes}
        summaryAvailability={{
          grades: gradesRead ? summaryState(gradesRead) : 'unavailable',
          attendance: attendanceRead ? summaryState(attendanceRead) : 'unavailable',
          journal: summaryState(activitiesRead),
          rpp: summaryState(rppRead),
          assessments:
            assessmentRes.state === 'ready' && !lmsRes ? 'unavailable' : assessmentRes.state,
          kktp: thresholds
            ? 'ready'
            : thresholdRead.status === 'success'
              ? 'unavailable'
              : summaryState(thresholdRead),
          today: todayPeriodState === 'ready' ? summaryState(schedulesRead) : todayPeriodState,
        }}
        summaryThresholds={thresholds ?? []}
        todayDate={todayDate}
        activities={activitiesRes?.data ?? []}
        rpp={rppRes?.data ?? []}
        lmsModules={lmsRes?.data ?? []}
        todayClasses={todayClasses}
        assessmentSessions={assessmentRes.data}
        assessmentSessionTotal={assessmentRes.total}
        assessmentSessionPage={assessmentRes.page}
        assessmentSessionLimit={assessmentRes.limit}
        academicYear={academicYear}
        semester={semester}
        dataWarning={
          dataWarning ||
          assessmentRes.failed ||
          !schedulesRes ||
          !activitiesRes ||
          !rppRes ||
          !lmsRes
        }
        canManageReportCards={!authority.hasRole('SUPER_ADMIN')}
        initialWorkflowView={initialWorkflowView}
      />
    );
  }

  // ── Dashboard KS / Waka Kurikulum (F4 — desktop-first, 7-screen workspace). ─
  if (isKs) {
    const initialWorkflowView = resolveAcademicWorkflowView(requestedParams.view, 'principal');
    const [schedulesRes, activitiesRes, rppRes, lmsRes, assessmentRes] = await Promise.all([
      academicPages<ScheduleItem>(pp('/schedules'), token),
      academicPages<ActivityItem>(pp('/class-activities', 'journal'), token),
      academicPages<RppItem>(pp('/rpp'), token),
      academicPages<LmsModuleItem>(pp('/lms/modules'), token),
      fetchInitialAssessmentSessions(token, selectedPeriod),
    ]);

    return withOwnTeaching(
      <KsWorkspace
        canReadClassSessions={authority.can('academic.class-session.read')}
        grades={gradesData?.data ?? []}
        attendances={attendanceData?.data ?? []}
        classes={classesRes?.data ?? []}
        assignments={assignmentsRes?.data ?? []}
        rpp={rppRes?.data ?? []}
        schedules={schedulesRes?.data ?? []}
        activities={activitiesRes?.data ?? []}
        lmsModules={lmsRes?.data ?? []}
        realSumatif={assessmentRes.all}
        subjects={subjectsRes?.data ?? []}
        academicYear={academicYear}
        semester={semester}
        dataWarning={
          dataWarning ||
          assessmentRes.failed ||
          !schedulesRes ||
          !activitiesRes ||
          !rppRes ||
          !lmsRes
        }
        scheduleAvailable={!!schedulesRes}
        rppAvailable={!!rppRes}
        assessmentsAvailable={!assessmentRes.failed}
        initialWorkflowView={initialWorkflowView}
      />,
    );
  }

  // ── Dashboard Orang Tua (P25 — wired to real APIs, mobile-first, 5 tabs). ────
  if (isOrtu) {
    const initialWorkflowView = resolveAcademicWorkflowView(requestedParams.view, 'parent');
    // Snapshot before parent/child reads, so an update during render is retried.
    const initialParentChanges = await apiFetch<{ revision: string; scopeRevision: string }>(
      '/student-dashboard/parent-changes', token,
    );
    // Round 1: fetch announcements + children list
    const [announcementsRes, childrenRes] = await Promise.all([
      apiFetch<{ data: { id: string; title: string; createdAt: string }[] }>(
        '/announcements?limit=5',
        token,
      ),
      apiFetchResult<{
        data: Array<{
          id: string;
          nis: string;
          user: { fullName: string };
          class: { id: string; name: string } | null;
          parentId: string;
        }>;
      }>('/students/my-children', token),
    ]);

    const childRead = readParentChildren(childrenRes);
    const children = childRead.data;
    const childIds = children.map((child) => child.id);
    type OrtuBadgeApiItem = {
      id: string;
      awardedAt: string;
      badge: {
        id: string;
        code: string;
        name: string;
        description: string;
        icon: string;
        tier: string;
      };
    };
    type LeaderboardEntry = {
      id: string;
      studentId: string;
      totalXp: number;
      level: number;
      rank: number;
      student: {
        nis: string;
        user: { fullName: string };
        class: { id: string; name: string } | null;
      };
    };
    const tagWithStudentId = <T extends object>(
      items: T[] | undefined,
      studentId: string,
    ): Array<T & { studentId: string }> => (items ?? []).map((item) => ({ ...item, studentId }));

    // Round 2: fetch child-specific data (all in parallel, fail-soft → null)
    const childDataPromise = Promise.all(
      children.map(async (child) => {
        const studentId = child.id;
        const schedulePath = childSchedulePath(child.class?.id);
        const [attendanceRes, scheduleRes, badgesRes, waLogRes] = await Promise.all([
          academicPagesResult<AttendanceItem>(
            pp(`/attendance?studentId=${studentId}`, 'attendance'),
            token,
          ),
          schedulePath
            ? academicPagesResult<ScheduleItem>(pp(schedulePath), token)
            : Promise.resolve({
                status: 'success' as const,
                httpStatus: 200,
                data: { data: [] as ScheduleItem[] },
              }),
          apiFetch<OrtuBadgeApiItem[]>(`/badges/student/${studentId}`, token),
          apiFetch<
            Array<{
              id: string;
              studentId: string;
              recipient: string;
              message: string;
              eventType: string;
              createdAt: string;
            }>
          >(`/wa-log/student/${studentId}?limit=20`, token),
        ]);
        const childSchedule = readLearnerSchedule(scheduleRes);
        const childAttendance = readLearnerAttendance(
          selectedPeriod ? attendanceRes : null,
          studentId,
        );
        return {
          studentId,
          scheduleState: schedulePath ? childSchedule.state : ('unassigned' as const),
          attendanceState: childAttendance.state,
          attendance:
            childAttendance.state === 'ready' && attendanceRes.status === 'success'
              ? attendanceRes.data.data.filter((item) => item.studentId === studentId)
              : [],
          schedule: tagWithStudentId(childSchedule.data, studentId),
          badges: tagWithStudentId(badgesRes ?? [], studentId),
          waLog: tagWithStudentId(waLogRes ?? [], studentId),
        };
      }),
    );

    const [childData, sppRes, assignmentsDashboardRes, semRes, leaderboardRes, learnerGrades] =
      await Promise.all([
        childDataPromise,
        childIds.length
          ? fetchParentSpp(token, childIds)
          : Promise.resolve({ state: 'denied' as const }),
        childIds.length
          ? apiFetch<{ data: OrtuStudentDashboardAssignmentGroup[] }>(
              '/student-dashboard/assignments',
              token,
            )
          : Promise.resolve(null),
        Promise.resolve(selectedPeriod),
        childIds.length
          ? apiFetch<LeaderboardEntry[]>('/gamification/leaderboard-xp?limit=50', token)
          : Promise.resolve(null),
        childIds.length
          ? fetchLearnerGrades(pp('/analytics/grades/student'), token)
          : Promise.resolve({ state: 'unavailable' as const, data: [] }),
      ]);

    // R-16: Compute semester label for RaporModal
    const academicYearOrtu = semRes?.academicYear?.code ?? '';
    const semesterOrtu = semRes?.number ?? 0;
    const semesterLabel = semRes
      ? `Rapor Semester ${semesterOrtu === 1 ? 'Ganjil' : 'Genap'} ${academicYearOrtu}`
      : '';

    const childRanks = Object.fromEntries(
      childIds.map((studentId) => [
        studentId,
        leaderboardRes?.find((entry) => entry.studentId === studentId)?.rank ?? null,
      ]),
    );
    const gradesDataOrtu = learnerGrades.data.filter((item) => childIds.includes(item.studentId));
    const attendanceDataOrtu = childData.flatMap((item) => item.attendance);
    const scheduleDataOrtu = childData.flatMap((item) => item.schedule);
    const badgesDataOrtu = childData.flatMap((item) => item.badges);
    const waLogDataOrtu = childData.flatMap((item) => item.waLog);
    const assignmentsDataOrtu = normalizeAssignmentGroups(assignmentsDashboardRes?.data ?? []);

    // Transform children for OrtuWorkspace
    const ortuChildren = children.map((c) => ({
      id: Number(c.id.replace(/\D/g, '').slice(0, 8)) || 0,
      studentId: c.id,
      name: c.user?.fullName ?? 'Anak',
      kelas: c.class?.name ?? '—',
      active: true,
      avg: 0,
      att: 0,
      wali: '—',
    }));

    return (
      <OrtuRefreshWrapper key={session.keycloakId ?? ''}
        initialRevision={initialParentChanges?.revision ?? null}
        initialScopeRevision={initialParentChanges?.scopeRevision ?? null}>
        <OrtuWorkspace
          initialAttendanceDate={initialAttendanceDate}
          attendancePeriod={
            selectedPeriod
              ? {
                  dateFrom: selectedPeriod.startDate.slice(0, 10),
                  dateTo: selectedPeriod.endDate.slice(0, 10),
                  academicYear,
                  semester,
                }
              : undefined
          }
          children={ortuChildren}
          childrenState={childRead.state}
          grades={gradesDataOrtu}
          gradeState={learnerGrades.state}
          attendance={attendanceDataOrtu}
          attendanceStates={Object.fromEntries(
            childData.map((item) => [item.studentId, item.attendanceState]),
          )}
          schedule={scheduleDataOrtu}
          scheduleStates={Object.fromEntries(
            childData.map((item) => [item.studentId, item.scheduleState]),
          )}
          announcements={announcementsRes?.data ?? []}
          sppRead={sppRes}
          assignments={assignmentsDataOrtu}
          badges={badgesDataOrtu}
          waLog={waLogDataOrtu}
          viewAs={viewAs}
          semesterLabel={semesterLabel}
          childRanks={childRanks}
          openNotifications={openNotifications}
          initialStudentId={initialStudentId}
          initialWorkflowView={initialWorkflowView}
        />
      </OrtuRefreshWrapper>
    );
  }

  if (!assignmentsRes || (canReadAssignmentOptions && !assignmentOptionsRes)) {
    return (
      <AcademicDataNotice
        href="/dashboard/akademik"
        message="Penugasan mengajar atau pilihan data aktif belum dapat dimuat."
      />
    );
  }

  const operationsWorkspace = (
    <div className="space-y-4">
      {authority.can('academic.attendance.read') && authority.can('academic.class-session.read') && (
        <AttendanceJpSummary query={{ academicYear, semester }} refreshToken={Date.now()} />
      )}
    <AcademicOperationsWorkspace
      assignments={assignmentsRes.data}
      assignmentTotal={assignmentsRes.total}
      options={
        assignmentOptionsRes ?? {
          teachers: [],
          classes: [],
          subjects: [],
          academicYears: [],
          scope: { type: 'global', labels: [] },
        }
      }
      canManageAssignments={canEditAssignment}
      canDeleteAssignments={
        authority.can('academic.teaching.manage') && roles.includes('SUPER_ADMIN')
      }
      workflowAccess={{
        schedule: authority.can('academic.schedule.read'),
        report: authority.can('report.read'),
        activities: authority.can('activity.read'),
        reviewRpp:
          authority.can('rpp.curriculum.review') ||
          authority.can('rpp.final.approve') ||
          (authority.hasRole('SUPER_ADMIN') && authority.can('rpp.read')),
      }}
    />
    </div>
  );

  return withOwnTeaching(operationsWorkspace);

  async function withOwnTeaching(
    operationsWorkspace: React.ReactElement,
  ): Promise<React.ReactElement> {
    if (!isDualRoleTeacher) return operationsWorkspace;

    const ownTeacherContext = await apiFetch<{ teacherId: string }>(
      '/teaching-assignments/me/context',
      token,
    );
    const ownTeacherId = ownTeacherContext?.teacherId ?? null;

    if (!ownTeacherId) {
      return (
        <AcademicRoleModeSwitcher
          initialMode={initialAcademicMode}
          operationsLabel={operationsLabel}
          teachingWorkspace={
            <AcademicDataNotice
              href="/dashboard/akademik"
              message={`Profil guru untuk Pengajaran Saya belum dapat dimuat. ${operationsLabel} tetap tersedia. Coba muat ulang.`}
            />
          }
          operationsWorkspace={operationsWorkspace}
        />
      );
    }

    const ownAssignmentsRes = await academicPages<Assignment>(
      pp(`/teaching-assignments?scope=own&teacherId=${encodeURIComponent(ownTeacherId)}`, 'year'),
      token,
    );
    const ownAssignments = ownAssignmentsRes?.data ?? [];
    const ownClassIds = [...new Set(ownAssignments.map((assignment) => assignment.classId))];

    const [
      ownSchedulesRead,
      ownRppRead,
      ownAssessmentRes,
      semesterRes,
      gradeResponses,
      attendanceResponses,
      activityResponses,
      lmsResponses,
    ] = await Promise.all([
      academicPagesResult<ScheduleItem>(
        pp(`/schedules?scope=own&teacherId=${encodeURIComponent(ownTeacherId)}`),
        token,
      ),
      academicPagesResult<RppItem>(
        pp(`/rpp?scope=own&teacherId=${encodeURIComponent(ownTeacherId)}`),
        token,
      ),
      fetchInitialAssessmentSessions(token, selectedPeriod, true),
      Promise.resolve(selectedPeriod),
      Promise.all(
        ownAssignments.map((assignment) =>
          academicPagesResult<GradeItem>(pp(`/grades?assignmentId=${assignment.id}`), token),
        ),
      ),
      Promise.all(
        ownClassIds.map((classId) =>
          academicPagesResult<AttendanceItem>(
            pp(`/attendance?classId=${classId}`, 'attendance'),
            token,
          ),
        ),
      ),
      Promise.all(
        ownClassIds.map((classId) =>
          academicPagesResult<ActivityItem & { teacher?: { id: string } }>(
            pp(`/class-activities?scope=own&classId=${classId}`, 'journal'),
            token,
          ),
        ),
      ),
      Promise.all(
        ownAssignments.map((assignment) => {
          const query = new URLSearchParams({
            scope: 'own',
            classId: assignment.classId,
            subject: assignment.subject,
            academicYear: assignment.academicYear,
            page: '1',
            limit: '200',
          });
          return academicPages<LmsModuleItem>(pp(`/lms/modules?${query.toString()}`), token);
        }),
      ),
    ]);

    const ownSchedulesRes = ownSchedulesRead.status === 'success' ? ownSchedulesRead.data : null;
    const ownRppRes = ownRppRead.status === 'success' ? ownRppRead.data : null;
    const ownSchedules = ownSchedulesRes?.data ?? [];
    const ownGrades = gradeResponses.flatMap((response) =>
      response.status === 'success' ? response.data.data : [],
    );
    const ownAttendances = attendanceResponses.flatMap((response) =>
      response.status === 'success' ? response.data.data : [],
    );
    const ownActivities = activityResponses
      .flatMap((response) => (response.status === 'success' ? response.data.data : []))
      .filter((activity) => activity.teacher?.id === ownTeacherId);
    const ownLmsModules = [
      ...new Map(
        lmsResponses
          .flatMap((response) => response?.data ?? [])
          .filter((module) => module.teacherId === ownTeacherId)
          .map((module) => [module.id, module]),
      ).values(),
    ];
    const ownRpp = ownRppRes?.data ?? [];
    const ownAssessmentSessions = ownAssessmentRes.all.filter(
      (assessment) =>
        assessment.teacherId === ownTeacherId &&
        assessment.academicYear === academicYear &&
        assessment.semester === semester,
    );
    const ownClasses = ownAssignments
      .map((assignment) => assignment.class)
      .filter((kelas, index, all) => all.findIndex((item) => item.id === kelas.id) === index);
    const { minutes } = wibNow();
    const today = scheduleDayOfWeek();
    const nowJp = currentJp(minutes, dailySlots);
    const ownTodayClasses: TodayClass[] = ownSchedules
      .filter((schedule) => todayPeriodState === 'ready' && schedule.dayOfWeek === today)
      .sort((left, right) => left.jpStart - right.jpStart)
      .map((schedule) => ({
        scheduleId: schedule.id,
        classId: schedule.classId,
        className: schedule.class?.name ?? '—',
        subject: schedule.teachingAssignment?.subject ?? '—',
        room: schedule.room ?? null,
        jpStart: schedule.jpStart,
        jpEnd: schedule.jpEnd,
        startLabel: jpStartLabel(schedule.jpStart, dailySlots),
        isNow: nowJp >= schedule.jpStart && nowJp <= schedule.jpEnd,
        ...lessonLinks(schedule, { academicYear, semester }, ownLmsModules, ownAssessmentSessions),
      }));
    const ownDataWarning =
      ownAssignmentsRes === null ||
      ownSchedulesRes === null ||
      ownRppRes === null ||
      semesterRes === null ||
      ownAssessmentRes.failed ||
      gradeResponses.some((response) => response.status !== 'success') ||
      attendanceResponses.some((response) => response.status !== 'success') ||
      activityResponses.some((response) => response.status !== 'success') ||
      lmsResponses.some((response) => response === null) ||
      selectedPeriod === null;

    const ownThresholdResponses = await Promise.all(
      ownClassIds.map((classId) =>
        selectedPeriod
          ? apiFetchResult<unknown>(
              periodPath(
                `/analytics/cp-progress?scope=own&classId=${encodeURIComponent(classId)}`,
                selectedPeriod,
              )!,
              token,
            )
          : Promise.resolve({ status: 'unavailable' as const, message: 'Periode belum tersedia.' }),
      ),
    );
    const ownThresholdRows = ownThresholdResponses.map((response) =>
      response.status === 'success' ? readTeacherThresholds(response.data) : null,
    );
    const ownThresholds = ownThresholdRows.some((rows) => rows === null)
      ? null
      : mergeTeacherThresholds(ownThresholdRows.filter((rows) => rows !== null));
    const ownReadState = (responses: ApiFetchResult<unknown>[]): SummaryReadState =>
      !ownAssignmentsRes || !selectedPeriod
        ? 'unavailable'
        : responses.some((response) => response.status === 'forbidden')
          ? 'denied'
          : responses.some((response) => response.status !== 'success')
            ? 'unavailable'
            : 'ready';

    const teachingWorkspace = (
      <AkademikWorkspace
        allowGeneralLmsClass={roles.some((role) =>
          ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM'].includes(role),
        )}
        canReadClassSessions={authority.can('academic.class-session.read')}
        canOperateClassSessions={authority.can('academic.class-session.manage')}
        grades={ownGrades}
        attendances={ownAttendances}
        classes={ownClasses}
        assignments={ownAssignments}
        schedules={ownSchedules}
        scheduleAvailable={!!ownSchedulesRes}
        summaryAvailability={{
          grades: ownReadState(gradeResponses),
          attendance: ownReadState(attendanceResponses),
          journal: ownReadState(activityResponses),
          rpp: summaryState(ownRppRead),
          assessments:
            ownAssessmentRes.state === 'ready' &&
            (!ownAssignmentsRes || lmsResponses.some((response) => response === null))
              ? 'unavailable'
              : ownAssessmentRes.state,
          kktp:
            ownReadState(ownThresholdResponses) !== 'ready'
              ? ownReadState(ownThresholdResponses)
              : ownThresholds
                ? 'ready'
                : 'unavailable',
          today: todayPeriodState === 'ready' ? summaryState(ownSchedulesRead) : todayPeriodState,
        }}
        summaryThresholds={ownThresholds ?? []}
        todayDate={todayDate}
        activities={ownActivities}
        rpp={ownRpp}
        lmsModules={ownLmsModules}
        todayClasses={ownTodayClasses}
        assessmentSessions={ownAssessmentSessions.slice(0, ASSESSMENT_SESSION_PAGE_SIZE)}
        assessmentSessionTotal={ownAssessmentSessions.length}
        assessmentSessionPage={ownAssessmentRes.page}
        assessmentSessionLimit={ownAssessmentRes.limit}
        academicYear={semesterRes?.academicYear?.code ?? ''}
        semester={semesterRes?.number ?? 0}
        dataWarning={ownDataWarning}
        canManageReportCards={!authority.hasRole('SUPER_ADMIN')}
        initialWorkflowView={resolveAcademicWorkflowView(requestedParams.view, 'teacher')}
      />
    );

    return (
      <AcademicRoleModeSwitcher
        initialMode={initialAcademicMode}
        operationsLabel={operationsLabel}
        teachingWorkspace={teachingWorkspace}
        operationsWorkspace={operationsWorkspace}
      />
    );
  }
}
