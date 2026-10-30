import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { createHash } from 'crypto';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { NotificationService } from '../notification/notification.service';
import {
  acquireIdentityMutationLock,
  assertFreshMutationAuthority,
} from '../common/helpers/identity-mutation-lock';
import { lockOperationalTeachers } from '../common/helpers/operational-teacher';
import { lockSessionInputs } from '../common/helpers/class-session-activation';
import {
  sessionJpSlots,
  physicalJpAttendance,
  jpDailyTotals,
  attendanceNoticeBody,
} from './student-session-attendance.math';
import type {
  LearnerSessionAttendanceQuery,
  SessionAttendanceRosterQuery,
  SessionAttendanceSave,
} from './student-session-attendance.dto';

const includeSession = {
  bellScheduleProfile: { include: { segments: true } },
  assignedTeacher: { select: { userId: true } },
  academicYear: { select: { code: true } },
  semester: { select: { number: true } },
} as const;
const eligible = {
  status: 'active',
  deletedAt: null,
  user: { isActive: true, deletedAt: null },
} as const;

@Injectable()
export class StudentSessionAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly period: AcademicPeriodService,
    private readonly notifications: NotificationService,
  ) {}

  private async actor(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    permission: string | ((role: string) => string | null),
  ) {
    const actor = await tx.user.findFirst({
      where: { keycloakId: user.keycloakId, isActive: true, deletedAt: null },
      select: { id: true, role: true },
    });
    const required =
      actor && (typeof permission === 'string' ? permission : permission(actor.role));
    if (
      !actor ||
      !required ||
      !(await this.permissions.hasFreshPermission(user.keycloakId, required, tx))
    )
      throw new ForbiddenException('Akses kehadiran tidak diizinkan');
    return actor;
  }
  private async teacherSession(tx: Prisma.TransactionClient, id: string, user: AuthUser) {
    const actor = await this.actor(tx, user, 'academic.attendance.create');
    const session = await tx.classSession.findUnique({ where: { id }, include: includeSession });
    if (!session) throw new NotFoundException('Sesi tidak ditemukan');
    if (
      actor.role !== 'GURU' ||
      session.assignedTeacher.userId !== actor.id ||
      !(await lockOperationalTeachers(tx, [session.assignedTeacherId])).has(
        session.assignedTeacherId,
      )
    )
      throw new ForbiddenException('Sesi bukan kewenangan guru aktif ini');
    if (
      !['STARTED', 'COMPLETED'].includes(session.status) ||
      !session.startedAt ||
      session.supersededAt
    )
      throw new ConflictException(
        'Mulai sesi sebelum mengisi absensi. Sesi yang dibatalkan tidak dapat diisi.',
      );
    if (
      await tx.academicCalendar.findFirst({
        where: {
          academicYearId: session.academicYearId,
          type: { in: ['holiday', 'break'] },
          startDate: { lte: session.serviceDate },
          endDate: { gte: session.serviceDate },
        },
        select: { id: true },
      })
    )
      throw new ConflictException('Tanggal sesi merupakan hari libur sekolah');
    const slots = sessionJpSlots(session);
    if (!slots.length) throw new ConflictException('Rentang JP sesi belum dapat diverifikasi');
    return { session, slots, actor };
  }
  async roster(query: SessionAttendanceRosterQuery, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await acquireIdentityMutationLock(tx);
      const id =
        query.sessionId ??
        (
          await tx.classSession.findUnique({
            where: {
              scheduleId_serviceDate: {
                scheduleId: query.scheduleId!,
                serviceDate: new Date(query.date!),
              },
            },
            select: { id: true },
          })
        )?.id;
      if (!id)
        throw new ConflictException(
          'Sesi belum disiapkan/dimulai. Buka sesi mengajar terlebih dahulu.',
        );
      const { session, slots } = await this.teacherSession(tx, id, user);
      await this.period.assertWritableSemesterId(tx, session.semesterId);
      const students = await tx.student.findMany({
        where: {
          ...eligible,
          classId: session.classId,
          joinedAt: { lte: session.serviceDate },
        },
        select: { id: true, nis: true, user: { select: { fullName: true } } },
        orderBy: { nis: 'asc' },
      });
      const records = await tx.studentSessionAttendance.findMany({ where: { sessionId: id } });
      return {
        sessionId: id,
        classId: session.classId,
        date: session.serviceDate.toISOString().slice(0, 10),
        subject: session.subjectSnapshot,
        slots,
        students: students.map((s) => ({ id: s.id, nis: s.nis, name: s.user.fullName })),
        records: records
          .filter((r) => students.some((s) => s.id === r.studentId))
          .map((r) => ({
            studentId: r.studentId,
            jp: r.jp,
            status: r.status,
            notes: r.notes,
            revision: r.revision,
          })),
      };
    });
  }
  async save(id: string, dto: SessionAttendanceSave, user: AuthUser) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        await lockSessionInputs(tx);
        await this.period.acquireCutoverLock(tx);
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM academic.class_sessions WHERE id=${id}::uuid FOR UPDATE`,
        );
        await assertFreshMutationAuthority(
          tx,
          this.permissions,
          user.keycloakId,
          'academic.attendance.create',
          ['GURU'],
        );
        const { session, slots, actor } = await this.teacherSession(tx, id, user);
        await this.period.assertWritableSemesterId(tx, session.semesterId);
        if (new Date() < session.startedAt!)
          throw new ConflictException('Waktu penyimpanan mendahului mulai sesi');
        // Retain roster membership and identity until commit; re-read after the locks.
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM student.students WHERE class_id=${session.classId}::uuid ORDER BY id FOR SHARE`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT u.id FROM auth.users u JOIN student.students s ON s.user_id=u.id WHERE s.class_id=${session.classId}::uuid ORDER BY u.id FOR SHARE OF u`,
        );
        const students = await tx.student.findMany({
          where: {
            ...eligible,
            classId: session.classId,
            joinedAt: { lte: session.serviceDate },
          },
          select: { id: true, parentId: true, user: { select: { fullName: true } } },
        });
        const valid = new Set(students.flatMap((s) => slots.map((slot) => s.id + ':' + slot.jp)));
        if (
          !valid.size ||
          dto.records.length !== valid.size ||
          new Set(dto.records.map((r) => r.studentId + ':' + r.jp)).size !== valid.size ||
          dto.records.some((r) => !valid.has(r.studentId + ':' + r.jp))
        )
          throw new BadRequestException(
            'Daftar siswa/JP berubah atau belum lengkap. Muat ulang absensi.',
          );
        const before = await tx.studentSessionAttendance.findMany({ where: { sessionId: id } });
        const previous = new Map(before.map((r) => [r.studentId + ':' + r.jp, r]));
        const changes = dto.records.filter((r) => {
          const old = previous.get(r.studentId + ':' + r.jp);
          return !old || old.status !== r.status || old.notes !== (r.notes || null);
        });
        if (!changes.length)
          return { saved: dto.records.length, replayed: true, notificationIds: [] as string[] };
        if (
          dto.records.some(
            (r) => r.revision !== (previous.get(r.studentId + ':' + r.jp)?.revision ?? 0),
          )
        )
          throw new ConflictException(
            'Absensi telah diperbarui. Muat ulang sebelum menyimpan koreksi.',
          );
        for (const row of changes) {
          const old = previous.get(row.studentId + ':' + row.jp);
          await tx.studentSessionAttendance.upsert({
            where: {
              studentId_sessionId_jp: { studentId: row.studentId, sessionId: id, jp: row.jp },
            },
            create: {
              studentId: row.studentId,
              sessionId: id,
              jp: row.jp,
              status: row.status,
              notes: row.notes || null,
              recordedBy: actor.id,
            },
            update: {
              status: row.status,
              notes: row.notes || null,
              recordedBy: actor.id,
              revision: { increment: 1 },
            },
          });
          if (old && old.revision < 1) throw new ConflictException('Versi absensi tidak valid');
        }
        const notificationIds: string[] = [];
        for (const student of students.filter((s) => changes.some((r) => r.studentId === s.id))) {
          await tx.notificationLog.updateMany({
            where: {
              refType: 'student_session_attendance',
              refId: { startsWith: student.id + ':' + id + ':' },
              status: 'pending',
            },
            data: { status: 'failed', error: 'ATTENDANCE_UPDATED' },
          });
          const records = await tx.studentSessionAttendance.findMany({
            where: { studentId: student.id, sessionId: id },
            orderBy: { jp: 'asc' },
          });
          const absent = records.some((r) => r.status !== 'hadir'),
            wasAbsent = before.some((r) => r.studentId === student.id && r.status !== 'hadir');
          if (!student.parentId || (!absent && !wasAbsent)) continue;
          const parent = await tx.user.findFirst({
            where: { id: student.parentId, role: 'ORANG_TUA', isActive: true, deletedAt: null },
            select: { id: true },
          });
          if (!parent) continue;
          const hash = createHash('sha256')
            .update(JSON.stringify(records.map((r) => [r.jp, r.status, r.notes, r.revision])))
            .digest('hex')
            .slice(0, 24);
          const warning = records.some((r) => r.status === 'alpha');
          const log = await tx.notificationLog.create({
            data: {
              channel: 'push',
              recipient: parent.id,
              subject: warning ? 'Peringatan kehadiran sesi' : 'Informasi kehadiran sesi',
              body: attendanceNoticeBody(
                student.user.fullName,
                session.serviceDate.toISOString().slice(0, 10),
                session.subjectSnapshot,
                records,
                wasAbsent && !absent,
              ),
              refType: 'student_session_attendance',
              refId: student.id + ':' + id + ':' + hash,
              status: 'pending',
            },
          });
          notificationIds.push(log.id);
        }
        await tx.auditLog.create({
          data: {
            actorId: user.keycloakId,
            actorRoles: ['GURU'],
            action: 'attendance.session.save',
            resourceType: 'class-session',
            resourceId: id,
            method: 'POST',
            path: '/attendance/student-sessions/' + id,
            statusCode: 200,
            outcome: 'success',
            metadata: {
              changed: changes.map((r) => ({
                studentId: r.studentId,
                jp: r.jp,
                from: previous.get(r.studentId + ':' + r.jp)?.status ?? null,
                to: r.status,
                notesChanged: previous.get(r.studentId + ':' + r.jp)?.notes !== (r.notes || null),
              })),
            },
          },
        });
        return { saved: dto.records.length, replayed: false, notificationIds };
      },
      { timeout: 20000 },
    );
    // Intent is already durable; queue outage must not cause a second attendance save.
    try {
      await this.notifications.enqueueCommittedPendingLogs(result.notificationIds);
    } catch {
      logger.warn('[SessionAttendance] Committed inbox intents await queue recovery', {
        count: result.notificationIds.length,
      });
    }
    return { saved: result.saved, replayed: result.replayed };
  }
  async learner(query: LearnerSessionAttendanceQuery, user: AuthUser) {
    return this.prisma.$transaction(
      async (tx) => {
        const actor = await this.actor(tx, user, (role) =>
          role === 'SISWA'
            ? 'attendance.own.read'
            : role === 'ORANG_TUA'
              ? 'attendance.child.read'
              : null,
        );
        if (!['SISWA', 'ORANG_TUA'].includes(actor.role))
          throw new ForbiddenException('Gunakan tampilan pemantauan sesuai kewenangan');
        const student = await tx.student.findFirst({
          where: {
            deletedAt: null,
            ...(query.studentId ? { id: query.studentId } : {}),
            ...(actor.role === 'SISWA' ? { userId: actor.id } : { parentId: actor.id }),
          },
          select: { id: true, classId: true, joinedAt: true, status: true },
        });
        if (!student || (actor.role === 'ORANG_TUA' && !query.studentId))
          throw new ForbiddenException('Pilih siswa yang terhubung dengan akun ini');
        const from = new Date(query.from),
          to = new Date(query.to);
        // Dates alone are ambiguous when old semester configurations overlap.
        // The UI's selected period is authoritative; older callers use the one active period.
        const period =
          query.academicYear && query.semester
            ? await this.period.findPeriodByCodeAndSemester(query.academicYear, query.semester, tx)
            : await this.period.getActivePeriod(tx);
        if (from < period.startDate || to > period.endDate)
          throw new BadRequestException(
            'Rentang harus berada dalam satu periode sekolah yang dikonfigurasi',
          );
        const sessions = await tx.classSession.findMany({
          where: {
            semesterId: period.semesterId,
            serviceDate: { gte: from, lte: to },
            status: { in: ['SCHEDULED', 'REASSIGNED', 'STARTED', 'COMPLETED'] },
            supersededAt: null,
            OR: [
              {
                classId:
                  student.status === 'active' && student.classId
                    ? student.classId
                    : '00000000-0000-0000-0000-000000000000',
                serviceDate: { gte: student.joinedAt },
              },
              { studentAttendance: { some: { studentId: student.id } } },
            ],
          },
          include: { ...includeSession, studentAttendance: { where: { studentId: student.id } } },
          orderBy: [{ serviceDate: 'asc' }, { scheduledStartAt: 'asc' }],
          take: 1001,
        });
        if (sessions.length > 1000)
          throw new ConflictException('Terlalu banyak sesi; pilih rentang lebih pendek');
        const subjects = await tx.subject.findMany({
          where: { name: { in: [...new Set(sessions.map((s) => s.subjectSnapshot))] } },
          select: { name: true, code: true },
        });
        const holidays = await tx.academicCalendar.findMany({
          where: {
            academicYearId: { in: [...new Set(sessions.map((s) => s.academicYearId))] },
            type: { in: ['holiday', 'break'] },
            startDate: { lte: to },
            endDate: { gte: from },
          },
          select: { startDate: true, endDate: true },
        });
        const rows = sessions
          .filter(
            (s) =>
              s.serviceDate.getUTCDay() !== 0 &&
              !holidays.some((h) => s.serviceDate >= h.startDate && s.serviceDate <= h.endDate),
          )
          .map((s) => {
            const codes = subjects.filter((x) => x.name === s.subjectSnapshot),
              slots = sessionJpSlots(s);
            if (!slots.length)
              throw new ConflictException(
                'Pola JP sesi belum dapat diverifikasi; ringkasan tidak disimpulkan.',
              );
            return {
              id: s.id,
              date: s.serviceDate.toISOString().slice(0, 10),
              subject: s.subjectSnapshot,
              subjectCode: codes.length === 1 ? codes[0]!.code : null,
              teacher: s.assignedTeacherName,
              className: s.classNameSnapshot,
              status: s.status,
              slots: slots.map((slot) => {
                const r = s.studentAttendance.find((x) => x.jp === slot.jp);
                return {
                  ...slot,
                  status: r?.status ?? null,
                  notes: r?.notes ?? null,
                  updatedAt: r?.updatedAt.toISOString() ?? null,
                };
              }),
            };
          });
        const daily = jpDailyTotals(physicalJpAttendance(rows));
        return {
          studentId: student.id,
          academicYear: period.academicYear,
          semester: period.semester,
          from: query.from,
          to: query.to,
          unit: 'student_session_jp' as const,
          scope:
            'Sesi yang disiapkan untuk kelas saat ini dan catatan sesi tersimpan. Data kelas historis tidak direka. JP beririsan dihitung sekali; status yang berbeda/belum lengkap memerlukan pemeriksaan.',
          sessions: rows,
          ...daily,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
