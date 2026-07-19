import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles, getActiveViewAs } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch, PaginatedResponse, GradeItem, AttendanceItem } from '@/lib/api';
import type { SiswaBadge, SiswaXP, SiswaLeaderboardEntry, SiswaModul } from './_components/siswa/siswa-types';
import { scheduleDayOfWeek, currentJp, jpStartLabel, wibNow } from '@/lib/bell-times';
import AkademikClient from './_components/AkademikClient';
import AkademikWorkspace from './_components/AkademikWorkspace';
import SiswaWorkspace from './_components/siswa/SiswaWorkspace';
import SiswaRefreshWrapper from './_components/siswa/SiswaRefreshWrapper';
import OrtuWorkspace from './_components/ortu/OrtuWorkspace';
import OrtuRefreshWrapper from './_components/ortu/OrtuRefreshWrapper';
import KsWorkspace from './_components/KsWorkspace';
import type { ScheduleItem, ActivityItem, RppItem, TodayClass, LmsModuleItem } from './_components/guru-types';
import {
  normalizeAssignmentGroups,
  normalizeSppGroups,
  type SppDashboardGroup,
  type StudentDashboardAssignmentGroup,
} from './_components/ortu/ortu-mappers';

interface Assignment { id: string; subject: string; class: { id: string; name: string } }
interface ClassItem { id: string; name: string; }
export interface SubjectItem { id: string; code: string; name: string; isActive: boolean; }

interface ActiveSemester { number: number; academicYear: { code: string } }

