import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { resolveClassSessionReadScope } from '../class-sessions/class-session-read-scope';
import type { SessionAttendanceReadQuery } from './student-session-attendance.dto';
import { sessionJpSlots } from './student-session-attendance.math';

/** Read-only audit: use the recap's exact session scope, never the teacher's write authority. */
@Injectable()
export class StudentSessionAttendanceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async read(id: string, query: SessionAttendanceReadQuery, user: AuthUser) {
    return this.prisma.$transaction(
      async (tx) => {
        const access = await resolveClassSessionReadScope(tx, this.permissions, user, query);
        const session = await tx.classSession.findFirst({
          where: { AND: [{ id }, access.where] },
          include: { bellScheduleProfile: { include: { segments: true } } },
        });
        if (!session)
          throw new ForbiddenException('Sesi tidak ditemukan atau tidak dapat Anda akses');
        const slots = sessionJpSlots(session);
        if (!slots.length) throw new ConflictException('Pola JP sesi belum dapat diverifikasi');
        const [students, records] = await Promise.all([
          tx.student.findMany({
            where: {
              OR: [
                {
                  deletedAt: null,
                  classId: session.classId,
                  status: 'active',
                  joinedAt: { lte: session.serviceDate },
                  user: { isActive: true, deletedAt: null },
                },
                { sessionAttendance: { some: { sessionId: id } } },
              ],
            },
            select: { id: true, nis: true, user: { select: { fullName: true } } },
            orderBy: [{ nis: 'asc' }, { id: 'asc' }],
            take: 1001,
          }),
          tx.studentSessionAttendance.findMany({
            where: { sessionId: id },
            orderBy: [{ studentId: 'asc' }, { jp: 'asc' }],
          }),
        ]);
        const studentIds = new Set(students.map((student) => student.id));
        const jps = new Set(slots.map((slot) => slot.jp));
        if (
          students.length > 1000 ||
          students.length * slots.length > 4000 ||
          records.some((row) => !studentIds.has(row.studentId) || !jps.has(row.jp))
        )
          throw new ConflictException(
            'Rincian siswa dan JP belum dapat diverifikasi dengan lengkap',
          );
        return {
          sessionId: id,
          classId: session.classId,
          date: session.serviceDate.toISOString().slice(0, 10),
          subject: session.subjectSnapshot,
          slots,
          students: students.map((student) => ({
            id: student.id,
            nis: student.nis,
            name: student.user.fullName,
          })),
          records: records.map((row) => ({
            studentId: row.studentId,
            jp: row.jp,
            status: row.status,
            notes: row.notes,
            revision: row.revision,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
