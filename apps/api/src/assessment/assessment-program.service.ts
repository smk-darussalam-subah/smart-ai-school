import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { createHash } from 'node:crypto';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { assertFreshMutationAuthority } from '../common/helpers/identity-mutation-lock';
import { OPERATIONAL_TEACHER_WHERE } from '../common/helpers/operational-teacher';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ProgramDraft, ProgramKind, ProgramProfile } from './assessment-program-contract';
import { programAuthority, requireProgramStaff } from './assessment-program-authority';
import { assertSecureStudentQuestions, parseSnapshotQuestions } from './assessment-runtime';
import { AssessmentService } from './assessment.service';
import { effectiveExamClose } from './scheduled-exam-runtime';
import { examStaffWhere } from './exam-operations.service';

const activeStudent = {
  deletedAt: null, status: 'active',
  user: { isActive: true, deletedAt: null, role: 'SISWA' },
} satisfies Prisma.StudentWhereInput;
const kindSelect = { id: true, name: true, version: true, category: true, allowsGrade: true } satisfies Prisma.AssessmentKindSelect;
const packageSelect = { id: true, title: true, subject: true, version: true, sharedForPrograms: true } satisfies Prisma.ExamPackageSelect;
const programSelect = {
  id: true, ownerId: true, sessionId: true, kind: { select: kindSelect },
  package: { select: packageSelect },
  classes: { select: { class: { select: { id: true, name: true, grade: true } } }, orderBy: { class: { name: 'asc' } } },
  session: { select: { title: true, status: true, academicYear: true, semester: true,
    durationMinutes: true, gradeTarget: true, dueAt: true, examSchedule: { select: { publishedAt: true, closesAt: true } },
    scheduleRequest: { select: { revision: true } } } },
} satisfies Prisma.AssessmentProgramSelect;

