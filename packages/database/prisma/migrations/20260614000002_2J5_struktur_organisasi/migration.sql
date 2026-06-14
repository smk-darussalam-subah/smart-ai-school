-- 2J-5: Struktur Organisasi (jabatan) — additive DDL + seed katalog idempoten.
-- Jabatan terpisah dari role RBAC. Katalog + tautan izin di-seed otomatis (idempoten)
-- agar konsisten di staging & prod tanpa langkah manual.

-- ── 1. Enum ──────────────────────────────────────────────────────────────────
CREATE TYPE "school"."PositionCategory" AS ENUM ('STRUKTURAL', 'FUNGSIONAL', 'TENDIK');
CREATE TYPE "school"."PositionScopeType" AS ENUM ('NONE', 'MAJOR');

-- ── 2. Tabel positions (katalog jabatan, hierarki self-FK) ───────────────────
CREATE TABLE "school"."positions" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "code"       VARCHAR(50)  NOT NULL,
  "name"       VARCHAR(100) NOT NULL,
  "category"   "school"."PositionCategory" NOT NULL,
  "parent_id"  UUID,
  "scope_type" "school"."PositionScopeType" NOT NULL DEFAULT 'NONE',
  "is_active"  BOOLEAN      NOT NULL DEFAULT TRUE,
  "sort_order" INTEGER      NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "positions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "positions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "school"."positions"("id")
);
CREATE UNIQUE INDEX "positions_code_key" ON "school"."positions"("code");
CREATE INDEX "positions_parent_id_idx" ON "school"."positions"("parent_id");

-- ── 3. Tabel position_permissions (tautan izin jabatan) ──────────────────────
CREATE TABLE "school"."position_permissions" (
  "position_id"   UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  CONSTRAINT "position_permissions_pkey" PRIMARY KEY ("position_id", "permission_id"),
  CONSTRAINT "position_permissions_position_fk" FOREIGN KEY ("position_id") REFERENCES "school"."positions"("id") ON DELETE CASCADE
);

-- ── 4. Tabel staff_positions (penugasan terikat tahun ajaran) ────────────────
CREATE TABLE "school"."staff_positions" (
  "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
  "staff_id"         UUID         NOT NULL,
  "position_id"      UUID         NOT NULL,
  "academic_year_id" UUID         NOT NULL,
  "major_id"         UUID,
  "is_active"        BOOLEAN      NOT NULL DEFAULT TRUE,
  "start_date"       DATE,
  "end_date"         DATE,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_positions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_positions_staff_fk"    FOREIGN KEY ("staff_id")         REFERENCES "school"."staff"("id"),
  CONSTRAINT "staff_positions_position_fk" FOREIGN KEY ("position_id")      REFERENCES "school"."positions"("id"),
  CONSTRAINT "staff_positions_ay_fk"       FOREIGN KEY ("academic_year_id") REFERENCES "school"."academic_years"("id"),
  CONSTRAINT "staff_positions_major_fk"    FOREIGN KEY ("major_id")         REFERENCES "school"."majors"("id")
);
CREATE UNIQUE INDEX "staff_positions_unique" ON "school"."staff_positions"("staff_id", "position_id", "academic_year_id", "major_id");
CREATE INDEX "staff_positions_pos_ay_idx" ON "school"."staff_positions"("position_id", "academic_year_id");
CREATE INDEX "staff_positions_ay_idx" ON "school"."staff_positions"("academic_year_id");

