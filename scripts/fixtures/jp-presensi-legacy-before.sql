-- Isolated synthetic fixture, inserted immediately before the new attendance migrations.
INSERT INTO auth.users (id, keycloak_id, email, full_name, role, updated_at)
VALUES ('77000000-0000-4000-8000-000000000001', '77000000-0000-4000-8000-000000000001',
 'legacy-proof@example.invalid', 'Synthetic legacy migration teacher', 'GURU', now());
INSERT INTO teacher.teachers (id, user_id, updated_at)
VALUES ('77000000-0000-4000-8000-000000000002', '77000000-0000-4000-8000-000000000001', now());
INSERT INTO teacher.teacher_attendance (id, teacher_id, date, check_in_at, check_out_at, distance_in_m, outside_geofence, lat_in, lng_in, photo_url, notes)
VALUES
 ('77000000-0000-4000-8000-000000000003', '77000000-0000-4000-8000-000000000002', '2026-10-01', '2026-10-01 00:30', '2026-10-01 08:00', NULL, true, NULL, NULL, '/legacy/proof.jpg', 'Synthetic missing GPS'),
 ('77000000-0000-4000-8000-000000000004', '77000000-0000-4000-8000-000000000002', '2026-10-02', '2026-10-02 00:30', NULL, 0, false, 0, 0, NULL, 'Synthetic zero coordinates'),
 ('77000000-0000-4000-8000-000000000005', '77000000-0000-4000-8000-000000000002', '2026-10-03', '2026-10-03 00:30', NULL, 812, true, 0.01, 0, NULL, 'Synthetic known outside geometry');
