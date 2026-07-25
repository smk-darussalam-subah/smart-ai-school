import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ROLLBACK_PROOF = 'APPOINTMENT_WAVE_B_ROLLBACK_PROOF';
const ELIGIBLE_EMPLOYEE_ROLES_SQL = Prisma.sql`('TATA_USAHA','GURU')`;
const STABLE_IDENTITY_ROLES_SQL = Prisma.sql`('SUPER_ADMIN','TATA_USAHA','GURU','SISWA','ORANG_TUA','INDUSTRI')`;

type Mode = 'pre' | 'post';

type CountRow = {
  status: string;
  count: bigint;
};

type IndexFixture = {
  staff1Id: string;
  staff2Id: string;
  positionId: string;
  academicYearId: string;
  majorId: string | null;
};

type DualMajorFixture = Omit<IndexFixture, 'majorId'> & {
  major1Id: string;
  major2Id: string;
};

async function main() {
  const mode = readMode();
  const proveIndexes = process.argv.includes('--prove-indexes');
  const proveRollback = process.argv.includes('--prove-rollback');
  const hasAppointments = await tableExists('school', 'appointments');
  const hasReviews = await tableExists('school', 'appointment_migration_reviews');

  const report: Record<string, unknown> = {
    mode,
    generatedAt: new Date().toISOString(),
    piiPolicy: 'Counts only. No names, emails, phones, NIY, Keycloak IDs, or raw UUIDs are printed.',
    counts: await baseCounts(mode, hasAppointments, hasReviews),
  };

  if (mode === 'post') {
    report.postReconciliation = await postReconciliation(hasAppointments, hasReviews);
  }

  if (proveIndexes) {
    if (!hasAppointments) {
      report.indexProof = { status: 'SKIPPED', reason: 'appointment table belum ada; apply migration pada DB copy dulu' };
    } else {
      report.indexProof = await provePartialUniqueIndexes();
    }
  }

  if (proveRollback) {
    report.rollbackProof = hasAppointments
      ? await proveRollbackRehearsal()
      : { status: 'SKIPPED', reason: 'appointment table belum ada; rollback rehearsal dijalankan setelah migration pada DB copy' };
  }

  console.log(JSON.stringify(report, null, 2));
}

function readMode(): Mode {
  const index = process.argv.indexOf('--mode');
  if (index === -1) return 'pre';
  const raw = process.argv[index + 1];
  if (raw === 'pre' || raw === 'post') return raw;
  throw new Error('Gunakan --mode pre atau --mode post.');
}

async function baseCounts(mode: Mode, hasAppointments: boolean, hasReviews: boolean) {
  const [staffPositions, classifications, historicalPositionUsers] = await Promise.all([
    countSql(Prisma.sql`SELECT COUNT(*) AS count FROM "school"."staff_positions"`),
    classificationCounts(),
    countSql(Prisma.sql`
      SELECT COUNT(*) AS count
      FROM "auth"."users"
      WHERE "role"::text NOT IN ${STABLE_IDENTITY_ROLES_SQL}
        AND "deleted_at" IS NULL
    `),
  ]);

  return {
    mode,
    legacyStaffPositions: staffPositions,
    appointments: hasAppointments
      ? await countSql(Prisma.sql`SELECT COUNT(*) AS count FROM "school"."appointments"`)
      : null,
    migrationReviews: hasReviews
      ? await countSql(Prisma.sql`SELECT COUNT(*) AS count FROM "school"."appointment_migration_reviews"`)
      : null,
    historicalPositionIdentityUsers: historicalPositionUsers,
    classification: Object.fromEntries(classifications.map((row) => [row.status, Number(row.count)])),
  };
}

