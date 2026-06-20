import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch, PaginatedResponse, GradeItem, AttendanceItem } from '@/lib/api';
import { scheduleDayOfWeek, currentJp, jpStartLabel, wibNow } from '@/lib/bell-times';
import AkademikClient from './_components/AkademikClient';
import AkademikWorkspace from './_components/AkademikWorkspace';
import type { ScheduleItem, ActivityItem, RppItem, TodayClass, LmsModuleItem } from './_components/guru-types';

interface Assignment { id: string; subject: string; class: { name: string } }
interface ClassItem { id: string; name: string; }
export interface SubjectItem { id: string; code: string; name: string; isActive: boolean; }

interface ActiveSemester { number: number; academicYear: { code: string } }

export default async function AkademikPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const token = session?.accessToken ?? '';
  const roles: string[] = await getEffectiveRoles(session);

  if (roles.includes('INDUSTRI')) redirect('/dashboard');
  const isGuru = roles.includes('GURU');
  const canManage = roles.includes('SUPER_ADMIN') || roles.includes('GURU');
  const canEditAssignment = roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA');

  const [gradesData, attendanceData, classesRes, assignmentsRes, subjectsRes] = await Promise.all([
    apiFetch<PaginatedResponse<GradeItem>>('/grades?limit=200', token),
    apiFetch<PaginatedResponse<AttendanceItem>>('/attendance?limit=200', token),
    apiFetch<{ data: ClassItem[] }>('/classes?limit=50', token),
    apiFetch<{ data: Assignment[]; total: number }>('/teaching-assignments?limit=100', token),
    apiFetch<{ data: SubjectItem[] }>('/subjects?limit=200', token),
  ]);

  // ── Dashboard Guru (IA baru). Role lain → tampilan lama (fallback). ─────────
  if (isGuru) {
    const [schedulesRes, activitiesRes, rppRes, lmsRes, semRes] = await Promise.all([
      apiFetch<{ data: ScheduleItem[] }>('/schedules?limit=500', token),
      apiFetch<{ data: ActivityItem[] }>('/class-activities?limit=200', token),
      apiFetch<{ data: RppItem[] }>('/rpp?limit=100', token),
      apiFetch<{ data: LmsModuleItem[] }>('/lms/modules?limit=200', token),
      apiFetch<ActiveSemester>('/school/semesters/active', token),
    ]);

    const schedules = schedulesRes?.data ?? [];
    const { minutes } = wibNow();
    const dow = scheduleDayOfWeek();
    const nowJp = currentJp(minutes);

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
      />
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
    />
  );
}
