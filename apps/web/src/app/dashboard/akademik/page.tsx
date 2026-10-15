import React from 'react';
import { academicPages, academicPagesResult, academicCatalog } from '@/lib/academic-pages-server';
import { periodPath, selectAcademicPeriod, lessonLinks, type AcademicPeriod } from '@/lib/academic-scheduling';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getActiveViewAs } from '@/lib/view-as';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { redirect } from 'next/navigation';
import { apiFetch, apiFetchResult, GradeItem, AttendanceItem } from '@/lib/api';
import { readParentChildren } from '@/lib/parent-children';
import { fetchLearnerGrades } from '@/lib/learner-grades-server';
import type {
  SiswaBadge,
  SiswaXP,
  SiswaLeaderboardEntry,
  SiswaModul,
  SiswaTugas,
} from './_components/siswa/siswa-types';
import { slotsForDay, type BellProfile } from '@/lib/bell-patterns';
import { wibTodayISO, scheduleDayOfWeek, currentJp, jpStartLabel, wibNow } from '@/lib/bell-times';
import AcademicOperationsWorkspace from './_components/AcademicOperationsWorkspace';
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
  normalizeSppGroups,
  type SppDashboardGroup,
  type StudentDashboardAssignmentGroup as OrtuStudentDashboardAssignmentGroup,
} from './_components/ortu/ortu-mappers';
import { resolveAcademicWorkflowView } from '@/lib/academic-workflow-deep-link';
import { childSchedulePath, OWN_STUDENT_SCHEDULE_PATH, readLearnerSchedule } from '@/lib/learner-schedule';
import { readTeacherThresholds, mergeTeacherThresholds, teacherTodayState, type SummaryReadState } from '@/lib/teacher-summary';
import type { ApiFetchResult } from '@/lib/api';

const summaryState = (result: ApiFetchResult<unknown>): SummaryReadState => result.status === 'success' ? 'ready' : result.status === 'forbidden' ? 'denied' : 'unavailable';

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
interface StudentDashboardAssignment {
  id: string;
  type: 'lms' | 'assessment';
  title: string;
  subject: string;
  guru: string | null;
  status: 'pending' | 'submitted' | 'graded';
  lateSubmissionStatus?: 'pending' | 'accepted' | 'rejected' | null;
  progress?: number;
  kktp?: number;
  purpose?: 'regular' | 'remedial';
  sessionStatus?: string;
  dueAt?: string | null;
  instructions?: string | null;
  remedialParticipant?: {
    status: 'assigned' | 'in_progress' | 'submitted' | 'passed' | 'needs_retry';
    assignedAt: string;
    startedAt: string | null;
    submittedAt: string | null;
    finalizedAt: string | null;
  } | null;
}
interface SiswaDashboardAssignmentGroup {
  assignments: StudentDashboardAssignment[];
}

