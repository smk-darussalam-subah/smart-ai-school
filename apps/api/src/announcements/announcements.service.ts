// =============================================================================
// AnnouncementsService — Pengumuman Sekolah (referensi KamilEdu Modul 14)
//
// Visibilitas (filter di QUERY level — doktrin proyek):
//   - Manager: pemegang permission `announcement.manage` efektif.
//   - Role lain: hanya status=published, audiens cocok (role ∈ audience
//     atau audience memuat "ALL"), dan scheduledAt null/sudah lewat.
// =============================================================================

import { ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { NotifChannel, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { normalizePhoneE164 } from '../common/helpers/phone';
import { NotificationService } from '../notification/notification.service';
import {
  CreateAnnouncementDto,
  ListAnnouncementsQueryDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';

const ANNOUNCEMENT_DUE_SCAN_INTERVAL_MS = 60_000;
const STABLE_AUDIENCE_ROLES = ['SUPER_ADMIN', 'GURU', 'TATA_USAHA', 'SISWA', 'ORANG_TUA', 'INDUSTRI'] as const;
const APPOINTMENT_AUDIENCE_CODES = [
  'KEPALA_SEKOLAH',
  'WAKA_KURIKULUM',
  'WAKA_KESISWAAN',
  'WAKA_HUMAS',
  'WAKA_SARPRAS',
  'WAKA_BKK_HUBIN',
  'KAPROG',
  'BENDAHARA',
] as const;

type NotificationHandoffResult = {
  status: 'none' | 'queued' | 'pending_recovery';
  requestedCount: number;
  queuedCount: number;
};

type NotificationLogRef = {
  refType: string;
  refId: string;
  recipient: string;
  channel: NotifChannel;
};

@Injectable()
export class AnnouncementsService implements OnModuleInit, OnModuleDestroy {
  private dueScanTimer: NodeJS.Timeout | null = null;
  private dueScanRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  private async enqueueCommittedNotificationLogs(ids: string[], source: string): Promise<NotificationHandoffResult> {
    if (ids.length === 0) return { status: 'none', requestedCount: 0, queuedCount: 0 };
    if (!this.notificationService) {
      logger.warn('[AnnouncementsService] notification service unavailable; committed logs deferred to recovery', {
        source,
        count: ids.length,
      });
      return { status: 'pending_recovery', requestedCount: ids.length, queuedCount: 0 };
    }
    try {
      const result = await this.notificationService.enqueueCommittedPendingLogs(ids);
      return {
        status: result.queuedCount === ids.length ? 'queued' : 'pending_recovery',
        requestedCount: ids.length,
        queuedCount: result.queuedCount,
      };
    } catch (error: unknown) {
      logger.warn('[AnnouncementsService] committed notification enqueue deferred to recovery', {
        source,
        count: ids.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: 'pending_recovery', requestedCount: ids.length, queuedCount: 0 };
    }
  }

  private notificationLogRefs(logs: Prisma.NotificationLogCreateManyInput[]): NotificationLogRef[] {
    const unique = new Map<string, NotificationLogRef>();
    for (const log of logs) {
      if (!log.refType || !log.refId || !log.recipient || !log.channel) continue;
      const ref = {
        refType: String(log.refType),
        refId: String(log.refId),
        recipient: String(log.recipient),
        channel: log.channel as NotifChannel,
      };
      unique.set(`${ref.refType}:${ref.refId}:${ref.recipient}:${ref.channel}`, ref);
    }
    return [...unique.values()];
  }

  private async committedPendingNotificationLogIds(
    tx: Prisma.TransactionClient,
    logs: Prisma.NotificationLogCreateManyInput[],
  ): Promise<string[]> {
    const refs = this.notificationLogRefs(logs);
    if (refs.length === 0) return [];
    const rows = await tx.notificationLog.findMany({
      where: {
        status: 'pending',
        OR: refs.map((ref) => ({
          refType: ref.refType,
          refId: ref.refId,
          recipient: ref.recipient,
          channel: ref.channel,
        })),
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  onModuleInit(): void {
    this.runDueScan('startup');
    this.dueScanTimer = setInterval(() => this.runDueScan('interval'), ANNOUNCEMENT_DUE_SCAN_INTERVAL_MS);
    this.dueScanTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.dueScanTimer) {
      clearInterval(this.dueScanTimer);
      this.dueScanTimer = null;
    }
  }

  private runDueScan(source: 'startup' | 'interval' | 'manual'): void {
    if (this.dueScanRunning) return;
    this.dueScanRunning = true;
    this.prepareDueAnnouncements().catch((error: unknown) => {
      logger.warn('[AnnouncementsService] due announcement scan skipped', {
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    }).finally(() => {
      this.dueScanRunning = false;
    });
  }

  private async canManage(user: AuthUser): Promise<boolean> {
    return this.permissionsService.hasPermission(user.keycloakId, user.roles, 'announcement.manage');
  }

  private isEffectiveOrPrepared(a: {
    status: string;
    scheduledAt: Date | null;
    deliveryPreparedAt?: Date | null;
  }): boolean {
    if (a.status !== 'published') return false;
    if (a.deliveryPreparedAt) return true;
    return !a.scheduledAt || a.scheduledAt <= new Date();
  }

  /** Klausa visibilitas untuk non-manager — selalu diterapkan di QUERY. */
  private async visibilityWhere(user: AuthUser): Promise<Prisma.AnnouncementWhereInput> {
    const audienceCodes = new Set<string>(user.roles);
    for (const code of await this.permissionsService.getActivePositionCodes(user.keycloakId)) {
      audienceCodes.add(code);
    }
    return {
      status: 'published',
      OR: [
        { audience: { array_contains: ['ALL'] } },
        ...[...audienceCodes].map((role) => ({
          audience: { array_contains: [role] } as Prisma.JsonFilter,
        })),
      ],
      AND: [
        {
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        },
      ],
    };
  }

  private normalizeRecipients(phones: Array<string | null | undefined>, scope: string): string[] {
    const recipients = new Set<string>();
    for (const phone of phones) {
      if (!phone || phone.trim().length === 0) continue;
      try {
        recipients.add(normalizePhoneE164(phone));
      } catch {
        logger.warn('[AnnouncementsService] skipped invalid announcement recipient', { scope });
      }
    }
    return [...recipients];
  }

  private async resolveAudienceRecipients(
    tx: Prisma.TransactionClient,
    audience: string[],
  ): Promise<string[]> {
    const isAll = audience.includes('ALL');
    const stableRoles = audience.filter((role): role is typeof STABLE_AUDIENCE_ROLES[number] =>
      (STABLE_AUDIENCE_ROLES as readonly string[]).includes(role));
    const appointmentCodes = audience.filter((role): role is typeof APPOINTMENT_AUDIENCE_CODES[number] =>
      (APPOINTMENT_AUDIENCE_CODES as readonly string[]).includes(role));

    const phones: Array<string | null> = [];
    if (isAll || stableRoles.length > 0) {
      const users = await tx.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          phone: { not: null },
          ...(isAll ? {} : { role: { in: stableRoles as never } }),
        },
        select: { phone: true },
      });
      phones.push(...users.map((user) => user.phone));
    }

    if (!isAll && appointmentCodes.length > 0) {
      const holders = await tx.appointment.findMany({
        where: {
          status: 'ACTIVE',
          position: { code: { in: appointmentCodes as never }, isActive: true },
          academicYear: { isActive: true },
          staff: {
            deletedAt: null,
            user: { isActive: true, deletedAt: null, phone: { not: null } },
          },
        },
        select: { staff: { select: { user: { select: { phone: true } } } } },
      });
      phones.push(...holders.map((holder) => holder.staff.user.phone));
    }

    return this.normalizeRecipients(phones, `announcement:${audience.join(',') || 'ALL'}`);
  }

  async prepareDueAnnouncements(limit = 50): Promise<{
    claimedCount: number;
    notificationCount: number;
    notificationHandoff: NotificationHandoffResult & { pendingRecoveryCount: number };
  }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const due = await tx.$queryRaw<Array<{
        id: string;
        title: string;
        category: string;
        priority: string;
        audience: unknown;
      }>>(Prisma.sql`
        UPDATE "notification"."announcements"
        SET "delivery_prepared_at" = NOW()
        WHERE "id" IN (
          SELECT "id"
          FROM "notification"."announcements"
          WHERE "status" = 'published'
            AND "delivery_prepared_at" IS NULL
            AND ("scheduled_at" IS NULL OR "scheduled_at" <= NOW())
          ORDER BY COALESCE("scheduled_at", "published_at", "created_at") ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        RETURNING
          "id"::text,
          "title",
          "category"::text,
          "priority"::text,
          "audience"
      `);

      let notificationCount = 0;
      const logIds: string[] = [];
      for (const announcement of due) {
        if (announcement.category !== 'darurat' && announcement.priority !== 'urgent') continue;
        const audience = Array.isArray(announcement.audience)
          ? announcement.audience.map(String)
          : ['ALL'];
        const recipients = await this.resolveAudienceRecipients(tx, audience);
        if (recipients.length === 0) continue;
        const body =
          `PENGUMUMAN ${announcement.category === 'darurat' ? 'DARURAT' : 'PENTING'}: ` +
          `${announcement.title}\nBuka DIIS untuk detail.\n- SMK Darussalam Subah`;
        const logRows = recipients.map((recipient) => ({
          id: randomUUID(),
          recipient,
          channel: 'whatsapp' as const,
          body,
          status: 'pending' as const,
          refType: 'announcement',
          refId: `${announcement.id}:${recipient}`,
        }));
        const created = await tx.notificationLog.createMany({
          data: logRows,
          skipDuplicates: true,
        });
        const pendingIds = await this.committedPendingNotificationLogIds(tx, logRows);
        notificationCount += Math.max(created.count, pendingIds.length);
        logIds.push(...pendingIds);
      }

      return { claimedCount: due.length, notificationCount, logIds };
    });
    const handoff = await this.enqueueCommittedNotificationLogs(result.logIds, 'announcement');
    return {
      claimedCount: result.claimedCount,
      notificationCount: result.notificationCount,
      notificationHandoff: {
        ...handoff,
        pendingRecoveryCount: Math.max(0, handoff.requestedCount - handoff.queuedCount),
      },
    };
  }

  async findAll(query: ListAnnouncementsQueryDto, user: AuthUser) {
    await this.prepareDueAnnouncements();
    const { status, category, search, page, limit } = query;
    const skip = (page - 1) * limit;

    const manager = await this.canManage(user);
    const where: Prisma.AnnouncementWhereInput = manager
      ? {
          ...(status ? { status } : {}),
          ...(category ? { category } : {}),
        }
      : {
          ...(await this.visibilityWhere(user)),
          ...(category ? { category } : {}),
        };

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        orderBy: [
          { isPinned: 'desc' },
          { publishedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, user: AuthUser) {
    await this.prepareDueAnnouncements();
    const where: Prisma.AnnouncementWhereInput = await this.canManage(user)
      ? { id }
      : { id, ...(await this.visibilityWhere(user)) };

    const announcement = await this.prisma.announcement.findFirst({ where });
    // 404 (bukan 403) untuk non-visible — tidak membocorkan keberadaan resource
    if (!announcement) throw new NotFoundException('Pengumuman tidak ditemukan');
    return announcement;
  }

  async create(dto: CreateAnnouncementDto, user: AuthUser) {
    const created = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        content: dto.content,
        category: dto.category,
        priority: dto.priority,
        audience: dto.audience as Prisma.InputJsonValue,
        isPinned: dto.isPinned,
        status: dto.status,
        publishedAt: dto.status === 'published' ? new Date() : null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdBy: user.keycloakId,
        createdByName: user.username,
      },
    });
    if (created.status === 'published') await this.prepareDueAnnouncements();
    return created;
  }

  async update(id: string, dto: UpdateAnnouncementDto, user: AuthUser) {
    const existing = await this.findOne(id, user);
    const mutatesDeliveryContract =
      dto.title !== undefined ||
      dto.content !== undefined ||
      dto.category !== undefined ||
      dto.priority !== undefined ||
      dto.audience !== undefined ||
      dto.scheduledAt !== undefined;
    if (mutatesDeliveryContract && this.isEffectiveOrPrepared(existing)) {
      throw new ConflictException('Pengumuman sudah efektif/siap kirim; content, audience, dan jadwal tidak dapat diubah');
    }

    const data: Prisma.AnnouncementUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.content !== undefined ? { content: dto.content } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.audience !== undefined
        ? { audience: dto.audience as Prisma.InputJsonValue }
        : {}),
      ...(dto.isPinned !== undefined ? { isPinned: dto.isPinned } : {}),
      ...(dto.scheduledAt !== undefined
        ? { scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null }
        : {}),
    };

    if (dto.status !== undefined && dto.status !== existing.status) {
      data.status = dto.status;
      if (dto.status === 'published' && !existing.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    const updated = await this.prisma.announcement.update({ where: { id }, data });
    if (dto.status === 'published') await this.prepareDueAnnouncements();
    return updated;
  }

  async publish(id: string, user: AuthUser) {
    const existing = await this.findOne(id, user);
    const published = await this.prisma.announcement.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: existing.publishedAt ?? new Date(),
      },
    });
    if (existing.status !== 'published') await this.prepareDueAnnouncements();
    return published;
  }

  async archive(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.announcement.update({
      where: { id },
      data: { status: 'archived', isPinned: false },
    });
  }

  async setPin(id: string, isPinned: boolean, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.announcement.update({ where: { id }, data: { isPinned } });
  }

  /** Hard delete aman: tabel tanpa FK masuk/keluar — dummy bisa dihapus bersih. */
  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    await this.prisma.announcement.delete({ where: { id } });
    return { deleted: true, id };
  }
}
