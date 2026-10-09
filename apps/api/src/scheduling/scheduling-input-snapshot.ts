import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { z } from 'zod';
import { DateOnly } from './dto/scheduling-draft.dto';

const id = z.string().uuid();
const integer = z.number().int();
export const SchedulingSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  period: z.object({
    id, academicYearId: id, academicYear: z.string(), number: integer,
    startDate: DateOnly, endDate: DateOnly, closed: z.boolean(),
  }).nullable(),
  classes: z.array(z.object({ id, active: z.boolean() })),
  assignments: z.array(z.object({
    id, teacherId: id, classId: id, subject: z.string(),
    hoursPerWeek: integer, eligible: z.boolean(),
  })),
  groups: z.array(z.object({
    id, teacherId: id, mode: z.string(), approvedBy: z.string(),
    dayOfWeek: integer, jpStart: integer, jpEnd: integer, expiresOn: DateOnly.nullable(),
  })),
  baseline: z.array(z.object({
    id, assignmentId: id, classId: id, dayOfWeek: integer, jpStart: integer,
    jpEnd: integer, roomLabel: z.string().nullable(), concurrencyGroupId: id.nullable(),
  })),
  profiles: z.array(z.object({
    id, effectiveFrom: DateOnly, effectiveUntil: DateOnly.nullable(), timezone: z.string(),
    segments: z.array(z.object({
      dayOfWeek: integer, jpNumber: integer.nullable(), type: z.string(),
      startMinute: integer, endMinute: integer, sortOrder: integer,
    })),
  })),
  holidays: z.array(z.object({ startDate: DateOnly, endDate: DateOnly })),
});
export type SchedulingSnapshot = z.infer<typeof SchedulingSnapshotSchema>;
export interface DraftScope {
  academicYearId: string;
  semesterNumber: number;
  effectiveFrom: string;
  effectiveUntil: string;
  classIds: string[];
}

/** Stable keys and source ordering; no unstable timestamps or clock in the digest. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map((key) =>
      JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}';
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new TypeError('Unsupported canonical JSON value');
  return result;
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(canonicalJson(value)) as Prisma.InputJsonValue;
}

/** One MVCC statement captures all readiness inputs without fixing a stale write-authority snapshot. */
export async function captureSchedulingInput(tx: Prisma.TransactionClient, scope: DraftScope) {
  const from = scope.effectiveFrom;
  const until = scope.effectiveUntil;
  const rows = await tx.$queryRaw<{ snapshot: unknown }[]>(Prisma.sql`
    WITH selected AS (
      SELECT s.*, y.code FROM school.semesters s
      JOIN school.academic_years y ON y.id = s.academic_year_id
      WHERE s.academic_year_id = ${scope.academicYearId}::uuid AND s.number = ${scope.semesterNumber}
    )
    SELECT jsonb_build_object(
      'schemaVersion',1,
      'period',(SELECT jsonb_build_object(
        'id',s.id,'academicYearId',s.academic_year_id,'academicYear',s.code,'number',s.number,
        'startDate',s.start_date,'endDate',s.end_date,
        'closed',EXISTS(SELECT 1 FROM school.semester_closures cl WHERE cl.semester_id=s.id)
      ) FROM selected s),
      'classes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'active',c.is_active) ORDER BY c.id)
        FROM academic.classes c JOIN selected s ON c.academic_year=s.code
        WHERE c.id IN (${Prisma.join(scope.classIds.map((classId) => Prisma.sql`${classId}::uuid`))})), '[]'::jsonb),
      'assignments',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',a.id,'teacherId',a.teacher_id,'classId',a.class_id,'subject',a.subject,
        'hoursPerWeek',a.hours_per_week,
        'eligible',(t.deleted_at IS NULL AND u.deleted_at IS NULL AND u.is_active AND u.role='GURU' AND c.is_active)
      ) ORDER BY a.id) FROM academic.teaching_assignments a
        JOIN selected s ON a.academic_year=s.code JOIN teacher.teachers t ON t.id=a.teacher_id
        JOIN auth.users u ON u.id=t.user_id JOIN academic.classes c ON c.id=a.class_id), '[]'::jsonb),
      'groups',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',g.id,'teacherId',g.teacher_id,'mode',g.mode,'approvedBy',g.approved_by,
        'dayOfWeek',g.day_of_week,'jpStart',g.jp_start,'jpEnd',g.jp_end,'expiresOn',g.expires_on
      ) ORDER BY g.id) FROM academic.schedule_concurrency_groups g
        JOIN selected s ON g.academic_year=s.code AND g.semester=s.number), '[]'::jsonb),
      'baseline',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',b.id,'assignmentId',b.teaching_assignment_id,'classId',b.class_id,
        'dayOfWeek',b.day_of_week,'jpStart',b.jp_start,'jpEnd',b.jp_end,
        'roomLabel',b.room,'concurrencyGroupId',b.concurrency_group_id
      ) ORDER BY b.id) FROM academic.schedules b
        JOIN selected s ON b.academic_year=s.code AND b.semester=s.number), '[]'::jsonb),
      'profiles',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',p.id,'effectiveFrom',p.effective_from,'effectiveUntil',p.effective_until,'timezone',p.timezone,
        'segments',COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'dayOfWeek',bs.day_of_week,'jpNumber',bs.jp_number,'type',bs.type,
          'startMinute',bs.start_minute,'endMinute',bs.end_minute,'sortOrder',bs.sort_order
        ) ORDER BY bs.day_of_week,bs.sort_order,bs.id) FROM school.bell_schedule_segments bs WHERE bs.profile_id=p.id),'[]'::jsonb)
      ) ORDER BY p.id) FROM school.bell_schedule_profiles p
        WHERE p.scope='SCHOOL' AND p.revoked_at IS NULL AND p.effective_from <= ${until}::date
          AND (p.effective_until IS NULL OR p.effective_until >= ${from}::date)), '[]'::jsonb),
      'holidays',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'startDate',h.start_date,'endDate',h.end_date
      ) ORDER BY h.start_date,h.end_date,h.id) FROM school.academic_calendar h
        WHERE h.academic_year_id=${scope.academicYearId}::uuid AND h.type IN ('holiday','break')
          AND h.start_date <= ${until}::date AND h.end_date >= ${from}::date), '[]'::jsonb)
    ) AS snapshot
  `);
  return SchedulingSnapshotSchema.parse(rows[0]?.snapshot);
}
