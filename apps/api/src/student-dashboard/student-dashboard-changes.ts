import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';

/** One metadata snapshot, never questions/answers/content or another student's data. */
export function learnerChangeQuery(studentId: string, classId: string | null) {
  return Prisma.sql`
    SELECT jsonb_build_object(
      'schoolDate', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD'),
      'identity', (SELECT jsonb_build_array(s.updated_at, s.class_id, u.role, u.is_active, u.consent_version)
        FROM student.students s JOIN auth.users u ON u.id = s.user_id WHERE s.id = ${studentId}::uuid),
      'overrides', (SELECT jsonb_agg(jsonb_build_array(o.permission_id, o.grant) ORDER BY o.permission_id)
        FROM auth.user_permission_overrides o JOIN student.students s ON s.user_id = o.user_id
        WHERE s.id = ${studentId}::uuid),
      'roleGrants', (SELECT jsonb_agg(r.permission_id ORDER BY r.permission_id)
        FROM auth.role_permissions r JOIN auth.users u ON u.role = r.role
        JOIN student.students s ON s.user_id = u.id WHERE s.id = ${studentId}::uuid),
      'grades', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.grades
        WHERE student_id = ${studentId}::uuid),
      'thresholds', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.kktp_configs),
      'class', (SELECT jsonb_build_array(id, updated_at) FROM academic.classes WHERE id = ${classId}::uuid),
      'jp', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.student_session_attendance
        WHERE student_id = ${studentId}::uuid),
      'schedule', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.schedules
        WHERE class_id = ${classId}::uuid),
      'assignments', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.teaching_assignments
        WHERE class_id = ${classId}::uuid),
      'modules', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.lms_modules
        WHERE status = 'published' AND (class_id = ${classId}::uuid OR class_id IS NULL)),
      'progress', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.lms_module_progress
        WHERE student_id = ${studentId}::uuid),
      'xp', (SELECT jsonb_build_array(total_xp, level, streak_days) FROM gamification.student_xp
        WHERE student_id = ${studentId}::uuid),
      'badges', (SELECT jsonb_agg(jsonb_build_array(b.id, b.updated_at, s.awarded_at) ORDER BY b.id)
        FROM academic.student_badges s JOIN academic.badges b ON b.id = s.badge_id
        WHERE s.student_id = ${studentId}::uuid),
      'sessions', (SELECT jsonb_build_array(count(*), max(a.updated_at)) FROM academic.assessment_sessions a
        WHERE a.class_id = ${classId}::uuid OR EXISTS (
          SELECT 1 FROM academic.remedial_participants r WHERE r.session_id = a.id
            AND r.student_id = ${studentId}::uuid AND r.status <> 'cancelled')),
      'remedial', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.remedial_participants
        WHERE student_id = ${studentId}::uuid),
      'results', (SELECT jsonb_agg(jsonb_build_array(id, submitted_at, score, late_reviewed_at) ORDER BY id)
        FROM academic.assessment_responses WHERE student_id = ${studentId}::uuid),
      'periods', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM school.semesters p),
      'years', (SELECT jsonb_agg(to_jsonb(y) ORDER BY y.id) FROM school.academic_years y),
      'bells', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM school.bell_schedule_profiles),
      'announcements', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM notification.announcements
        WHERE status = 'published' AND (audience @> '["ALL"]'::jsonb OR audience @> '["SISWA"]'::jsonb))
    ) AS snapshot
  `;
}

export function learnerRevision(studentId: string, snapshot: unknown): string {
  return createHash('sha256').update(studentId).update(JSON.stringify(snapshot)).digest('hex');
}