async function postReconciliation(hasAppointments: boolean, hasReviews: boolean) {
  if (!hasAppointments || !hasReviews) {
    return { status: 'SKIPPED', reason: 'appointment atau migration review table belum tersedia' };
  }

  const [legacyStaffPositions, migratedAppointments, reviewRows, reviewByStatus] = await Promise.all([
    countSql(Prisma.sql`SELECT COUNT(*) AS count FROM "school"."staff_positions"`),
    countSql(Prisma.sql`
      SELECT COUNT(*) AS count
      FROM "school"."appointments"
      WHERE "source_staff_position_id" IS NOT NULL
    `),
    countSql(Prisma.sql`
      SELECT COUNT(*) AS count
      FROM "school"."appointment_migration_reviews"
      WHERE "source_staff_position_id" IS NOT NULL
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT "status"::text, COUNT(*) AS "count"
      FROM "school"."appointment_migration_reviews"
      GROUP BY "status"
      ORDER BY "status"
    `),
  ]);

  return {
    legacyStaffPositions,
    migratedAppointments,
    sourceReviewRows: reviewRows,
    reviewByStatus: Object.fromEntries(reviewByStatus.map((row) => [row.status, Number(row.count)])),
    staffPositionRowsReviewed: reviewRows === legacyStaffPositions,
    migratedRowsHaveAppointments: migratedAppointments <= reviewRows,
  };
}