function monthBounds(year: number, monthIndex0: number): { dateFrom: string; dateTo: string } {
  const month = String(monthIndex0 + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  return {
    dateFrom: `${year}-${month}-01`,
    dateTo: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

const ASSESSMENT_SESSION_PAGE_SIZE = 100;
type AcademicSearchParams = Promise<Record<string, string | string[] | undefined>>;
const oneSearchParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

function assignmentDeadline(
  dueAt: string | null | undefined,
  now: Date,
): {
  label: string;
  days: number;
} {
  if (!dueAt) return { label: 'Tanpa tenggat', days: Number.POSITIVE_INFINITY };
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime()))
    return { label: 'Tenggat tidak valid', days: Number.POSITIVE_INFINITY };
  return {
    label: new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(date),
    days: Math.ceil((date.getTime() - now.getTime()) / 86_400_000),
  };
}

function studentTaskStatus(item: StudentDashboardAssignment): 'pending' | 'submitted' | 'graded' {
  if (item.purpose !== 'remedial' || !item.remedialParticipant) return item.status;
  if (item.remedialParticipant.status === 'submitted') return 'submitted';
  if (item.remedialParticipant.status === 'passed') return 'graded';
  return 'pending';
}

async function fetchInitialAssessmentSessions(token: string, period: AcademicPeriod | null): Promise<{
  data: AssessmentSessionData[];
  all: AssessmentSessionData[];
  total: number;
  page: number;
  limit: number;
  failed: boolean;
  state: SummaryReadState;
}> {
  const read = await academicPagesResult<AssessmentSessionData>(periodPath('/assessment/sessions?purpose=regular', period), token);
  if (read.status !== 'success')
    return { data: [], all: [], total: 0, page: 1, limit: ASSESSMENT_SESSION_PAGE_SIZE, failed: true, state: summaryState(read) };
  const first = read.data;
  return {
    data: first.data.slice(0,ASSESSMENT_SESSION_PAGE_SIZE),
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
  const token = session?.accessToken ?? '';
  const [activePeriod, configuredPeriods] = await Promise.all([
    apiFetch<ActiveSemester>('/school/semesters/active', token),
    apiFetch<ActiveSemester[]>('/school/semesters', token),
  ]);
  const selectedPeriod = selectAcademicPeriod(activePeriod, configuredPeriods ?? [], {
    academicYear: oneSearchParam(requestedParams.academicYear),
    semester: oneSearchParam(requestedParams.semester),
  });
  const pp = (path: string, mode?: 'semester' | 'year' | 'attendance' | 'journal') => periodPath(path, selectedPeriod, mode);
  const academicYear = selectedPeriod?.academicYear.code ?? '';
  const semester = selectedPeriod?.number ?? 0;
  const inSelectedPeriod = !!selectedPeriod && wibTodayISO() >= selectedPeriod.startDate.slice(0,10) && wibTodayISO() <= selectedPeriod.endDate.slice(0,10);
  const bellProfile = inSelectedPeriod ? await apiFetch<BellProfile>(
    '/bell-schedules/resolve?' + new URLSearchParams({ scope: 'SCHOOL', date: wibTodayISO() }), token) : null;
  const dailySlots = slotsForDay(bellProfile, scheduleDayOfWeek());
  const authority = await resolveDashboardAuthority(session);
  const roles = authority.roles;
  const viewAs = await getActiveViewAs(session);

  if (roles.includes('INDUSTRI')) redirect('/dashboard');
  const isGuru = roles.includes('GURU') && !authority.hasRole('KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG');
  const isDualRoleWaka =
    (session.roles ?? []).includes('GURU') &&
    authority.hasRole('WAKA_KURIKULUM') &&
    !authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH');
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
    academicPagesResult<GradeItem>(pp('/grades'), token),
    academicPagesResult<AttendanceItem>(pp('/attendance', 'attendance'), token),
    canReadAllClasses
      ? academicPages<ClassItem>(pp('/classes', 'year'), token)
      : Promise.resolve({ data: [] as ClassItem[] }),
    academicPages<Assignment>(pp('/teaching-assignments', 'year'), token),
    academicCatalog<SubjectItem>('/subjects', token),
    canReadAssignmentOptions
      ? apiFetch<TeachingAssignmentOptions>('/teaching-assignments/options/active', token)
      : Promise.resolve(null),
  ]);
  const gradesData = gradesRead.status === 'success' ? gradesRead.data : null;
  const attendanceData = attendanceRead.status === 'success' ? attendanceRead.data : null;
  const todayDate = wibTodayISO();
  const todayPeriodState = teacherTodayState(activePeriod, selectedPeriod, todayDate);

  // JANGAN blokir dashboard. apiFetch null = gagal-muat (bukan kosong). Bila ada
  // sumber inti yang gagal → tampilkan peringatan NON-BLOK di workspace; guru tetap
  // bisa memakai tab lain. (Hindari menutup seluruh halaman seperti regresi LoadError.)
  const dataWarning =
    selectedPeriod === null || gradesData === null ||
    attendanceData === null ||
    (canReadAllClasses && classesRes === null) ||
    assignmentsRes === null ||
    subjectsRes === null;

  // ── Dashboard Siswa (W2 — mobile-first, 7 bottom-nav tabs). ──────────────
  if (isSiswa) {
    const initialWorkflowView = resolveAcademicWorkflowView(requestedParams.view, 'student');
    // Fetch siswa-specific data
    // Note: studentId lookup from keycloakId — backend should resolve this
    const studentId = session.keycloakId ?? '';
    const now = new Date();
    const attendanceMonth = monthBounds(now.getFullYear(), now.getMonth());
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
      attStatsRes,
    ] = await Promise.all([
      fetchLearnerGrades(pp('/analytics/grades/student'), token),
      academicPages<AttendanceItem>(selectedPeriod && attendanceMonth.dateFrom <= selectedPeriod.endDate.slice(0,10) && attendanceMonth.dateTo >= selectedPeriod.startDate.slice(0,10) ?
        '/attendance?' + new URLSearchParams({ dateFrom: attendanceMonth.dateFrom > selectedPeriod.startDate.slice(0,10) ? attendanceMonth.dateFrom : selectedPeriod.startDate.slice(0,10), dateTo: attendanceMonth.dateTo < selectedPeriod.endDate.slice(0,10) ? attendanceMonth.dateTo : selectedPeriod.endDate.slice(0,10) }) : null,
        token,
      ),
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
      apiFetch<{ data: SiswaDashboardAssignmentGroup[] }>(
        '/student-dashboard/assignments?limit=20',
        token,
      ),
      apiFetch<{ data: LmsModuleItem[] }>('/lms/modules/my-learning?limit=50', token),
      apiFetch<{ data: unknown[] }>('/student-dashboard/cp', token),
      apiFetch<{ hadir: number; izin: number; sakit: number; alpha: number; total: number }>(
        '/analytics/attendance/stats',
        token,
      ),
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
    const realAttStats = attStatsRes
      ? {
          ...attStatsRes,
          pct:
            attStatsRes.total > 0 ? Math.round((attStatsRes.hadir / attStatsRes.total) * 100) : 0,
        }
      : null;

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
    const realAssignments: SiswaTugas[] | null = assignmentsRes
      ? assignmentsRes.data
          .flatMap((group) => group.assignments)
          .map((item, index) => {
            const deadline = assignmentDeadline(item.dueAt, now);
            return {
              id: index + 1,
              uuid: item.id,
              assessmentSessionId: item.type === 'assessment' ? item.id : undefined,
              purpose: item.purpose,
              sessionStatus: item.sessionStatus,
              dueAt: item.dueAt ?? null,
              remedialParticipant: item.remedialParticipant ?? null,
              mp: item.subject,
              title: item.title,
              type:
                item.purpose === 'remedial'
                  ? 'Remedial'
                  : item.type === 'assessment'
                    ? 'Asesmen'
                    : 'Modul LMS',
              deadline: deadline.label,
              dlDays: deadline.days,
              status: studentTaskStatus(item),
              lateSubmissionStatus: item.lateSubmissionStatus ?? null,
              guru: item.guru ?? 'Guru mapel',
              desc:
                item.instructions?.trim() ||
                (item.purpose === 'remedial'
                  ? 'Kerjakan remedial sesuai tenggat dan pantau status finalisasi dari guru.'
                  : item.type === 'assessment'
                    ? 'Kerjakan asesmen sesuai waktu dan kirim jawaban dari sistem.'
                    : 'Lanjutkan pembelajaran modul sampai selesai.'),
              score: item.status === 'graded' ? (item.progress ?? 0) : undefined,
              feedback: null,
              submittedFiles: 0,
            };
          })
      : null;

    const ownedSchedule = readLearnerSchedule(scheduleRes);
    return (
      <SiswaRefreshWrapper>
        <SiswaWorkspace
          grades={gradesRes.data}
          gradeState={gradesRes.state}
          attendance={attendanceRes?.data ?? []}
          schedule={ownedSchedule.data}
          scheduleState={ownedSchedule.state}
          announcements={announcementsRes?.data ?? []}
          realBadges={realBadges}
          realXp={realXp}
          realLeaderboard={realLeaderboard}
          realAssignments={realAssignments}
          realModules={realModules}
          realCp={cpRes?.data ?? null}
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
    const [schedulesRead, activitiesRead, rppRead, lmsRes, assessmentRes, thresholdRead] = await Promise.all([
      academicPagesResult<ScheduleItem>(pp('/schedules'), token),
      academicPagesResult<ActivityItem>(pp('/class-activities', 'journal'), token),
      academicPagesResult<RppItem>(pp('/rpp'), token),
      academicPages<LmsModuleItem>(pp('/lms/modules'), token),
      fetchInitialAssessmentSessions(token, selectedPeriod),
      selectedPeriod ? apiFetchResult<unknown>(periodPath('/analytics/cp-progress', selectedPeriod)!, token) : Promise.resolve({ status: 'unavailable' as const, message: 'Periode belum tersedia.' }),
    ]);
    const schedulesRes = schedulesRead.status === 'success' ? schedulesRead.data : null;
    const activitiesRes = activitiesRead.status === 'success' ? activitiesRead.data : null;
    const rppRes = rppRead.status === 'success' ? rppRead.data : null;
    const thresholds = thresholdRead.status === 'success' ? readTeacherThresholds(thresholdRead.data) : null;

    const schedules = schedulesRes?.data ?? [];
    const { minutes } = wibNow();
    const dow = scheduleDayOfWeek();
    const nowJp = currentJp(minutes, dailySlots);

    const assessmentSessions = assessmentRes.all.filter(s => s.academicYear === academicYear && s.semester === semester);

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
        grades={gradesData?.data ?? []}
        attendances={attendanceData?.data ?? []}
        classes={classesRes?.data ?? []}
        assignments={assignmentsRes?.data ?? []}
        schedules={schedules}
        scheduleAvailable={!!schedulesRes}
        summaryAvailability={{ grades: summaryState(gradesRead), attendance: summaryState(attendanceRead), journal: summaryState(activitiesRead), rpp: summaryState(rppRead), assessments: assessmentRes.state === 'ready' && !lmsRes ? 'unavailable' : assessmentRes.state, kktp: thresholds ? 'ready' : thresholdRead.status === 'success' ? 'unavailable' : summaryState(thresholdRead), today: todayPeriodState === 'ready' ? summaryState(schedulesRead) : todayPeriodState }}
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
        dataWarning={dataWarning || assessmentRes.failed || !schedulesRes || !activitiesRes || !rppRes || !lmsRes}
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


    return (
      <KsWorkspace
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
        dataWarning={dataWarning || assessmentRes.failed || !schedulesRes || !activitiesRes || !rppRes || !lmsRes}
        scheduleAvailable={!!schedulesRes}
        rppAvailable={!!rppRes}
        assessmentsAvailable={!assessmentRes.failed}
        initialWorkflowView={initialWorkflowView}
      />
    );
  }

  // ── Dashboard Orang Tua (P25 — wired to real APIs, mobile-first, 5 tabs). ────
  if (isOrtu) {
    const initialWorkflowView = resolveAcademicWorkflowView(requestedParams.view, 'parent');
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
          academicPages<AttendanceItem>(
            pp(`/attendance?studentId=${studentId}`, 'attendance'),
            token,
          ),
          schedulePath
            ? academicPagesResult<ScheduleItem>(pp(schedulePath), token)
            : Promise.resolve({ status: 'success' as const, httpStatus: 200, data: { data: [] as ScheduleItem[] } }),
          apiFetch<OrtuBadgeApiItem[]>(`/badges/student/${studentId}`, token),
          apiFetch<{
            data: Array<{
              id: string;
              studentId: string;
              recipient: string;
              message: string;
              eventType: string;
              createdAt: string;
            }>;
          }>(`/wa-log/student/${studentId}?limit=20`, token),
        ]);
        const childSchedule = readLearnerSchedule(scheduleRes);
        return {
          studentId,
          scheduleState: schedulePath ? childSchedule.state : 'unassigned' as const,
          attendance: tagWithStudentId(attendanceRes?.data.filter(item => item.studentId === studentId), studentId),
          schedule: tagWithStudentId(childSchedule.data, studentId),
          badges: tagWithStudentId(badgesRes ?? [], studentId),
          waLog: tagWithStudentId(waLogRes?.data, studentId),
        };
      }),
    );

    const [childData, sppRes, assignmentsDashboardRes, semRes, leaderboardRes, learnerGrades] = await Promise.all([
      childDataPromise,
      childIds.length
        ? apiFetch<{ data: SppDashboardGroup[] }>('/student-dashboard/spp', token)
        : Promise.resolve(null),
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
      childIds.length ? fetchLearnerGrades(pp('/analytics/grades/student'), token)
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
    const gradesDataOrtu = learnerGrades.data.filter(item => childIds.includes(item.studentId));
    const attendanceDataOrtu = childData.flatMap((item) => item.attendance);
    const scheduleDataOrtu = childData.flatMap((item) => item.schedule);
    const badgesDataOrtu = childData.flatMap((item) => item.badges);
    const waLogDataOrtu = childData.flatMap((item) => item.waLog);
    const sppDataOrtu = normalizeSppGroups(sppRes?.data ?? []);
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
      <OrtuRefreshWrapper>
        <OrtuWorkspace
          children={ortuChildren}
          childrenState={childRead.state}
          grades={gradesDataOrtu}
          gradeState={learnerGrades.state}
          attendance={attendanceDataOrtu}
          schedule={scheduleDataOrtu}
          scheduleStates={Object.fromEntries(childData.map((item) => [item.studentId, item.scheduleState]))}
          announcements={announcementsRes?.data ?? []}
          spp={sppDataOrtu}
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
  );

  if (!isDualRoleWaka) return operationsWorkspace;

  const ownTeacherContext = await apiFetch<{ teacherId: string }>(
    '/teaching-assignments/me/context',
    token,
  );
  const ownTeacherId = ownTeacherContext?.teacherId ?? null;

  if (!ownTeacherId) {
    return (
      <AcademicRoleModeSwitcher
        teachingWorkspace={
          <AcademicDataNotice
            href="/dashboard/akademik"
            message="Profil guru untuk ruang Pengajaran Saya belum dapat dicocokkan secara aman. Operasional Kurikulum tetap tersedia."
          />
        }
        operationsWorkspace={operationsWorkspace}
      />
    );
  }

  const ownAssignmentsRes = await academicPages<Assignment>(
    pp(`/teaching-assignments?teacherId=${encodeURIComponent(ownTeacherId)}`, 'year'),
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
      pp(`/schedules?teacherId=${encodeURIComponent(ownTeacherId)}`),
      token,
    ),
    academicPagesResult<RppItem>(
      pp(`/rpp?teacherId=${encodeURIComponent(ownTeacherId)}`),
      token,
    ),
    fetchInitialAssessmentSessions(token, selectedPeriod),
    Promise.resolve(selectedPeriod),
    Promise.all(
      ownAssignments.map((assignment) =>
        academicPagesResult<GradeItem>(
          pp(`/grades?assignmentId=${assignment.id}`),
          token,
        ),
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
          pp(`/class-activities?classId=${classId}`, 'journal'),
          token,
        ),
      ),
    ),
    Promise.all(
      ownAssignments.map((assignment) => {
        const query = new URLSearchParams({
          classId: assignment.classId,
          subject: assignment.subject,
          academicYear: assignment.academicYear,
          page: '1',
          limit: '200',
        });
        return academicPages<LmsModuleItem>(
          pp(`/lms/modules?${query.toString()}`),
          token,
        );
      }),
    ),
  ]);

  const ownSchedulesRes = ownSchedulesRead.status === 'success' ? ownSchedulesRead.data : null;
  const ownRppRes = ownRppRead.status === 'success' ? ownRppRead.data : null;
  const ownSchedules = ownSchedulesRes?.data ?? [];
  const ownGrades = gradeResponses.flatMap((response) => response.status === 'success' ? response.data.data : []);
  const ownAttendances = attendanceResponses.flatMap((response) => response.status === 'success' ? response.data.data : []);
  const ownActivities = activityResponses
    .flatMap((response) => response.status === 'success' ? response.data.data : [])
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
    (assessment) => assessment.teacherId === ownTeacherId && assessment.academicYear === academicYear && assessment.semester === semester,
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

  const ownThresholdResponses = await Promise.all(ownClassIds.map(classId => selectedPeriod ? apiFetchResult<unknown>(periodPath(`/analytics/cp-progress?classId=${encodeURIComponent(classId)}`, selectedPeriod)!, token) : Promise.resolve({ status: 'unavailable' as const, message: 'Periode belum tersedia.' })));
  const ownThresholdRows = ownThresholdResponses.map(response => response.status === 'success' ? readTeacherThresholds(response.data) : null);
  const ownThresholds = ownThresholdRows.some(rows => rows === null) ? null : mergeTeacherThresholds(ownThresholdRows.filter(rows => rows !== null));
  const ownReadState = (responses: ApiFetchResult<unknown>[]): SummaryReadState => !ownAssignmentsRes || !selectedPeriod ? 'unavailable' : responses.some(response => response.status === 'forbidden') ? 'denied' : responses.some(response => response.status !== 'success') ? 'unavailable' : 'ready';

  const teachingWorkspace = (
    <AkademikWorkspace
      grades={ownGrades}
      attendances={ownAttendances}
      classes={ownClasses}
      assignments={ownAssignments}
      schedules={ownSchedules}
      scheduleAvailable={!!ownSchedulesRes}
      summaryAvailability={{ grades: ownReadState(gradeResponses), attendance: ownReadState(attendanceResponses), journal: ownReadState(activityResponses), rpp: summaryState(ownRppRead), assessments: ownAssessmentRes.state === 'ready' && (!ownAssignmentsRes || lmsResponses.some(response => response === null)) ? 'unavailable' : ownAssessmentRes.state, kktp: ownReadState(ownThresholdResponses) !== 'ready' ? ownReadState(ownThresholdResponses) : ownThresholds ? 'ready' : 'unavailable', today: todayPeriodState === 'ready' ? summaryState(ownSchedulesRead) : todayPeriodState }}
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
      teachingWorkspace={teachingWorkspace}
      operationsWorkspace={operationsWorkspace}
    />
  );
}
