import { Prisma } from '@prisma/client';

/** One authoritative relationship snapshot. No caller-supplied parent/child IDs. */
export function parentChangeQuery(keycloakId: string) {
  return Prisma.sql`
    WITH parent AS (
      SELECT id, role, is_active, consent_version
      FROM auth.users
      WHERE keycloak_id = ${keycloakId}::uuid
        AND role = 'ORANG_TUA' AND is_active = true AND deleted_at IS NULL
    ), children AS (
      SELECT s.id, s.user_id, s.class_id, s.updated_at, s.status, s.nis, u.full_name
      FROM student.students s JOIN auth.users u ON u.id = s.user_id
      WHERE s.parent_id IN (SELECT id FROM parent) AND s.deleted_at IS NULL
    ), authority AS (
      SELECT jsonb_build_object(
        'parent', (SELECT to_jsonb(p) FROM parent p),
        'children', (SELECT jsonb_agg(jsonb_build_array(id, class_id) ORDER BY id) FROM children),
        'overrides', (SELECT jsonb_agg(jsonb_build_array(permission_id, "grant", status,
          source, academic_year_id, staff_position_id) ORDER BY id)
          FROM auth.user_permission_overrides WHERE user_id IN (SELECT id FROM parent)),
        'grants', (SELECT jsonb_agg(permission_id ORDER BY permission_id)
          FROM auth.role_permissions WHERE role = 'ORANG_TUA')
      ) AS scope
    )
    SELECT (SELECT scope FROM authority) AS scope, jsonb_build_object(
      'authority', (SELECT scope FROM authority),
      'schoolDate', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD'),
      'children', (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM children c),
      'classes', (SELECT jsonb_agg(jsonb_build_array(id, updated_at, name) ORDER BY id)
        FROM academic.classes WHERE id IN (SELECT class_id FROM children)),
      'grades', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.grades
        WHERE student_id IN (SELECT id FROM children)),
      'thresholds', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.kktp_configs),
      'jp', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.student_session_attendance
        WHERE student_id IN (SELECT id FROM children)),
      'attendance', (SELECT md5(coalesce(string_agg(concat_ws('|', id, status, date,
        md5(coalesce(notes, ''))), ',' ORDER BY id), '')) FROM academic.attendance
        WHERE student_id IN (SELECT id FROM children)),
      'payments', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM finance.spp_payments
        WHERE student_id IN (SELECT id FROM children)),
      'schedule', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.schedules
        WHERE class_id IN (SELECT class_id FROM children)),
      'assignments', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.teaching_assignments
        WHERE class_id IN (SELECT class_id FROM children)),
      'modules', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.lms_modules
        WHERE EXISTS (SELECT 1 FROM children) AND status = 'published'
          AND (class_id IN (SELECT class_id FROM children) OR class_id IS NULL)),
      'progress', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.lms_module_progress
        WHERE student_id IN (SELECT id FROM children)),
      'xp', (SELECT jsonb_agg(jsonb_build_array(student_id, total_xp, level, streak_days) ORDER BY student_id)
        FROM gamification.student_xp WHERE student_id IN (SELECT id FROM children)),
      'badges', (SELECT jsonb_agg(jsonb_build_array(b.id, b.updated_at, s.student_id, s.awarded_at)
        ORDER BY b.id, s.student_id) FROM academic.student_badges s JOIN academic.badges b ON b.id = s.badge_id
        WHERE s.student_id IN (SELECT id FROM children)),
      'sessions', (SELECT jsonb_build_array(count(*), max(a.updated_at)) FROM academic.assessment_sessions a
        WHERE a.class_id IN (SELECT class_id FROM children) OR EXISTS (
          SELECT 1 FROM academic.remedial_participants r WHERE r.session_id = a.id
            AND r.student_id IN (SELECT id FROM children) AND r.status <> 'cancelled')),
      'remedial', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM academic.remedial_participants
        WHERE student_id IN (SELECT id FROM children)),
      'results', (SELECT jsonb_agg(jsonb_build_array(id, submitted_at, score, late_reviewed_at) ORDER BY id)
        FROM academic.assessment_responses WHERE student_id IN (SELECT id FROM children)),
      'messages', (SELECT md5(coalesce(string_agg(concat_ws('|', id, status, sent_at,
        delivered_at, read_at), ',' ORDER BY id), '')) FROM notification.wa_logs
        WHERE student_id IN (SELECT id FROM children)),
      'periods', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM school.semesters p),
      'years', (SELECT jsonb_agg(to_jsonb(y) ORDER BY y.id) FROM school.academic_years y),
      'bells', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM school.bell_schedule_profiles),
      'announcements', (SELECT jsonb_build_array(count(*), max(updated_at)) FROM notification.announcements
        WHERE status = 'published' AND (audience @> '["ALL"]'::jsonb OR audience @> '["ORANG_TUA"]'::jsonb))
    ) AS snapshot
    WHERE EXISTS (SELECT 1 FROM parent)
  `;
}