-- ── 4b. Pastikan ada Tahun Ajaran aktif (penugasan jabatan terikat tahun ajaran) ─
INSERT INTO "school"."academic_years" ("code", "start_date", "end_date", "is_active", "updated_at")
VALUES ('2025/2026', DATE '2025-07-01', DATE '2026-06-30', TRUE, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- ── 5. Seed katalog jabatan (idempoten by code) ──────────────────────────────
INSERT INTO "school"."positions" ("code", "name", "category", "scope_type", "sort_order", "updated_at") VALUES
  ('KEPALA_SEKOLAH',   'Kepala Sekolah',            'STRUKTURAL', 'NONE',  10, CURRENT_TIMESTAMP),
  ('WAKA_KURIKULUM',   'Wakasek Kurikulum',         'STRUKTURAL', 'NONE',  20, CURRENT_TIMESTAMP),
  ('WAKA_KESISWAAN',   'Wakasek Kesiswaan',         'STRUKTURAL', 'NONE',  21, CURRENT_TIMESTAMP),
  ('WAKA_HUMAS',       'Wakasek Humas',             'STRUKTURAL', 'NONE',  22, CURRENT_TIMESTAMP),
  ('WAKA_SARPRAS',     'Wakasek Sarpras',           'STRUKTURAL', 'NONE',  23, CURRENT_TIMESTAMP),
  ('KEPALA_TU',        'Kepala Tata Usaha',         'STRUKTURAL', 'NONE',  30, CURRENT_TIMESTAMP),
  ('KAPROG',           'Kepala Program Keahlian',   'FUNGSIONAL', 'MAJOR', 40, CURRENT_TIMESTAMP),
  ('KOOR_BKK',         'Koordinator BKK',           'FUNGSIONAL', 'NONE',  50, CURRENT_TIMESTAMP),
  ('KOOR_HUBIN',       'Koordinator Hubin',         'FUNGSIONAL', 'NONE',  51, CURRENT_TIMESTAMP),
  ('GURU_BK',          'Guru Bimbingan Konseling',  'FUNGSIONAL', 'NONE',  52, CURRENT_TIMESTAMP),
  ('BENDAHARA',        'Bendahara',                 'TENDIK',     'NONE',  60, CURRENT_TIMESTAMP),
  ('STAF_KEPEGAWAIAN', 'Staf Kepegawaian',          'TENDIK',     'NONE',  61, CURRENT_TIMESTAMP),
  ('OPERATOR_DAPODIK', 'Operator Dapodik',          'TENDIK',     'NONE',  62, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Hierarki: set parent_id by code (idempoten).
UPDATE "school"."positions" c SET "parent_id" = p."id"
FROM "school"."positions" p
WHERE p."code" = 'WAKA_HUMAS'     AND c."code" IN ('KOOR_BKK', 'KOOR_HUBIN') AND c."parent_id" IS NULL;
UPDATE "school"."positions" c SET "parent_id" = p."id"
FROM "school"."positions" p
WHERE p."code" = 'WAKA_KESISWAAN' AND c."code" = 'GURU_BK' AND c."parent_id" IS NULL;
UPDATE "school"."positions" c SET "parent_id" = p."id"
FROM "school"."positions" p
WHERE p."code" = 'KEPALA_TU'      AND c."code" IN ('BENDAHARA', 'STAF_KEPEGAWAIAN', 'OPERATOR_DAPODIK') AND c."parent_id" IS NULL;

-- ── 6. Seed tautan izin (resolve permission id by code; skip yg tak ada) ─────
INSERT INTO "school"."position_permissions" ("position_id", "permission_id")
SELECT pos."id", perm."id"
FROM (VALUES
  ('KEPALA_SEKOLAH','report.read'), ('KEPALA_SEKOLAH','report.manage'), ('KEPALA_SEKOLAH','audit.read'),
  ('WAKA_KURIKULUM','academic.schedule.manage'), ('WAKA_KURIKULUM','academic.schedule.read'),
  ('WAKA_KURIKULUM','academic.teaching.manage'), ('WAKA_KURIKULUM','academic.teaching.read'),
  ('WAKA_KURIKULUM','academic.grade.read'), ('WAKA_KURIKULUM','report.read'),
  ('WAKA_KURIKULUM','report.manage'), ('WAKA_KURIKULUM','rpp.read'), ('WAKA_KURIKULUM','rpp.review'),
  ('WAKA_KESISWAAN','student.read'), ('WAKA_KESISWAAN','academic.attendance.read'),
  ('WAKA_KESISWAAN','activity.read'), ('WAKA_KESISWAAN','activity.manage'),
  ('WAKA_KESISWAAN','announcement.read'), ('WAKA_KESISWAAN','announcement.manage'),
  ('WAKA_HUMAS','announcement.manage'), ('WAKA_HUMAS','announcement.read'),
  ('WAKA_HUMAS','ppdb.read'), ('WAKA_HUMAS','ppdb.stats.read'),
  ('WAKA_SARPRAS','announcement.read'),
  ('KEPALA_TU','user.read'), ('KEPALA_TU','finance.read'), ('KEPALA_TU','student.read'), ('KEPALA_TU','ppdb.read'),
  ('KAPROG','academic.teaching.read'), ('KAPROG','academic.schedule.read'),
  ('KAPROG','student.read'), ('KAPROG','academic.grade.read'),
  ('KOOR_BKK','ppdb.read'), ('KOOR_BKK','ppdb.stats.read'), ('KOOR_BKK','announcement.read'),
  ('KOOR_HUBIN','ppdb.read'), ('KOOR_HUBIN','announcement.read'),
  ('GURU_BK','student.read'), ('GURU_BK','academic.attendance.read'),
  ('BENDAHARA','finance.read'), ('BENDAHARA','finance.create'), ('BENDAHARA','finance.update'), ('BENDAHARA','finance.approve'),
  ('STAF_KEPEGAWAIAN','user.read'), ('STAF_KEPEGAWAIAN','user.manage'),
  ('OPERATOR_DAPODIK','student.read'), ('OPERATOR_DAPODIK','user.read')
) AS m(pos_code, perm_code)
JOIN "school"."positions" pos ON pos."code" = m.pos_code
JOIN "auth"."permissions" perm ON perm."code" = m.perm_code
ON CONFLICT DO NOTHING;
