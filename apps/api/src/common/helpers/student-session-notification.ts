import { createHash } from 'crypto';
import type { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from '../../permissions/permissions.service';
const ref =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{24})$/i;
export function parseStudentAttendanceRef(value: string | null) {
  const match = value?.match(ref);
  return match ? { studentId: match[1]!, sessionId: match[2]!, hash: match[3]! } : null;
}
/** Recheck current family ownership and correction version before displaying/sending inbox data. */
export async function studentAttendanceNoticeTarget(
  prisma: PrismaService,
  log: { refId: string | null; recipient: string },
) {
  const parsed = parseStudentAttendanceRef(log.refId);
  if (!parsed) return null;
  const student = await prisma.student.findFirst({
    where: {
      id: parsed.studentId,
      parentId: log.recipient,
      deletedAt: null,
      parent: { is: { role: 'ORANG_TUA', isActive: true, deletedAt: null } },
    },
    select: { parent: { select: { keycloakId: true } } },
  });
  if (
    !student?.parent ||
    !(await new PermissionsService(prisma).hasFreshPermission(
      student.parent.keycloakId,
      'attendance.child.read',
      prisma,
    ))
  )
    return null;
  const session = await prisma.classSession.findFirst({
    where: { id: parsed.sessionId, status: { in: ['STARTED', 'COMPLETED'] }, supersededAt: null },
    select: {
      serviceDate: true,
      academicYear: { select: { code: true } },
      semester: { select: { number: true } },
    },
  });
  if (!session) return null;
  const records = await prisma.studentSessionAttendance.findMany({
    where: { studentId: parsed.studentId, sessionId: parsed.sessionId },
    orderBy: { jp: 'asc' },
  });
  const hash = createHash('sha256')
    .update(JSON.stringify(records.map((r) => [r.jp, r.status, r.notes, r.revision])))
    .digest('hex')
    .slice(0, 24);
  if (!records.length || hash !== parsed.hash) return null;
  return (
    '/dashboard/akademik?' +
    new URLSearchParams({
      studentId: parsed.studentId,
      attendanceDate: session.serviceDate.toISOString().slice(0, 10),
      academicYear: session.academicYear.code,
      semester: String(session.semester.number),
    })
  );
}