async function lockProgramSession(tx: Prisma.TransactionClient, sessionId: string) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'assessment-session:' + sessionId}, 0))`);
}

@Injectable()
export class AssessmentProgramService {
  constructor(private readonly db: PrismaService, private readonly period: AcademicPeriodService,
    private readonly permissions: PermissionsService, private readonly assessments: AssessmentService) {}

  private async audit(tx: Prisma.TransactionClient, user: AuthUser, resourceId: string, action: string,
    metadata: Prisma.InputJsonObject) {
    await tx.auditLog.create({ data: {
      action, actorId: user.keycloakId, actorRoles: user.roles, resourceType: 'AssessmentProgram',
      resourceId, method: 'POST', path: '/assessment-programs', statusCode: 200, outcome: 'success', metadata,
    } });
  }

  async options(user: AuthUser) {
    const actor = await requireProgramStaff(this.db, user);
    const authority = await programAuthority(this.db, this.permissions, user, actor);
    const term = await this.db.semester.findFirst({ where: { isActive: true, academicYear: { isActive: true } },
      select: { number: true, academicYear: { select: { code: true } } } });
    const academicYear = term?.academicYear.code;
    const [kinds, packages, classes, counts, assignments] = await Promise.all([
      this.db.assessmentKind.findMany({ where: { active: true }, orderBy: { name: 'asc' }, take: 100, select: kindSelect }),
      this.db.examPackage.findMany({
        where: { teacher: OPERATIONAL_TEACHER_WHERE, OR: [{
          teacher: { userId: actor.id },
        }, { sharedForPrograms: true }] }, select: { ...packageSelect, teacher: { select: { userId: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100,
      }),
      academicYear ? this.db.class.findMany({ where: { isActive: true, academicYear },
        select: { id: true, name: true, grade: true }, orderBy: [{ grade: 'asc' }, { name: 'asc' }], take: 101 }) : [],
      academicYear ? this.db.student.groupBy({ by: ['classId'], where: { ...activeStudent,
        class: { is: { isActive: true, academicYear } } }, _count: { _all: true } }) : [],
      academicYear && actor.role === 'GURU' ? this.db.teachingAssignment.findMany({
        where: { academicYear, teacher: { userId: actor.id }, class: { academicYear, isActive: true } },
        select: { subject: true, classId: true },
      }) : [],
    ]);
    const headcounts = new Map(counts.map((row) => [row.classId, row._count._all]));
    return { academicYear: academicYear ?? null, semester: term?.number ?? null,
      kinds: kinds.filter((kind) => kind.category !== 'profile' || authority.counselor),
      packages: packages.map(({ teacher, ...pkg }) => ({ ...pkg, owned: teacher.userId === actor.id })),
      classes: classes.map((row) => ({ ...row, participants: headcounts.get(row.id) ?? 0 })),
      assignments, canDefineAcademicKind: authority.manager, canProfile: authority.counselor,
    };
  }

  async proctors(q: string, user: AuthUser) {
    await requireProgramStaff(this.db, user);
    return this.db.user.findMany({ where: { ...examStaffWhere, ...(q ? { fullName: { contains: q, mode: 'insensitive' } } : {}) },
      select: { id: true, fullName: true }, orderBy: [{ fullName: 'asc' }, { id: 'asc' }], take: 30 });
  }

  async list(user: AuthUser) {
    const actor = await requireProgramStaff(this.db, user);
    const { canReadSchool, counselor } = await programAuthority(this.db, this.permissions, user, actor);
    const rows = await this.db.assessmentProgram.findMany({ where: canReadSchool ? {} : { ownerId: actor.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 60, select: programSelect });
    return rows.map((row) => ({ ...row, owned: row.ownerId === actor.id,
      canProfile: row.kind.category === 'profile' && row.ownerId === actor.id && counselor }));
  }

  async createKind(input: ProgramKind, user: AuthUser) {
    const name = input.name.normalize('NFKC').replace(/\s+/g, ' ');
    const nameKey = name.toLocaleLowerCase('id-ID');
    if (name.length < 3 || name.length > 80 || nameKey.length > 100)
      throw new BadRequestException('Nama jenis asesmen harus 3–80 karakter.');
    return this.db.$transaction(async (tx) => {
      const actor = await requireProgramStaff(tx, user, true);
      if (input.allowsGrade && !(await programAuthority(tx, this.permissions, user, actor)).manager)
        throw new ForbiddenException('Hanya pengelola akademik dapat menetapkan jenis yang bisa masuk nilai akhir.');
      const created = await tx.assessmentKind.create({ data: { name, nameKey, createdById: actor.id, allowsGrade: input.allowsGrade },
        select: kindSelect }).catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException('Jenis asesmen dengan nama tersebut sudah ada.');
        throw error;
      });
      await this.audit(tx, user, created.id, 'assessment-kind.create', { name, allowsGrade: input.allowsGrade });
      return created;
    });
  }

  async sharePackage(id: string, shared: boolean, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await assertFreshMutationAuthority(tx, this.permissions, user.keycloakId, 'lms.own.manage', ['GURU']);
      const updated = await tx.examPackage.updateMany({ where: { id, teacher: {
        ...OPERATIONAL_TEACHER_WHERE, user: { ...OPERATIONAL_TEACHER_WHERE.user, keycloakId: user.keycloakId },
      } }, data: { sharedForPrograms: shared } });
      if (updated.count !== 1) throw new NotFoundException('Paket soal tidak tersedia.');
      await this.audit(tx, user, id, 'assessment-package.share', { shared });
      return { id, shared };
    });
  }

  async create(input: ProgramDraft, user: AuthUser) {
    const roster = input.roster.mode === 'classes' ? { mode: input.roster.mode, classIds: [...input.roster.classIds].sort() }
      : input.roster.mode === 'grades' ? { mode: input.roster.mode, grades: [...input.roster.grades].sort() } : input.roster;
    const fingerprint = createHash('sha256').update(JSON.stringify({ ...input, roster })).digest('hex');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'assessment-program:' + user.keycloakId + ':' + input.requestId}, 0))`);
      await this.period.assertWritablePeriodWithCutoverLock(tx, input);
      const actor = await requireProgramStaff(tx, user, true);
      const identity = { ownerId: actor.id, requestId: input.requestId };
      const existing = await tx.assessmentProgram.findUnique({ where: { ownerId_requestId: identity },
        select: { id: true, sessionId: true, requestFingerprint: true } });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) throw new ConflictException('Permintaan ini sudah dipakai untuk draf lain.');
        return { id: existing.id, sessionId: existing.sessionId };
      }
      const [kind, pkg, classes] = await Promise.all([
        tx.assessmentKind.findFirst({ where: { id: input.kindId, active: true }, select: kindSelect }),
        tx.examPackage.findFirst({ where: { id: input.packageId, teacher: OPERATIONAL_TEACHER_WHERE,
          OR: [{ teacher: { userId: actor.id } }, { sharedForPrograms: true }] },
        select: { id: true, teacherId: true, teacher: { select: { userId: true } }, subject: true, questions: true } }),
        tx.class.findMany({ where: { academicYear: input.academicYear, isActive: true,
          ...(roster.mode === 'classes' ? { id: { in: roster.classIds } } : {}),
          ...(roster.mode === 'grades' ? { grade: { in: roster.grades } } : {}),
        }, select: { id: true }, take: 101 }),
      ]);
      if (!kind || !pkg) throw new NotFoundException('Jenis atau paket soal tidak tersedia.');
      if (kind.category === 'profile' && !(await programAuthority(tx, this.permissions, user, actor)).counselor)
        throw new ForbiddenException('Asesmen Bakat dan Minat dikelola petugas yang berwenang.');
      if (!classes.length || classes.length > 100 || (roster.mode === 'classes' && classes.length !== roster.classIds.length))
        throw new BadRequestException('Pilih rombel aktif pada tahun ajaran tersebut.');
      const classIds = classes.map(({ id }) => id);
      const size = await tx.student.count({ where: { ...activeStudent, classId: { in: classIds } } });
      if (!size || size > 500) throw new BadRequestException('Pilih cakupan dengan 1–500 peserta berakun aktif.');
      const questions = parseSnapshotQuestions(pkg.questions);
      if (!questions.length) throw new BadRequestException('Paket memerlukan soal.');
      assertSecureStudentQuestions(questions);

      let assignments = new Map<string, string>();
      if (input.gradeTarget) {
        if (kind.category !== 'custom' || !kind.allowsGrade || actor.role !== 'GURU' || pkg.teacher.userId !== actor.id ||
            !await this.permissions.hasFreshPermission(user.keycloakId, 'lms.own.manage', tx))
          throw new ForbiddenException('Hanya guru pengampu yang dapat memilih nilai akhir pada jenis akademik yang diizinkan.');
        const rows = await tx.teachingAssignment.findMany({ where: { teacherId: pkg.teacherId, academicYear: input.academicYear,
          subject: pkg.subject, classId: { in: classIds } }, select: { id: true, classId: true } });
        if (rows.length !== classes.length) throw new ForbiddenException('Penugasan mapel wajib mencakup semua rombel terpilih.');
        assignments = new Map(rows.map(({ id, classId }) => [classId, id]));
      }
      const session = await tx.assessmentSession.create({ data: {
        title: input.title, teacherId: pkg.teacherId, schoolProgram: true, academicYear: input.academicYear, semester: input.semester,
        type: input.gradeTarget === 'uh' ? 'formatif' : input.gradeTarget ? 'sumatif' : 'diagnostik',
        gradeTarget: input.gradeTarget, durationMinutes: input.durationMinutes, randomizeOrder: input.randomizeOrder,
        questions: pkg.questions as Prisma.InputJsonValue,
      }, select: { id: true } });
      const program = await tx.assessmentProgram.create({ data: { ...identity, requestFingerprint: fingerprint,
        kindId: kind.id, packageId: pkg.id, sessionId: session.id, enumerationMode: roster.mode,
        classes: { createMany: { data: classIds.map((classId) => ({ classId, assignmentId: assignments.get(classId) })) } },
      }, select: { id: true, sessionId: true } });
      await this.audit(tx, user, program.id, 'assessment-program.create', {
        kindId: kind.id, kindVersion: kind.version, classCount: classes.length, participantCount: size, gradeTarget: input.gradeTarget,
      });
      return program;
    });
  }

  async complete(id: string, user: AuthUser) {
    const actor = await requireProgramStaff(this.db, user);
    const initial = await this.db.assessmentProgram.findFirst({ where: { id, ownerId: actor.id },
      select: { sessionId: true, session: { select: { gradeTarget: true } } } });
    if (!initial) throw new NotFoundException('Pengerjaan tidak tersedia untuk wewenang ini.');
    if (initial.session.gradeTarget) return this.assessments.completeSession(initial.sessionId, user);
    return this.db.$transaction(async (tx) => {
      await lockProgramSession(tx, initial.sessionId);
      const program = await tx.assessmentProgram.findUniqueOrThrow({ where: { id }, select: programSelect });
      await this.period.assertWritablePeriodWithCutoverLock(tx, program.session);
      if ((await requireProgramStaff(tx, user, true)).id !== program.ownerId)
        throw new ForbiddenException('Wewenang pemilik kegiatan tidak lagi berlaku.');
      if (program.session.status === 'completed') return { id, status: 'completed' };
      if (program.session.status !== 'active' || !program.session.examSchedule?.publishedAt ||
          effectiveExamClose(program.session.examSchedule.closesAt, program.session.dueAt) > new Date())
        throw new ConflictException('Selesaikan setelah jadwal ujian ditutup.');
      if (await tx.assessmentResponse.count({ where: { sessionId: initial.sessionId, startedAt: { not: null }, submittedAt: null } }))
        throw new ConflictException('Masih ada jawaban yang sedang difinalisasi.');
      await tx.assessmentSession.update({ where: { id: initial.sessionId },
        data: { status: 'completed', completedAt: new Date() } });
      await this.audit(tx, user, id, 'assessment-program.complete', { gradeTarget: null });
      return { id, status: 'completed' };
    });
  }

  async participants(id: string, user: AuthUser) {
    const actor = await requireProgramStaff(this.db, user);
    const program = await this.db.assessmentProgram.findFirst({ where: { id, ownerId: actor.id },
      select: { kind: { select: { category: true } }, session: { select: { id: true, status: true } } } });
    if (!program) throw new NotFoundException('Program tidak tersedia.');
    if (program.kind.category === 'profile' && !(await programAuthority(this.db, this.permissions, user, actor)).counselor)
      throw new ForbiddenException('Wewenang Bakat dan Minat tidak tersedia.');
    return this.db.assessmentResponse.findMany({ where: { sessionId: program.session.id,
      submittedAt: { not: null }, OR: [{ lateSubmissionStatus: null }, { lateSubmissionStatus: 'accepted' }] },
      select: { studentId: true, student: { select: { user: { select: { fullName: true } } } },
        ...(program.kind.category === 'profile' ? {} : { score: true }) },
      orderBy: { studentId: 'asc' }, take: 500 });
  }

  async ownProfiles(user: AuthUser) {
    return this.db.assessmentProgramProfile.findMany({
      where: { publishedAt: { not: null }, student: { ...activeStudent, user: { ...activeStudent.user,
        keycloakId: user.keycloakId } }, program: { session: { status: 'completed' } } },
      orderBy: { publishedAt: 'desc' }, take: 30,
      select: { programId: true, instrument: true, instrumentVersion: true, observations: true, summary: true, nextSteps: true,
        publishedAt: true, program: { select: { session: { select: { title: true } } } } },
    });
  }

  async readProfile(id: string, studentId: string, user: AuthUser) {
    const actor = await requireProgramStaff(this.db, user);
    if (!(await programAuthority(this.db, this.permissions, user, actor)).counselor)
      throw new ForbiddenException('Wewenang Bakat dan Minat tidak tersedia.');
    const program = await this.db.assessmentProgram.findFirst({
      where: { id, ownerId: actor.id, kind: { category: 'profile' }, session: { status: 'completed', responses: {
        some: { studentId, submittedAt: { not: null },
          OR: [{ lateSubmissionStatus: null }, { lateSubmissionStatus: 'accepted' }] },
      } } },
      select: { profiles: { where: { studentId }, select: { instrument: true, instrumentVersion: true,
        observations: true, summary: true, nextSteps: true, publishedAt: true } } },
    });
    if (!program) throw new NotFoundException('Hasil peserta tidak tersedia.');
    return program.profiles[0] ?? null;
  }

  async writeProfile(id: string, studentId: string, input: ProgramProfile, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      const reference = await tx.assessmentProgram.findUnique({ where: { id }, select: { sessionId: true } });
      if (!reference) throw new NotFoundException('Asesmen tidak tersedia.');
      await lockProgramSession(tx, reference.sessionId);
      const actor = await requireProgramStaff(tx, user, true);
      if (!(await programAuthority(tx, this.permissions, user, actor)).counselor)
        throw new ForbiddenException('Wewenang Bakat dan Minat tidak tersedia.');
      const program = await tx.assessmentProgram.findFirst({ where: { id, ownerId: actor.id, kind: { category: 'profile' },
        session: { status: 'completed' } }, select: { id: true, sessionId: true } });
      if (!program || !await tx.assessmentResponse.findFirst({ where: { sessionId: reference.sessionId, studentId,
        submittedAt: { not: null }, OR: [{ lateSubmissionStatus: null }, { lateSubmissionStatus: 'accepted' }] }, select: { id: true } }))
        throw new NotFoundException('Hasil peserta tidak tersedia.');
      const key = { programId: id, studentId };
      const old = await tx.assessmentProgramProfile.findUnique({ where: { programId_studentId: key }, select: { publishedAt: true } });
      if (old?.publishedAt) throw new ConflictException('Profil sudah diterbitkan. Simpan perubahan melalui alur koreksi resmi.');
      const { publish, observations, ...text } = input;
      const data = { ...text, observations: observations as Prisma.InputJsonValue, publishedAt: publish ? new Date() : null };
      const saved = await tx.assessmentProgramProfile.upsert({ where: { programId_studentId: key },
        create: { ...key, ...data }, update: data });
      await this.audit(tx, user, id, publish ? 'assessment-profile.publish' : 'assessment-profile.save',
        { instrumentVersion: input.instrumentVersion });
      return saved;
    });
  }
}
