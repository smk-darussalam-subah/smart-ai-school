// =============================================================================
// WaLogService — audit log for WhatsApp notifications (P15 — W3-4).
// KS/SA: list all · SISWA: own logs · ORANG_TUA: child logs.
// Internal: logWaNotification() called by NotificationListener after each send.
// =============================================================================

import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { isElevated, resolveSiswaId, resolveUserId } from '../common/helpers/role-helpers';
import { ListWaLogDto, LogWaNotificationDto } from './dto/wa-log.dto';

const WA_LOG_SELECT = {
  id: true,
  studentId: true,
  parentId: true,
  recipient: true,
  message: true,
  status: true,
  eventType: true,
  notificationLogId: true,
  sentAt: true,
  deliveredAt: true,
  readAt: true,
  createdAt: true,
} as const;

@Injectable()
export class WaLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** KS/SA: list all WA logs with filters */
  async findAll(query: ListWaLogDto, user: AuthUser) {
    if (!isElevated(user)) {
      throw new ForbiddenException('Hanya KS/SA yang dapat melihat semua log WA');
    }
    const filters: Prisma.WaLogWhereInput = {
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.waLog.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        select: WA_LOG_SELECT,
      }),
      this.prisma.waLog.count({ where: filters }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  /** SISWA: list own WA logs */
  async findMyLogs(user: AuthUser) {
    const studentId = await resolveSiswaId(this.prisma, user.keycloakId);
    return this.prisma.waLog.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: WA_LOG_SELECT,
    });
  }

  /** ORANG_TUA: list child WA logs (with ownership check) */
  async findStudentLogs(studentId: string, user: AuthUser) {
    if (!user.roles.includes('ORANG_TUA') && !isElevated(user)) {
      throw new ForbiddenException('Akses ditolak');
    }

    if (user.roles.includes('ORANG_TUA') && !isElevated(user)) {
      const userId = await resolveUserId(this.prisma, user.keycloakId);
      const child = await this.prisma.student.findFirst({
        where: { id: studentId, parentId: userId, deletedAt: null },
        select: { id: true },
      });
      if (!child) {
        throw new ForbiddenException('Siswa ini bukan anak Anda');
      }
    }

    return this.prisma.waLog.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: WA_LOG_SELECT,
    });
  }

  /**
   * Internal: create a WaLog entry after a WA notification is sent.
   * Called by NotificationListener. Fail-soft: errors are logged, not thrown.
   */
  async logWaNotification(dto: LogWaNotificationDto): Promise<void> {
    try {
      await this.prisma.waLog.create({
        data: {
          studentId: dto.studentId ?? null,
          parentId: dto.parentId ?? null,
          recipient: dto.recipient,
          message: dto.message,
          status: 'sent',
          eventType: dto.eventType ?? null,
          notificationLogId: dto.notificationLogId ?? null,
          sentAt: new Date(),
        },
      });
    } catch (err) {
      logger.warn('[WaLogService] Failed to create WaLog entry (fail-soft)', {
        recipient: dto.recipient,
        eventType: dto.eventType,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
