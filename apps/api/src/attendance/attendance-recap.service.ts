import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { resolveClassSessionReadScope } from '../class-sessions/class-session-read-scope';
import { resolveOwnTeachingRead } from '../common/helpers/own-teaching-read';
import { readAttendancePeriod } from './attendance-period';
import { sessionJpSlots } from './student-session-attendance.math';
import { assertJpReadSession, withJpRead } from './jp-read-admission';
import {
  recapMetrics,
  type AttendanceRecapQuery,
  type RecapStatus,
  type RecapUnit,
} from './attendance-recap.dto';

const codes: Record<string, RecapStatus> = { hadir: 'H', izin: 'I', sakit: 'S', alpha: 'A' };
const studentSelect = {
  id: true,
  nis: true,
  joinedAt: true,
  user: { select: { fullName: true } },
} as const;
const byText = (a: string, b: string) => a.localeCompare(b, 'id');
const schoolDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const key = (r: Pick<RecapUnit, 'studentId' | 'date' | 'jp'>) => `${r.studentId}:${r.date}:${r.jp}`;
const pageOf = <T>(rows: T[], q: AttendanceRecapQuery) => ({
  rows: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
  pagination: { page: q.page, pageSize: q.pageSize, total: rows.length },
});

/** Derived read model only. No migration, attendance mutation, or synthetic business rows. */
@Injectable()
export class AttendanceRecapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async read(q: AttendanceRecapQuery, user: AuthUser, at = new Date()) {
    return withJpRead(this.prisma, user.keycloakId, () => this.readSnapshot(q, user, at));
  }

  private async readSnapshot(q: AttendanceRecapQuery, user: AuthUser, at: Date) {
    return this.prisma.$transaction(
      async (tx) => {
        await assertJpReadSession(tx, user);
        if (
          !(await this.permissions.hasFreshPermission(
            user.keycloakId,
            'academic.attendance.read',
            tx,
          ))
        )
          throw new ForbiddenException('Izin membaca kehadiran tidak tersedia.');
        // Resolve authoritative role, active positions and personal scope inside the same snapshot.
        const access = await resolveClassSessionReadScope(tx, this.permissions, user, {
          scope: q.context === 'own' ? 'own' : undefined,
        });
        const period = await readAttendancePeriod(tx, q);
        let authorized = access.where;
        let classScope: Prisma.ClassWhereInput = {};
        let scopeLabel = 'Seluruh sekolah';
        let effectiveContext = q.context;
        let homeroomAvailable = false;
        if (q.context === 'homeroom') {
          const teacherId = await resolveOwnTeachingRead(tx, access.user, 'own');
          const classes = await tx.class.findMany({
            where: { teacherId, isActive: true, academicYear: period.academicYear.code },
            select: { id: true },
            take: 101,
          });
          if (!classes.length || classes.length > 100)
            throw new ForbiddenException('Kelas binaan belum tersedia untuk akun ini.');
          authorized = { classId: { in: classes.map((c) => c.id) } };
          classScope = { id: { in: classes.map((c) => c.id) } };
          scopeLabel = 'Kelas binaan saya';
          homeroomAvailable = true;
        } else if (typeof authorized.assignedTeacherId === 'string') {
          const teacherId = authorized.assignedTeacherId;
          classScope = {
            OR: [
              { teachingAssignments: { some: { teacherId } } },
              { classSessions: { some: { assignedTeacherId: teacherId, semesterId: period.id } } },
            ],
          };
          scopeLabel = 'Sesi yang saya ampu';
          effectiveContext = 'own';
          homeroomAvailable = Boolean(
            await tx.class.findFirst({
              where: { teacherId, isActive: true, academicYear: period.academicYear.code },
              select: { id: true },
            }),
          );
        } else if (authorized.class) {
          // The existing scope helper returns the plain Kaprog ClassWhereInput here.
          classScope = authorized.class as Prisma.ClassWhereInput;
          scopeLabel = 'Jurusan yang menjadi kewenangan saya';
        }
        const today = schoolDay.format(at);
        const first = period.startDate.toISOString().slice(0, 10),
          last = period.endDate.toISOString().slice(0, 10);
        const to = q.to ?? (today < first ? first : today > last ? last : today);
        const from =
          q.from ??
          new Date(Math.max(Date.parse(first), Date.parse(to) - 6 * 86400000))
            .toISOString()
            .slice(0, 10);
        if (
          from < first ||
          to > last ||
          from > to ||
          (q.matrixDate && (q.matrixDate < from || q.matrixDate > to))
        )
          throw new ConflictException(
            'Tanggal harus berada dalam semester dan rentang yang dipilih.',
          );
        const now = at;
        const snapshotSessions = await tx.classSession.findMany({
          where: {
            AND: [
              authorized,
              {
                semesterId: period.id,
                serviceDate: { gte: new Date(from), lte: new Date(to) },
                supersededAt: null,
              },
            ],
          },
          include: {
            bellScheduleProfile: { include: { segments: true } },
            class: {
              select: {
                id: true,
                name: true,
                majorCode: true,
                grade: true,
              },
            },
            studentAttendance: {
              where: q.studentId ? { studentId: q.studentId } : {},
              select: {
                studentId: true,
                jp: true,
                status: true,
                notes: ['detail', 'export'].includes(q.view),
                revision: true,
                updatedAt: true,
              },
              take: 4001,
            },
          },
          orderBy: [{ serviceDate: 'asc' }, { id: 'asc' }],
          take: 10001,
        });
        if (snapshotSessions.length > 10000)
          throw new ConflictException('Pilih rentang atau kelas yang lebih kecil.');

        // Load each class roster and recorded student's metadata once in this
        // same snapshot. Nested copies on every session/JP multiply a month of
        // school data into tens of thousands of identical names and relations.
        const classIds = [...new Set(snapshotSessions.map((s) => s.classId))];
        if (classIds.length > 1000)
          throw new ConflictException('Pilih cakupan kelas yang lebih kecil.');
        const rosters = await tx.class.findMany({
          where: { id: { in: classIds } },
          select: {
            id: true,
            students: {
              where: {
                ...(q.studentId ? { id: q.studentId } : {}),
                status: 'active',
                deletedAt: null,
                user: { isActive: true, deletedAt: null },
              },
              select: studentSelect,
              take: 1001,
            },
          },
        });
        const recordedIds = [
          ...new Set(snapshotSessions.flatMap((s) => s.studentAttendance.map((r) => r.studentId))),
        ];
        const recordedStudents: Prisma.StudentGetPayload<{ select: typeof studentSelect }>[] = [];
        for (let offset = 0; offset < recordedIds.length; offset += 1000) {
          recordedStudents.push(
            ...(await tx.student.findMany({
              where: { id: { in: recordedIds.slice(offset, offset + 1000) } },
              // Historical records retain their metadata even after enrollment
              // or account archival; active-roster filters do not apply here.
              select: studentSelect,
            })),
          );
        }
        const rosterByClass = new Map(rosters.map((r) => [r.id, r.students]));
        const studentById = new Map(recordedStudents.map((s) => [s.id, s]));
        const sessions = snapshotSessions.map((s) => {
          const students = rosterByClass.get(s.classId);
          if (!students)
            throw new ConflictException('Daftar siswa belum dapat diverifikasi lengkap.');
          return {
            ...s,
            class: { ...s.class, students },
            studentAttendance: s.studentAttendance.map((r) => {
              const student = studentById.get(r.studentId);
              if (!student)
                throw new ConflictException('Histori siswa belum dapat diverifikasi lengkap.');
              return { ...r, student };
            }),
          };
        });
        const [calendar, operationalClasses] = await Promise.all([
          tx.academicCalendar.findMany({
            where: {
              academicYearId: period.academicYear.id,
              type: { in: ['holiday', 'break'] },
              startDate: { lte: new Date(to) },
              endDate: { gte: new Date(from) },
            },
            select: { startDate: true, endDate: true },
          }),
          tx.class.findMany({
            where: {
              AND: [classScope, { academicYear: period.academicYear.code, isActive: true }],
            },
            select: { id: true, name: true, grade: true, majorCode: true },
            orderBy: { name: 'asc' },
            take: 1001,
          }),
        ]);
        if (operationalClasses.length > 1000)
          throw new ConflictException('Cakupan kelas terlalu besar.');
        const options = {
          classes: [
            ...new Map(
              [...operationalClasses, ...sessions.map((s) => s.class)].map((c) => [
                c.id,
                { id: c.id, name: c.name, grade: c.grade, majorCode: c.majorCode },
              ]),
            ).values(),
          ],
          subjects: [...new Set(sessions.map((s) => s.subjectSnapshot))].sort(byText),
          teachers: [
            ...new Map(
              sessions.map((s) => [
                s.assignedTeacherId,
                { id: s.assignedTeacherId, name: s.assignedTeacherName },
              ]),
            ).values(),
          ],
          jps: [] as number[],
        };
        if (options.classes.length > 1000)
          throw new ConflictException('Pilih cakupan kelas yang lebih kecil.');
        const selectedClass = q.classId ? options.classes.find((c) => c.id === q.classId) : null;
        if (q.classId && !selectedClass)
          throw new ForbiddenException('Kelas tidak tersedia dalam kewenangan ini.');
        const labels = [
          selectedClass
            ? `Kelas ${selectedClass.name}`
            : q.majorCode
              ? `Jurusan ${q.majorCode}`
              : '',
          q.grade ? `Tingkat ${q.grade}` : '',
          q.subject ? `Mapel ${q.subject}` : '',
          q.teacherId
            ? (options.teachers.find((t) => t.id === q.teacherId)?.name ?? 'Guru pilihan')
            : '',
          q.jp ? `JP ${q.jp}` : q.jpFrom ? `JP ${q.jpFrom}–${q.jpTo}` : '',
        ].filter(Boolean);
        if (labels.length)
          scopeLabel = (effectiveContext === 'authorized' ? labels : [scopeLabel, ...labels]).join(
            ' · ',
          );
        const filtered = sessions.filter(
          (s) =>
            (!q.classId || s.classId === q.classId) &&
            (!q.teacherId || s.assignedTeacherId === q.teacherId) &&
            (!q.subject || s.subjectSnapshot === q.subject) &&
            (!q.majorCode || s.class.majorCode === q.majorCode) &&
            (!q.grade || s.class.grade === q.grade),
        );
        const physical = new Map<string, RecapUnit>();
        const availableJps = new Set<number>();
        const sessionsById = new Map(filtered.map((s) => [s.id, s]));
        let rawCount = 0;
        for (const s of filtered) {
          if (s.serviceDate.getUTCDay() === 0) continue;
          const slots = sessionJpSlots(s);
          for (const slot of slots) availableJps.add(slot.jp);
          if (
            !slots.length ||
            s.class.students.length > 1000 ||
            s.studentAttendance.length > 4000 ||
            s.studentAttendance.some((r) => !slots.some((slot) => slot.jp === r.jp))
          )
            throw new ConflictException(
              'Pola JP atau daftar siswa belum dapat diverifikasi lengkap.',
            );
          const date = s.serviceDate.toISOString().slice(0, 10);
          const cancelled =
            s.status === 'CANCELLED' ||
            s.serviceDate.getUTCDay() === 0 ||
            calendar.some((h) => s.serviceDate >= h.startDate && s.serviceDate <= h.endDate);
          const roster = new Map(
            s.class.students.filter((st) => st.joinedAt <= s.serviceDate).map((st) => [st.id, st]),
          );
          for (const r of s.studentAttendance) roster.set(r.studentId, r.student);
          rawCount += roster.size * slots.length;
          if (rawCount > 1000000)
            throw new ConflictException('Pilih rentang atau kelas yang lebih kecil.');
          const records = new Map(s.studentAttendance.map((r) => [`${r.studentId}:${r.jp}`, r]));
          for (const st of roster.values())
            for (const slot of slots) {
              if (
                (q.jp && q.jp !== slot.jp) ||
                (q.jpFrom && slot.jp < q.jpFrom) ||
                (q.jpTo && slot.jp > q.jpTo)
              )
                continue;
              const record = records.get(`${st.id}:${slot.jp}`);
              const value: RecapUnit = {
                studentId: st.id,
                name: st.user.fullName,
                nis: st.nis,
                classId: s.classId,
                className: s.classNameSnapshot,
                date,
                jp: slot.jp,
                startAt: slot.startAt,
                endAt: slot.endAt,
                status: cancelled
                  ? 'C'
                  : Date.parse(slot.endAt) > now.getTime()
                    ? 'N'
                    : record
                      ? codes[record.status]!
                      : 'U',
                sessionId: s.id,
                teacherId: s.assignedTeacherId,
                teacher: s.assignedTeacherName,
                subject: s.subjectSnapshot,
                notes: record?.notes ?? null,
                revision: record?.revision ?? null,
                recordedAt: record?.updatedAt.toISOString() ?? null,
                sources: [s.id],
              };
              const old = physical.get(key(value));
              if (!old || (old.status === 'C' && value.status !== 'C'))
                physical.set(key(value), value);
              else if (value.status !== 'C') {
                if (old.classId !== value.classId)
                  throw new ConflictException(
                    'Keanggotaan siswa pada JP bertumpuk perlu diperiksa.',
                  );
                if (old.startAt !== value.startAt || old.endAt !== value.endAt)
                  throw new ConflictException('Pola waktu JP pada sesi bertumpuk perlu diperiksa.');
                const status: RecapStatus =
                  old.status === 'N' || value.status === 'N'
                    ? 'N'
                    : old.status === value.status
                      ? old.status
                      : 'U';
                physical.set(key(value), {
                  ...old,
                  status,
                  subject: [...new Set([...old.subject.split(' / '), value.subject])].join(' / '),
                  teacher: [...new Set([...old.teacher.split(' / '), value.teacher])].join(' / '),
                  sources: [...old.sources, s.id],
                  notes: status === 'U' ? null : old.notes === value.notes ? old.notes : null,
                  revision: status === 'U' ? null : old.revision,
                  recordedAt: status === 'U' ? null : old.recordedAt,
                });
              }
            }
        }
        const units = [...physical.values()];
        const matrixDate = q.matrixDate ?? (today >= from && today <= to ? today : to);
        options.jps = [...availableJps].sort((a, b) => a - b);
        const metricRows = q.studentId ? units.filter((r) => r.studentId === q.studentId) : units;
        if (q.studentId && !metricRows.length)
          throw new ForbiddenException('Rincian siswa tidak tersedia dalam cakupan ini.');
        const metrics = recapMetrics(metricRows);
        const group = (get: (r: RecapUnit) => string) => {
          const map = new Map<string, RecapUnit[]>();
          for (const row of metricRows) {
            const k = get(row);
            const rows = map.get(k) ?? [];
            rows.push(row);
            map.set(k, rows);
          }
          return [...map].map(([id, rows]) => ({ id, rows, metrics: recapMetrics(rows) }));
        };
        const days = group((r) => r.date)
          .map((g) => ({ date: g.id, ...g.metrics }))
          .sort((a, b) => byText(a.date, b.date));
        const jps = group((r) => String(r.jp))
          .map((g) => ({ jp: Number(g.id), ...g.metrics }))
          .sort((a, b) => a.jp - b.jp);
        const search = q.search.toLocaleLowerCase('id');
        const matches = (rows: RecapUnit[], name: string) =>
          (!q.status || rows.some((r) => r.status === q.status)) &&
          (!search ||
            name.toLocaleLowerCase('id').includes(search) ||
            rows.some((r) => `${r.name} ${r.nis}`.toLocaleLowerCase('id').includes(search)));
        const compare = (
          a: { name: string; metrics: ReturnType<typeof recapMetrics> },
          b: { name: string; metrics: ReturnType<typeof recapMetrics> },
        ) =>
          q.sort === 'alpha'
            ? b.metrics.A - a.metrics.A || byText(a.name, b.name)
            : q.sort === 'attendance'
              ? (a.metrics.attendancePct ?? -1) - (b.metrics.attendancePct ?? -1) ||
                byText(a.name, b.name)
              : byText(a.name, b.name);
        const perClass = new Map<string, RecapUnit[]>();
        for (const row of metricRows) {
          const list = perClass.get(row.classId) ?? [];
          list.push(row);
          perClass.set(row.classId, list);
        }
        const persistedClasses = new Set(filtered.map((s) => s.classId));
        const classRows = options.classes
          .filter(
            (c) =>
              (!q.classId || c.id === q.classId) &&
              (!q.majorCode || c.majorCode === q.majorCode) &&
              (!q.grade || c.grade === q.grade),
          )
          .map((c) => {
            const rows = perClass.get(c.id) ?? [];
            return {
              id: c.id,
              name: c.name,
              metrics: recapMetrics(rows),
              matches: matches(rows, c.name),
              hasSessions: persistedClasses.has(c.id),
            };
          });
        const studentGroups = ['students', 'matrix'].includes(q.view)
          ? group((r) => r.studentId)
              .filter((g) => matches(g.rows, g.rows[0]!.name))
              .map((g) => ({
                id: g.id,
                name: g.rows[0]!.name,
                nis: g.rows[0]!.nis,
                className: [...new Set(g.rows.map((r) => r.className))].join(' / '),
                metrics: g.metrics,
                slots:
                  q.view === 'matrix'
                    ? g.rows
                        .filter((r) => r.date === matrixDate)
                        .map((r) => ({
                          jp: r.jp,
                          status: r.status,
                          sessionId: r.sessionId,
                          subject: r.subject,
                          teacher: r.teacher,
                        }))
                    : [],
              }))
              .sort(compare)
          : [];
        const missing = new Map<
          string,
          {
            sessionId: string;
            date: string;
            classId: string;
            className: string;
            teacher: string;
            subject: string;
            jps: number[];
            studentIds: Set<string>;
          }
        >();
        for (const r of q.view === 'missing'
          ? metricRows.filter((r) => r.status === 'U' && matches([r], r.name))
          : [])
          for (const sessionId of r.sources) {
            const s = sessionsById.get(sessionId)!;
            const item = missing.get(sessionId) ?? {
              sessionId,
              date: r.date,
              classId: s.classId,
              className: s.classNameSnapshot,
              teacher: s.assignedTeacherName,
              subject: s.subjectSnapshot,
              jps: [],
              studentIds: new Set<string>(),
            };
            item.studentIds.add(r.studentId);
            if (!item.jps.includes(r.jp)) item.jps.push(r.jp);
            missing.set(sessionId, item);
          }
        const missingRows = [...missing.values()]
          .map(({ studentIds, ...row }) => ({
            ...row,
            jps: row.jps.sort((a, b) => a - b),
            students: studentIds.size,
          }))
          .sort((a, b) => byText(b.date, a.date));
        const timeline = ['detail', 'export'].includes(q.view)
          ? metricRows
              .filter((r) => matches([r], r.name))
              .sort(
                (a, b) => byText(b.date, a.date) || b.jp - a.jp || byText(a.studentId, b.studentId),
              )
          : [];
        if (q.view === 'export' && timeline.length > 50000)
          throw new ConflictException(
            'Ekspor maksimal 50.000 catatan. Persempit rentang atau kelas.',
          );
        const selectedRows =
          q.view === 'summary'
            ? classRows.filter((c) => c.matches).sort(compare)
            : q.view === 'missing'
              ? missingRows
              : q.view === 'detail' || q.view === 'export'
                ? timeline
                : studentGroups;
        const pagination = { page: q.page, pageSize: q.pageSize, total: selectedRows.length };
        let audits: {
          id: string;
          at: string;
          actor: string;
          changes: { jp: number; from: string | null; to: string; notesChanged: boolean }[];
        }[] = [];
        let auditTotal = 0;
        if (q.view === 'audit' && q.studentId) {
          const sessionIds = [...new Set(metricRows.flatMap((r) => r.sources))];
          const studentId = q.studentId;
          const auditJps = q.jp
            ? [q.jp]
            : q.jpFrom && q.jpTo
              ? Array.from({ length: q.jpTo - q.jpFrom + 1 }, (_, i) => q.jpFrom! + i)
              : [];
          const where = {
            action: 'attendance.session.save',
            resourceType: 'class-session',
            resourceId: { in: sessionIds },
            ...(auditJps.length
              ? {
                  OR: auditJps.map((jp) => ({
                    metadata: { path: ['changed'], array_contains: [{ studentId, jp }] },
                  })),
                }
              : { metadata: { path: ['changed'], array_contains: [{ studentId }] } }),
          } satisfies Prisma.AuditLogWhereInput;
          const [events, total] = await Promise.all([
            tx.auditLog.findMany({
              where,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: q.pageSize,
              skip: (q.page - 1) * q.pageSize,
              select: { id: true, createdAt: true, actorUsername: true, metadata: true },
            }),
            tx.auditLog.count({ where }),
          ]);
          auditTotal = total;
          audits = events.map((e) => ({
            id: e.id,
            at: e.createdAt.toISOString(),
            actor: e.actorUsername ?? 'Pencatat absensi',
            changes: this.auditChanges(e.metadata, studentId, q.jp, q.jpFrom, q.jpTo),
          }));
        }
        return {
          academicYear: period.academicYear.code,
          semester: period.number,
          from,
          to,
          periodRange: { from: first, to: last },
          serverDate: today,
          generatedAt: now.toISOString(),
          context: effectiveContext,
          scopeLabel,
          availableContexts:
            effectiveContext === 'authorized'
              ? ['authorized']
              : homeroomAvailable
                ? ['own', 'homeroom']
                : ['own'],
          rosterBasis: 'current_roster_and_recorded_history' as const,
          filters: {
            classId: q.classId ?? null,
            teacherId: q.teacherId ?? null,
            majorCode: q.majorCode ?? null,
            subject: q.subject ?? null,
            grade: q.grade ?? null,
            jp: q.jp ?? null,
            jpFrom: q.jpFrom ?? null,
            jpTo: q.jpTo ?? null,
          },
          resultFilters: {
            search: q.search,
            status: q.status ?? null,
            sort: q.sort,
            studentId: q.studentId ?? null,
          },
          dueBasis: 'jp_end_wib' as const,
          view: q.view,
          matrixDate,
          metrics,
          days,
          jps,
          options,
          coverage: {
            basis: 'persisted_sessions' as const,
            classesWithoutSessions: classRows.filter((c) => !c.hasSessions).length,
            historicalMembership: 'current_mandate_and_retained_records' as const,
          },
          classes: ['summary', 'export'].includes(q.view)
            ? (q.view === 'export'
                ? classRows.filter((c) => c.matches).sort(compare)
                : pageOf(classRows.filter((c) => c.matches).sort(compare), q).rows
              ).map(({ matches: _matches, ...r }) => r)
            : [],
          students: ['students', 'matrix'].includes(q.view) ? pageOf(studentGroups, q).rows : [],
          missing: q.view === 'missing' ? pageOf(missingRows, q).rows : [],
          timeline:
            q.view === 'export' ? timeline : q.view === 'detail' ? pageOf(timeline, q).rows : [],
          audits,
          pagination: q.view === 'audit' ? { ...pagination, total: auditTotal } : pagination,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 },
    );
  }

  private auditChanges(
    metadata: Prisma.JsonValue,
    studentId: string,
    jp?: number,
    jpFrom?: number,
    jpTo?: number,
  ) {
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      !Array.isArray(metadata.changed)
    )
      return [];
    return metadata.changed.flatMap((row) => {
      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        row.studentId !== studentId ||
        typeof row.jp !== 'number' ||
        (jp && row.jp !== jp) ||
        (jpFrom && row.jp < jpFrom) ||
        (jpTo && row.jp > jpTo) ||
        typeof row.to !== 'string'
      )
        return [];
      return [
        {
          jp: row.jp,
          from: typeof row.from === 'string' ? row.from : null,
          to: row.to,
          notesChanged: row.notesChanged === true,
        },
      ];
    });
  }
}