function monthBounds(year: number, monthIndex0: number): { dateFrom: string; dateTo: string } {
  const month = String(monthIndex0 + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  return {
    dateFrom: `${year}-${month}-01`,
    dateTo: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export default async function AkademikPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const token = session?.accessToken ?? '';
  const roles: string[] = await getEffectiveRoles(session);
  const viewAs = await getActiveViewAs(session);

  if (roles.includes('INDUSTRI')) redirect('/dashboard');
  const isGuru = roles.includes('GURU');
  const isSiswa = roles.includes('SISWA') && !roles.includes('GURU') && !roles.includes('KEPALA_SEKOLAH');
  const isOrtu = roles.includes('ORANG_TUA') && !roles.includes('GURU') && !roles.includes('KEPALA_SEKOLAH');
  const isKs = roles.includes('KEPALA_SEKOLAH') && !roles.includes('GURU');
  const canManage = roles.includes('SUPER_ADMIN') || roles.includes('GURU');
  const canEditAssignment = roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA');

  const [gradesData, attendanceData, classesRes, assignmentsRes, subjectsRes, fallbackSemRes] = await Promise.all([
    apiFetch<PaginatedResponse<GradeItem>>('/grades?limit=200', token),
    apiFetch<PaginatedResponse<AttendanceItem>>('/attendance?limit=200', token),
    apiFetch<{ data: ClassItem[] }>('/classes?limit=50', token),
    apiFetch<{ data: Assignment[]; total: number }>('/teaching-assignments?limit=100', token),
    apiFetch<{ data: SubjectItem[] }>('/subjects?limit=200', token),
    apiFetch<ActiveSemester>('/school/semesters/active', token),
  ]);

  // JANGAN blokir dashboard. apiFetch null = gagal-muat (bukan kosong). Bila ada
  // sumber inti yang gagal → tampilkan peringatan NON-BLOK di workspace; guru tetap
  // bisa memakai tab lain. (Hindari menutup seluruh halaman seperti regresi LoadError.)
  const dataWarning = gradesData === null || attendanceData === null
    || classesRes === null || assignmentsRes === null || subjectsRes === null;

  // ── Dashboard Siswa (W2 — mobile-first, 7 bottom-nav tabs). ──────────────
  if (isSiswa) {
    // Fetch siswa-specific data
    // Note: studentId lookup from keycloakId — backend should resolve this
    const studentId = session.keycloakId ?? '';
    const now = new Date();
    const attendanceMonth = monthBounds(now.getFullYear(), now.getMonth());
    const [gradesRes, attendanceRes, scheduleRes, announcementsRes, badgesRes, xpRes, leaderboardRes, assignmentsRes, modulesRes, cpRes, attStatsRes] = await Promise.all([
      apiFetch<PaginatedResponse<GradeItem>>(`/grades?studentId=${studentId}&limit=100`, token),
      apiFetch<PaginatedResponse<AttendanceItem>>(
        `/attendance?dateFrom=${attendanceMonth.dateFrom}&dateTo=${attendanceMonth.dateTo}&limit=200`,
        token,
      ),
      apiFetch<{ data: ScheduleItem[] }>(`/schedules?studentId=${studentId}&limit=100`, token),
      apiFetch<{ data: { id: string; title: string; createdAt: string }[] }>('/announcements?limit=5', token),
      // Wave 3 API integration (P19) — fail-soft, empty if null
      apiFetch<Array<{ id: string; awardedAt: string; badge: { id: string; code: string; name: string; description: string; icon: string; tier: string } }>>('/badges/my', token),
      apiFetch<{ id: string; studentId: string; totalXp: number; level: number; streakDays: number; nextLevelXp: number | null; xpToNextLevel: number | null }>('/gamification/my-xp', token),
      apiFetch<Array<{ id: string; studentId: string; totalXp: number; level: number; rank: number; student: { nis: string; user: { fullName: string }; class: { id: string; name: string } | null } }>>('/gamification/leaderboard-xp?limit=10', token),
      // P26: Wire pure SIM data sources to real APIs
      apiFetch<{ data: Assignment[] }>('/student-dashboard/assignments?limit=20', token),
      apiFetch<{ data: LmsModuleItem[] }>('/lms/modules/my-learning?limit=50', token),
      apiFetch<{ data: unknown[] }>('/student-dashboard/cp', token),
      apiFetch<{ hadir: number; izin: number; sakit: number; alpha: number; total: number }>('/analytics/attendance/stats', token),
    ]);

    // Transform badges API response → SiswaBadge[]
    const TIER_COLORS: Record<string, string> = { BRONZE: '#cd7f32', SILVER: '#c0c0c0', GOLD: '#ffd700', PLATINUM: '#e5e4e2' };
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
      ? { level: xpRes.level, current: xpRes.totalXp, next: xpRes.nextLevelXp ?? xpRes.totalXp, streakDays: xpRes.streakDays }
      : null;

    // Transform attendance stats → add pct (P26)
    const realAttStats = attStatsRes
      ? { ...attStatsRes, pct: attStatsRes.total > 0 ? Math.round((attStatsRes.hadir / attStatsRes.total) * 100) : 0 }
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

    return (
      <SiswaRefreshWrapper>
        <SiswaWorkspace
          grades={gradesRes?.data ?? []}
          attendance={attendanceRes?.data ?? []}
          schedule={scheduleRes?.data ?? []}
          announcements={announcementsRes?.data ?? []}
          realBadges={realBadges}
          realXp={realXp}
          realLeaderboard={realLeaderboard}
          realAssignments={assignmentsRes?.data ?? null}
          realModules={realModules}
          realCp={cpRes?.data ?? null}
          realAttStats={realAttStats}
          viewAs={viewAs}
        />
      </SiswaRefreshWrapper>
    );
  }

  // ── Dashboard Guru (IA baru). Role lain → tampilan lama (fallback). ─────────
  if (isGuru) {
    const [schedulesRes, activitiesRes, rppRes, lmsRes, semRes, assessmentRes] = await Promise.all([
      apiFetch<{ data: ScheduleItem[] }>('/schedules?limit=500', token),
      apiFetch<{ data: ActivityItem[] }>('/class-activities?limit=200', token),
      apiFetch<{ data: RppItem[] }>('/rpp?limit=100', token),
      apiFetch<{ data: LmsModuleItem[] }>('/lms/modules?limit=200', token),
      apiFetch<ActiveSemester>('/school/semesters/active', token),
      // R-13: Fetch assessment sessions for guru to wire hasPenilaian/hasFeedback
      apiFetch<{ data: Array<{ id: string; classId: string | null; status: string; _count: { responses: number } }> }>('/assessment/sessions?limit=100', token),
    ]);

    const schedules = schedulesRes?.data ?? [];
    const { minutes } = wibNow();
    const dow = scheduleDayOfWeek();
    const nowJp = currentJp(minutes);

    // R-13: Build a map of classId → latest assessment session for penilaian/feedback status.
    // A session with status 'active' or 'completed' and responses > 0 means penilaian is available.
    const assessmentSessions = assessmentRes?.data ?? [];
    const sessionByClass = new Map<string, { id: string; status: string; hasResponses: boolean }>();
    for (const s of assessmentSessions) {
      if (s.classId) {
        const existing = sessionByClass.get(s.classId);
        // Prefer completed sessions with responses, then active, then draft
        if (!existing || s.status === 'completed' || (s.status === 'active' && existing.status === 'draft')) {
          sessionByClass.set(s.classId, { id: s.id, status: s.status, hasResponses: s._count?.responses > 0 });
        }
      }
    }

    const todayClasses: TodayClass[] = schedules
      .filter((s) => s.dayOfWeek === dow)
      .sort((a, b) => a.jpStart - b.jpStart)
      .map((s) => ({
        classId: s.classId,
        className: s.class?.name ?? '—',
        subject: s.teachingAssignment?.subject ?? '—',
        room: s.room ?? null,
        jpStart: s.jpStart,
        jpEnd: s.jpEnd,
        startLabel: jpStartLabel(s.jpStart),
        isNow: nowJp >= s.jpStart && nowJp <= s.jpEnd,
        // R-13: Link assessment session if exists for this class
        assessmentSessionId: sessionByClass.get(s.classId)?.id,
      }));

    const academicYear = semRes?.academicYear?.code ?? '';
    const semester = semRes?.number ?? 1;

    return (
      <AkademikWorkspace
        grades={gradesData?.data ?? []}
        attendances={attendanceData?.data ?? []}
        classes={classesRes?.data ?? []}
        assignments={assignmentsRes?.data ?? []}
        schedules={schedules}
        activities={activitiesRes?.data ?? []}
        rpp={rppRes?.data ?? []}
        lmsModules={lmsRes?.data ?? []}
        todayClasses={todayClasses}
        academicYear={academicYear}
        semester={semester}
        dataWarning={dataWarning}
      />
    );
  }

  // ── Dashboard KS / Waka Kurikulum (F4 — desktop-first, 7-screen workspace). ─
  if (isKs) {
    const [schedulesRes, activitiesRes, rppRes, lmsRes, semRes, assessmentRes] = await Promise.all([
      apiFetch<{ data: ScheduleItem[] }>('/schedules?limit=500', token),
      apiFetch<{ data: ActivityItem[] }>('/class-activities?limit=200', token),
      apiFetch<{ data: RppItem[] }>('/rpp?limit=100', token),
      apiFetch<{ data: LmsModuleItem[] }>('/lms/modules?limit=200', token),
      apiFetch<ActiveSemester>('/school/semesters/active', token),
      // P29: Wire sumatif audit from real assessment sessions API
      apiFetch<{ data: unknown[] }>('/assessment/sessions?limit=20', token),
    ]);

    const academicYear = semRes?.academicYear?.code ?? '';
    const semester = semRes?.number ?? 1;

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
        realSumatif={assessmentRes?.data ?? undefined}
        subjects={subjectsRes?.data ?? []}
        academicYear={academicYear}
        semester={semester}
        dataWarning={dataWarning}
      />
    );
  }

  // ── Dashboard Orang Tua (P25 — wired to real APIs, mobile-first, 5 tabs). ────
  if (isOrtu) {
    // Round 1: fetch announcements + children list
    const [announcementsRes, childrenRes] = await Promise.all([
      apiFetch<{ data: { id: string; title: string; createdAt: string }[] }>('/announcements?limit=5', token),
      apiFetch<{ data: Array<{ id: string; nis: string; user: { fullName: string }; class: { id: string; name: string } | null; parentId: string }> }>('/students/my-children', token),
    ]);

    const children = childrenRes?.data ?? [];
    const childIds = children.map((child) => child.id);
    type OrtuBadgeApiItem = { id: string; awardedAt: string; badge: { id: string; code: string; name: string; description: string; icon: string; tier: string } };
    type LeaderboardEntry = { id: string; studentId: string; totalXp: number; level: number; rank: number; student: { nis: string; user: { fullName: string }; class: { id: string; name: string } | null } };
    const tagWithStudentId = <T extends object>(items: T[] | undefined, studentId: string): Array<T & { studentId: string }> =>
      (items ?? []).map((item) => ({ ...item, studentId }));

    // Round 2: fetch child-specific data (all in parallel, fail-soft → null)
    const childDataPromise = Promise.all(childIds.map(async (studentId) => {
      const [gradesRes, attendanceRes, scheduleRes, badgesRes, waLogRes] = await Promise.all([
        apiFetch<PaginatedResponse<GradeItem>>(`/grades?studentId=${studentId}&limit=100`, token),
        apiFetch<PaginatedResponse<AttendanceItem>>(`/attendance?studentId=${studentId}&limit=200`, token),
        apiFetch<{ data: ScheduleItem[] }>(`/schedules?studentId=${studentId}&limit=100`, token),
        apiFetch<OrtuBadgeApiItem[]>(`/badges/student/${studentId}`, token),
        apiFetch<{ data: Array<{ id: string; studentId: string; recipient: string; message: string; eventType: string; createdAt: string }> }>(`/wa-log/student/${studentId}?limit=20`, token),
      ]);
      return {
        grades: tagWithStudentId(gradesRes?.data, studentId),
        attendance: tagWithStudentId(attendanceRes?.data, studentId),
        schedule: tagWithStudentId(scheduleRes?.data, studentId),
        badges: tagWithStudentId(badgesRes ?? [], studentId),
        waLog: tagWithStudentId(waLogRes?.data, studentId),
      };
    }));

    const [childData, sppRes, assignmentsDashboardRes, semRes, leaderboardRes] = await Promise.all([
      childDataPromise,
      childIds.length ? apiFetch<{ data: SppDashboardGroup[] }>('/student-dashboard/spp', token) : Promise.resolve(null),
      childIds.length ? apiFetch<{ data: StudentDashboardAssignmentGroup[] }>('/student-dashboard/assignments', token) : Promise.resolve(null),
      apiFetch<ActiveSemester>('/school/semesters/active', token),
      childIds.length ? apiFetch<LeaderboardEntry[]>('/gamification/leaderboard-xp?limit=50', token) : Promise.resolve(null),
    ]);

    // R-16: Compute semester label for RaporModal
    const academicYearOrtu = semRes?.academicYear?.code ?? '';
    const semesterOrtu = semRes?.number ?? 1;
    const semesterLabel = semRes ? `Rapor Semester ${semesterOrtu === 1 ? 'Ganjil' : 'Genap'} ${academicYearOrtu}` : '';

    const childRanks = Object.fromEntries(
      childIds.map((studentId) => [
        studentId,
        leaderboardRes?.find((entry) => entry.studentId === studentId)?.rank ?? null,
      ]),
    );
    const gradesDataOrtu = childData.flatMap((item) => item.grades);
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
      avg: 0, att: 0, wali: '—',
    }));

    return (
      <OrtuRefreshWrapper>
        <OrtuWorkspace
          children={ortuChildren}
          grades={gradesDataOrtu}
          attendance={attendanceDataOrtu}
          schedule={scheduleDataOrtu}
          announcements={announcementsRes?.data ?? []}
          spp={sppDataOrtu}
          assignments={assignmentsDataOrtu}
          badges={badgesDataOrtu}
          waLog={waLogDataOrtu}
          viewAs={viewAs}
          semesterLabel={semesterLabel}
          childRanks={childRanks}
        />
      </OrtuRefreshWrapper>
    );
  }

  return (
    <AkademikClient
      grades={gradesData?.data ?? []}
      attendances={attendanceData?.data ?? []}
      classes={classesRes?.data ?? []}
      assignments={assignmentsRes?.data ?? []}
      subjects={subjectsRes?.data ?? []}
      canManage={canManage}
      canEditAssignment={canEditAssignment}
      academicYear={fallbackSemRes?.academicYear?.code}
    />
  );
}
