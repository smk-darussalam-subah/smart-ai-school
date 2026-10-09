DO $$
BEGIN
 IF (SELECT count(*) FROM teacher.teacher_attendance) <> 3 THEN RAISE EXCEPTION 'Legacy rows were removed'; END IF;
 IF (SELECT count(*) FROM school.staff_attendance) <> 3 THEN RAISE EXCEPTION 'Import count invalid'; END IF;
 IF (SELECT count(*) FROM school.staff_attendance_events WHERE kind = 'LEGACY_IMPORT') <> 3 THEN RAISE EXCEPTION 'Import provenance missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM school.staff_attendance WHERE id = '77000000-0000-4000-8000-000000000003' AND location_in_status = 'UNVERIFIED' AND location_out_status = 'UNVERIFIED' AND distance_in_m IS NULL) THEN RAISE EXCEPTION 'Missing GPS misclassified'; END IF;
 IF NOT EXISTS (SELECT 1 FROM school.staff_attendance WHERE id = '77000000-0000-4000-8000-000000000004' AND location_in_status = 'INSIDE' AND lat_in = 0 AND lng_in = 0) THEN RAISE EXCEPTION 'Zero coordinate custody changed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM school.staff_attendance WHERE id = '77000000-0000-4000-8000-000000000005' AND location_in_status = 'OUTSIDE') THEN RAISE EXCEPTION 'Known outside geometry changed'; END IF;
 IF EXISTS (SELECT 1 FROM school.staff_attendance WHERE arrival_basis IS NOT NULL OR expected_arrival_at IS NOT NULL) THEN RAISE EXCEPTION 'Historical arrival time fabricated'; END IF;
 IF EXISTS (SELECT 1 FROM school.staff_attendance s JOIN teacher.teacher_attendance t ON s.legacy_teacher_attendance_id = t.id WHERE s.check_in_at <> t.check_in_at OR s.check_out_at IS DISTINCT FROM t.check_out_at OR s.date <> t.date OR s.notes IS DISTINCT FROM t.notes) THEN RAISE EXCEPTION 'Legacy time/date/notes changed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM teacher.teacher_attendance WHERE photo_url = '/legacy/proof.jpg') THEN RAISE EXCEPTION 'Legacy media custody changed'; END IF;
 IF (SELECT count(*) FROM school.position_permissions pp JOIN school.positions p ON p.id = pp.position_id JOIN auth.permissions perm ON perm.id = pp.permission_id WHERE p.code = 'KEPALA_SEKOLAH' AND perm.code IN ('staff.attendance.checkin', 'staff.attendance.read')) <> 2 THEN RAISE EXCEPTION 'Principal permission grant missing'; END IF;
END $$;
