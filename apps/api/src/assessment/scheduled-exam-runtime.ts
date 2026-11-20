import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

export const examAccessSelect = {
  opensAt: true, latestEntryAt: true, closesAt: true, publishedAt: true, cancelledAt: true,
} satisfies Prisma.ExamScheduleSelect;
export type ExamWindow = Prisma.ExamScheduleGetPayload<{ select: typeof examAccessSelect }>;

export function examDeviceHash(deviceId: string): string {
  return createHash('sha256').update(deviceId.toLowerCase()).digest('hex');
}

export function examDeadline(closesAt: Date, startedAt: Date, duration: number, extra: number): Date {
  return new Date(Math.min(closesAt.getTime(), startedAt.getTime() + (duration + extra) * 60_000));
}

export function assertExamWindow(window: ExamWindow, now: Date, starting: boolean): void {
  if (!window.publishedAt || window.cancelledAt)
    throw new ForbiddenException('Sesi ujian belum diterbitkan atau dibatalkan.');
  if (now < window.opensAt) throw new ConflictException('Ujian belum dibuka.');
  if (starting && (now > window.latestEntryAt || now >= window.closesAt))
    throw new ConflictException('Batas masuk ujian sudah terlewati.');
}

export async function authorizeExamDevice(tx: Prisma.TransactionClient, sessionId: string, studentId: string,
  deviceId: string | undefined, mayBind: boolean): Promise<{ extraMinutes: number }> {
  if (!deviceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId))
    throw new ForbiddenException('Perangkat ini belum terverifikasi untuk ujian.');
  // A participant-row lock serializes binding and transfer with the current write.
  const [row] = await tx.$queryRaw<{ deviceHash: string | null; extraMinutes: number }[]>(Prisma.sql`
    SELECT p.device_hash AS "deviceHash", p.extra_minutes AS "extraMinutes"
    FROM academic.exam_participants p
    JOIN student.students s ON s.id = p.student_id
    JOIN auth.users u ON u.id = s.user_id
    WHERE p.session_id = ${sessionId}::uuid AND p.student_id = ${studentId}::uuid
      AND s.deleted_at IS NULL AND s.status = 'active'
      AND u.deleted_at IS NULL AND u.is_active AND u.role = 'SISWA'
    FOR UPDATE OF p`);
  if (!row) throw new ForbiddenException('Anda belum terdaftar sebagai peserta ujian ini.');
  const hash = examDeviceHash(deviceId);
  if (!row.deviceHash && mayBind) {
    await tx.examParticipant.update({ where: { sessionId_studentId: { sessionId, studentId } },
      data: { deviceHash: hash } });
  } else if (row.deviceHash !== hash) {
    throw new ConflictException({ code: 'EXAM_DEVICE_CHANGED',
      message: 'Ujian terikat ke perangkat lain. Verifikasi perangkat ini kepada proktor.' });
  }
  return { extraMinutes: row.extraMinutes };
}