async function tableExists(schema: string, table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    SELECT to_regclass(${`${schema}.${table}`}) IS NOT NULL AS "exists"
  `);
  return rows[0]?.exists ?? false;
}

async function countSql(sql: Prisma.Sql): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(sql);
  return Number(rows[0]?.count ?? 0);
}

async function classificationCounts(): Promise<CountRow[]> {
  return prisma.$queryRaw<CountRow[]>(Prisma.sql`
    WITH source_rows AS (
      SELECT
        sp."id" AS "source_staff_position_id",
        sp."staff_id",
        st."user_id",
        u."role"::text AS "user_role",
        u."is_active" AS "user_is_active",
        st."deleted_at" AS "staff_deleted_at",
        u."deleted_at" AS "user_deleted_at",
        sp."position_id",
        p."scope_type"::text AS "position_scope_type",
        sp."academic_year_id",
        ay."is_active" AS "academic_year_is_active",
        ay."end_date" AS "academic_year_end_date",
        sp."major_id",
        sp."is_active",
        COALESCE(sp."start_date", ay."start_date") AS "effective_from",
        sp."end_date" AS "effective_until",
        CASE
          WHEN st."deleted_at" IS NOT NULL OR u."deleted_at" IS NOT NULL THEN 'QUARANTINED'
          WHEN u."is_active" = false THEN 'QUARANTINED'
          WHEN u."role"::text NOT IN ${ELIGIBLE_EMPLOYEE_ROLES_SQL} THEN 'QUARANTINED'
          WHEN p."scope_type"::text = 'MAJOR' AND sp."major_id" IS NULL THEN 'QUARANTINED'
          WHEN p."scope_type"::text <> 'MAJOR' AND sp."major_id" IS NOT NULL THEN 'QUARANTINED'
          WHEN COALESCE(sp."start_date", ay."start_date") > ay."end_date" THEN 'QUARANTINED'
          WHEN sp."end_date" IS NOT NULL AND sp."end_date" < COALESCE(sp."start_date", ay."start_date") THEN 'QUARANTINED'
          WHEN sp."end_date" IS NOT NULL AND sp."end_date" > ay."end_date" THEN 'QUARANTINED'
          ELSE 'CANDIDATE'
        END AS "base_status",
        CASE
          WHEN sp."is_active" = false OR (sp."end_date" IS NOT NULL AND sp."end_date" < CURRENT_DATE) THEN 'ENDED'
          WHEN ay."is_active" = true
            AND COALESCE(sp."start_date", ay."start_date") <= CURRENT_DATE
            AND (sp."end_date" IS NULL OR sp."end_date" >= CURRENT_DATE)
            THEN 'ACTIVE'
          ELSE 'APPROVED'
        END AS "appointment_status"
      FROM "school"."staff_positions" sp
      JOIN "school"."staff" st ON st."id" = sp."staff_id"
      JOIN "auth"."users" u ON u."id" = st."user_id"
      JOIN "school"."positions" p ON p."id" = sp."position_id"
      JOIN "school"."academic_years" ay ON ay."id" = sp."academic_year_id"
    ),
    scoped_rows AS (
      SELECT
        sr.*,
        COUNT(*) FILTER (
          WHERE sr."base_status" = 'CANDIDATE'
            AND sr."appointment_status" <> 'ENDED'
        ) OVER (
          PARTITION BY
            sr."position_id",
            sr."academic_year_id",
            COALESCE(sr."major_id", '00000000-0000-0000-0000-000000000000'::uuid)
        ) AS "live_scope_count"
      FROM source_rows sr
    ),
    classified AS (
      SELECT
        CASE
          WHEN "base_status" = 'QUARANTINED' THEN 'QUARANTINED'
          WHEN "appointment_status" <> 'ENDED' AND "live_scope_count" > 1 THEN 'QUARANTINED'
          ELSE 'MIGRATED'
        END AS "status"
      FROM scoped_rows
    )
    SELECT "status", COUNT(*) AS "count"
    FROM classified
    GROUP BY "status"
    ORDER BY "status"
  `);
}

async function provePartialUniqueIndexes() {
  const schoolFixture = await findSchoolPositionFixture();
  const sameMajorFixture = await findMajorPositionFixture();
  const dualMajorFixture = await findDualMajorFixture();

  return {
    schoolPositionActiveDuplicateRejected: schoolFixture
      ? await expectDuplicateActiveInsertToFail(schoolFixture)
      : { status: 'SKIPPED', reason: 'fixture dua staff + posisi school-scope kosong tidak tersedia' },
    kaprogSameMajorActiveDuplicateRejected: sameMajorFixture
      ? await expectDuplicateActiveInsertToFail(sameMajorFixture)
      : { status: 'SKIPPED', reason: 'fixture dua staff + KAPROG major kosong tidak tersedia' },
    kaprogDifferentMajorAccepted: dualMajorFixture
      ? await expectKaprogDifferentMajorAccepted(dualMajorFixture)
      : { status: 'SKIPPED', reason: 'fixture dua staff + dua jurusan aktif tidak tersedia' },
    approvedSuccessorWhileActiveAccepted: schoolFixture
      ? await expectApprovedSuccessorWithActiveAccepted(schoolFixture)
      : { status: 'SKIPPED', reason: 'fixture successor school-scope tidak tersedia' },
    openCandidateWithoutIncumbentDuplicateRejected: schoolFixture
      ? await expectDuplicateOpenCandidateToFail(schoolFixture)
      : { status: 'SKIPPED', reason: 'fixture kandidat school-scope tidak tersedia' },
  };
}

async function findSchoolPositionFixture(): Promise<IndexFixture | null> {
  const rows = await prisma.$queryRaw<IndexFixture[]>(Prisma.sql`
    WITH staff_rows AS (
      SELECT st."id", ROW_NUMBER() OVER (ORDER BY st."id") AS rn
      FROM "school"."staff" st
      JOIN "auth"."users" u ON u."id" = st."user_id"
      WHERE st."deleted_at" IS NULL
        AND u."deleted_at" IS NULL
        AND u."is_active" = true
        AND u."role"::text IN ${ELIGIBLE_EMPLOYEE_ROLES_SQL}
      LIMIT 2
    )
    SELECT
      s1."id" AS "staff1Id",
      s2."id" AS "staff2Id",
      p."id" AS "positionId",
      ay."id" AS "academicYearId",
      NULL::uuid AS "majorId"
    FROM staff_rows s1
    JOIN staff_rows s2 ON s2.rn = 2
    JOIN "school"."positions" p ON p."scope_type"::text = 'NONE'
    JOIN "school"."academic_years" ay ON ay."is_active" = true
    WHERE s1.rn = 1
      AND NOT EXISTS (
        SELECT 1 FROM "school"."appointments" a
        WHERE a."position_id" = p."id"
          AND a."academic_year_id" = ay."id"
          AND a."major_id" IS NULL
          AND a."status" = 'ACTIVE'
      )
    ORDER BY p."sort_order"
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function findMajorPositionFixture(): Promise<IndexFixture | null> {
  const rows = await prisma.$queryRaw<IndexFixture[]>(Prisma.sql`
    WITH staff_rows AS (
      SELECT st."id", ROW_NUMBER() OVER (ORDER BY st."id") AS rn
      FROM "school"."staff" st
      JOIN "auth"."users" u ON u."id" = st."user_id"
      WHERE st."deleted_at" IS NULL
        AND u."deleted_at" IS NULL
        AND u."is_active" = true
        AND u."role"::text IN ${ELIGIBLE_EMPLOYEE_ROLES_SQL}
      LIMIT 2
    )
    SELECT
      s1."id" AS "staff1Id",
      s2."id" AS "staff2Id",
      p."id" AS "positionId",
      ay."id" AS "academicYearId",
      m."id" AS "majorId"
    FROM staff_rows s1
    JOIN staff_rows s2 ON s2.rn = 2
    JOIN "school"."positions" p ON p."code" = 'KAPROG'
    JOIN "school"."majors" m ON m."is_active" = true
    JOIN "school"."academic_years" ay ON ay."is_active" = true
    WHERE s1.rn = 1
      AND NOT EXISTS (
        SELECT 1 FROM "school"."appointments" a
        WHERE a."position_id" = p."id"
          AND a."academic_year_id" = ay."id"
          AND a."major_id" = m."id"
          AND a."status" = 'ACTIVE'
      )
    ORDER BY m."code"
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function findDualMajorFixture(): Promise<DualMajorFixture | null> {
  const rows = await prisma.$queryRaw<DualMajorFixture[]>(Prisma.sql`
    WITH staff_rows AS (
      SELECT st."id", ROW_NUMBER() OVER (ORDER BY st."id") AS rn
      FROM "school"."staff" st
      JOIN "auth"."users" u ON u."id" = st."user_id"
      WHERE st."deleted_at" IS NULL
        AND u."deleted_at" IS NULL
        AND u."is_active" = true
        AND u."role"::text IN ${ELIGIBLE_EMPLOYEE_ROLES_SQL}
      LIMIT 2
    ),
    major_rows AS (
      SELECT m."id", ROW_NUMBER() OVER (ORDER BY m."code") AS rn
      FROM "school"."majors" m
      WHERE m."is_active" = true
      LIMIT 2
    )
    SELECT
      s1."id" AS "staff1Id",
      s2."id" AS "staff2Id",
      p."id" AS "positionId",
      ay."id" AS "academicYearId",
      m1."id" AS "major1Id",
      m2."id" AS "major2Id"
    FROM staff_rows s1
    JOIN staff_rows s2 ON s2.rn = 2
    JOIN major_rows m1 ON m1.rn = 1
    JOIN major_rows m2 ON m2.rn = 2
    JOIN "school"."positions" p ON p."code" = 'KAPROG'
    JOIN "school"."academic_years" ay ON ay."is_active" = true
    WHERE s1.rn = 1
      AND NOT EXISTS (
        SELECT 1 FROM "school"."appointments" a
        WHERE a."position_id" = p."id"
          AND a."academic_year_id" = ay."id"
          AND a."major_id" IN (m1."id", m2."id")
          AND a."status" = 'ACTIVE'
      )
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function expectDuplicateActiveInsertToFail(fixture: IndexFixture) {
  try {
    await prisma.$transaction(async (tx) => {
      await insertAppointment(tx, fixture, fixture.staff1Id, 'ACTIVE');
      await insertAppointment(tx, fixture, fixture.staff2Id, 'ACTIVE');
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 'PASS' };
    throw error;
  }

  return { status: 'FAIL', reason: 'duplicate ACTIVE appointment insert was accepted' };
}

async function expectKaprogDifferentMajorAccepted(fixture: DualMajorFixture) {
  try {
    await prisma.$transaction(async (tx) => {
      await insertAppointment(tx, { ...fixture, majorId: fixture.major1Id }, fixture.staff1Id, 'ACTIVE');
      await insertAppointment(tx, { ...fixture, majorId: fixture.major2Id }, fixture.staff2Id, 'ACTIVE');
      throw new Error(ROLLBACK_PROOF);
    });
  } catch (error) {
    if (isRollbackProof(error)) return { status: 'PASS' };
    throw error;
  }

  return { status: 'FAIL', reason: 'rollback proof did not execute' };
}

async function expectApprovedSuccessorWithActiveAccepted(fixture: IndexFixture) {
  try {
    await prisma.$transaction(async (tx) => {
      const active = await insertAppointment(tx, fixture, fixture.staff1Id, 'ACTIVE');
      await insertAppointment(tx, fixture, fixture.staff2Id, 'APPROVED', active.id);
      throw new Error(ROLLBACK_PROOF);
    });
  } catch (error) {
    if (isRollbackProof(error)) return { status: 'PASS' };
    throw error;
  }

  return { status: 'FAIL', reason: 'rollback proof did not execute' };
}

async function expectDuplicateOpenCandidateToFail(fixture: IndexFixture) {
  try {
    await prisma.$transaction(async (tx) => {
      await insertAppointment(tx, fixture, fixture.staff1Id, 'PENDING_APPROVAL');
      await insertAppointment(tx, fixture, fixture.staff2Id, 'PENDING_APPROVAL');
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 'PASS' };
    throw error;
  }

  return { status: 'FAIL', reason: 'duplicate open candidate without incumbent was accepted' };
}

async function proveRollbackRehearsal() {
  const before = await countSql(Prisma.sql`SELECT COUNT(*) AS count FROM "school"."appointments"`);
  const fixture = await findSchoolPositionFixture();
  if (!fixture) return { status: 'SKIPPED', reason: 'fixture rollback tidak tersedia' };

  try {
    await prisma.$transaction(async (tx) => {
      await insertAppointment(tx, fixture, fixture.staff1Id, 'APPROVED');
      throw new Error(ROLLBACK_PROOF);
    });
  } catch (error) {
    if (!isRollbackProof(error)) throw error;
  }

  const after = await countSql(Prisma.sql`SELECT COUNT(*) AS count FROM "school"."appointments"`);
  return { status: before === after ? 'PASS' : 'FAIL', before, after };
}

async function insertAppointment(
  tx: Prisma.TransactionClient,
  fixture: IndexFixture,
  staffId: string,
  status: 'ACTIVE' | 'APPROVED' | 'PENDING_APPROVAL',
  replacesAppointmentId: string | null = null,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "school"."appointments" (
      "staff_id", "position_id", "academic_year_id", "major_id",
      "kind", "status", "effective_from", "replaces_appointment_id",
      "source", "created_at", "updated_at"
    ) VALUES (
      ${staffId}::uuid,
      ${fixture.positionId}::uuid,
      ${fixture.academicYearId}::uuid,
      ${fixture.majorId}::uuid,
      'DEFINITIVE'::"school"."AppointmentKind",
      ${status}::"school"."AppointmentStatus",
      CURRENT_DATE,
      ${replacesAppointmentId}::uuid,
      'MANUAL'::"school"."AppointmentSource",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    RETURNING "id"::text
  `);
  return rows[0] ?? { id: '' };
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2002') return true;
  return error.code === 'P2010' && error.meta?.code === '23505';
}

function isRollbackProof(error: unknown): boolean {
  return error instanceof Error && error.message === ROLLBACK_PROOF;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
