import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'SHA-256 harus 64 karakter hex kecil');
const ExactIdListSchema = z
  .array(z.string().uuid())
  .max(500, 'Manifest melebihi batas 500 ID')
  .refine((ids) => new Set(ids).size === ids.length, 'Manifest memuat ID duplikat');

export const ClassReconciliationManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    target: z
      .object({
        databaseName: z.string().trim().min(1).max(63),
        schemaName: z.string().trim().min(1).max(63),
        targetSha256: Sha256Schema,
      })
      .strict(),
    studentIds: ExactIdListSchema,
    teacherIds: ExactIdListSchema,
    expectedStudentRelations: z.number().int().nonnegative(),
    expectedHomeroomRelations: z.number().int().nonnegative(),
  })
  .strict();

export type ClassReconciliationManifest = z.infer<typeof ClassReconciliationManifestSchema>;

export interface ReconciliationStudentRecord {
  id: string;
  classId: string | null;
  status: 'active' | 'inactive' | 'graduated' | 'dropped';
  deletedAt: Date | null;
  user: { isActive: boolean; deletedAt: Date | null };
}

export interface ReconciliationTeacherRecord {
  id: string;
  deletedAt: Date | null;
  user: { isActive: boolean; deletedAt: Date | null };
  walikelas: Array<{ id: string; isActive: boolean }>;
}

export interface ClassReconciliationPlan {
  mode: 'dry-run';
  studentRelationsToClear: string[];
  homeroomClassRelationsToClear: string[];
  operationalStudentsAffected: 0;
  notes: string[];
}

export interface DatabaseTargetIdentity {
  databaseName: string;
  schemaName: string;
  targetSha256: string;
}

export function sha256(input: Uint8Array | string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function parseClassReconciliationManifest(raw: string): ClassReconciliationManifest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Manifest rekonsiliasi bukan JSON lengkap yang valid');
  }

  const parsed = ClassReconciliationManifestSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Manifest rekonsiliasi tidak valid: ${details}`);
  }
  return parsed.data;
}

export function databaseTargetFromUrl(databaseUrl: string): DatabaseTargetIdentity {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL tidak valid');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL rekonsiliasi wajib memakai PostgreSQL');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const schemaName = url.searchParams.get('schema') || 'public';
  if (!databaseName || !schemaName) throw new Error('Target database atau schema tidak lengkap');

  const canonicalTarget = `${url.protocol}//${url.hostname.toLowerCase()}:${url.port || '5432'}/${encodeURIComponent(databaseName)}?schema=${encodeURIComponent(schemaName)}`;
  return { databaseName, schemaName, targetSha256: sha256(canonicalTarget) };
}

export function assertClassReconciliationBinding(input: {
  manifest: ClassReconciliationManifest;
  manifestSha256: string;
  expectedManifestSha256: string;
  configuredTarget: DatabaseTargetIdentity;
  expectedTargetSha256: string;
  observedDatabaseName: string;
  observedSchemaName: string;
}): void {
  const {
    manifest,
    manifestSha256,
    expectedManifestSha256,
    configuredTarget,
    expectedTargetSha256,
    observedDatabaseName,
    observedSchemaName,
  } = input;

  if (manifestSha256 !== expectedManifestSha256) {
    throw new Error('Digest manifest tidak cocok dengan digest yang disetujui');
  }
  if (
    configuredTarget.targetSha256 !== expectedTargetSha256 ||
    manifest.target.targetSha256 !== expectedTargetSha256
  ) {
    throw new Error('Digest target database tidak cocok dengan target yang disetujui');
  }
  if (
    manifest.target.databaseName !== configuredTarget.databaseName ||
    manifest.target.schemaName !== configuredTarget.schemaName ||
    observedDatabaseName !== configuredTarget.databaseName ||
    observedSchemaName !== configuredTarget.schemaName
  ) {
    throw new Error('Identitas database yang menjawab tidak cocok dengan manifest');
  }
}

function assertExactUniqueIds(label: string, expected: string[], actual: string[]): void {
  if (new Set(expected).size !== expected.length) {
    throw new Error(`${label} manifest memuat ID duplikat`);
  }
  const expectedSorted = [...expected].sort();
  const actualSorted = [...actual].sort();
  if (
    expectedSorted.length !== actualSorted.length ||
    expectedSorted.some((id, index) => id !== actualSorted[index])
  ) {
    throw new Error(`${label} database tidak cocok dengan manifest exact-ID`);
  }
}

export function buildClassReconciliationPlan(
  manifest: ClassReconciliationManifest,
  students: ReconciliationStudentRecord[],
  teachers: ReconciliationTeacherRecord[],
): ClassReconciliationPlan {
  if (manifest.schemaVersion !== 1) throw new Error('Versi manifest rekonsiliasi tidak didukung');
  assertExactUniqueIds(
    'Siswa',
    manifest.studentIds,
    students.map((student) => student.id),
  );
  assertExactUniqueIds(
    'Guru',
    manifest.teacherIds,
    teachers.map((teacher) => teacher.id),
  );

  const studentRelationsToClear = students
    .filter((student) => student.classId !== null)
    .map((student) => student.id)
    .sort();
  const homeroomClassRelationsToClear = teachers
    .flatMap((teacher) => teacher.walikelas.map((kelas) => kelas.id))
    .sort();

  if (studentRelationsToClear.length !== manifest.expectedStudentRelations) {
    throw new Error('Jumlah relasi siswa tidak cocok dengan manifest');
  }
  if (homeroomClassRelationsToClear.length !== manifest.expectedHomeroomRelations) {
    throw new Error('Jumlah relasi wali kelas tidak cocok dengan manifest');
  }

  const operationalStudent = students.find(
    (student) =>
      student.deletedAt === null &&
      student.status === 'active' &&
      student.user.isActive &&
      student.user.deletedAt === null,
  );
  if (operationalStudent) {
    throw new Error('Manifest memuat siswa operasional; dry-run dihentikan');
  }

  const operationalTeacher = teachers.find(
    (teacher) =>
      teacher.deletedAt === null && teacher.user.isActive && teacher.user.deletedAt === null,
  );
  if (operationalTeacher) {
    throw new Error('Manifest memuat guru operasional; dry-run dihentikan');
  }

  return {
    mode: 'dry-run',
    studentRelationsToClear,
    homeroomClassRelationsToClear,
    operationalStudentsAffected: 0,
    notes: [
      'Rencana ini tidak melakukan mutasi database.',
      'Relasi historis tetap memblokir hard-delete sampai rekonsiliasi terotorisasi dijalankan.',
    ],
  };
}
