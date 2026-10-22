// =============================================================================
// PushService — PWA push notification subscriptions (P16 — W3-6).
// Subscribe/unsubscribe push endpoints + notification list for SISWA/ORTU.
// =============================================================================

import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUserId } from '../common/helpers/role-helpers';
import { studentAttendanceNoticeTarget } from '../common/helpers/student-session-notification';
import {
  PushEndpointSchema,
  PushDeliveryMessage,
  PushDeliveryMessageSchema,
  SubscribeDto,
  SubscribeSchema,
  UnsubscribeDto,
  UnsubscribeSchema,
  VerifyPushDeliveryDto,
  VerifyPushDeliverySchema,
} from './dto/push.dto';

interface PushLogInput {
  logId: string;
  userId: string;
  title: string;
  body: string;
  beforeSend?: () => Promise<boolean>;
  kind?: 'student-attendance';
}

interface StoredPushKeys {
  p256dh: string;
  auth: string;
}

interface PushNotificationLogRow {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  sentAt: Date | string | null;
  refType: string | null;
  refId: string | null;
  createdAt: Date | string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readPushKeys(value: Prisma.JsonValue): StoredPushKeys | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const p256dh = typeof record.p256dh === 'string' ? record.p256dh : '';
  const auth = typeof record.auth === 'string' ? record.auth : '';
  if (!p256dh || !auth) return null;
  return { p256dh, auth };
}

function readVapidConfig(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = process.env['VAPID_PUBLIC_KEY'] ?? process.env['NEXT_PUBLIC_VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  const subject = process.env['VAPID_SUBJECT'] ?? 'mailto:admin@smkdarussalamsubah.sch.id';
  if (!publicKey?.trim() || !privateKey?.trim()) return null;
  return { subject, publicKey: publicKey.trim(), privateKey: privateKey.trim() };
}

function deliveryProof(
  privateKey: string,
  userId: string,
  endpoint: string,
  message: PushDeliveryMessage,
): Buffer {
  // Fixed tuple order binds the exact raw payload, not its display-normalized form.
  // No legacy endpoint-only fallback: old provider messages cannot prove intent ownership.
  return createHmac('sha256', privateKey)
    .update(
      JSON.stringify([
        'diis-push-delivery-v2',
        userId,
        endpoint,
        message.messageId,
        message.refType,
        message.refId,
        message.title,
        message.body,
        message.url,
        message.tag,
      ]),
    )
    .digest();
}

const deliveryLogSelect = { subject: true, body: true, refType: true, refId: true } as const;
type DeliveryLog = {
  subject: string | null;
  body: string;
  refType: string | null;
  refId: string | null;
};

function notificationTag(logId: string, refType: string | null): string {
  if (refType === 'student_session_attendance')
    return 'att-' + createHash('sha256').update(logId).digest('hex').slice(0, 24);
  return refType === 'class_session_alert' ? 'class-session' : 'report-card';
}

function staleSubscriptionStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' ? statusCode : null;
}

function parseSubscribeDto(dto: SubscribeDto): SubscribeDto {
  const parsed = SubscribeSchema.safeParse(dto);
  if (!parsed.success) throw new BadRequestException('Langganan push tidak valid');
  return parsed.data;
}

function parseUnsubscribeDto(dto: UnsubscribeDto): UnsubscribeDto {
  const parsed = UnsubscribeSchema.safeParse(dto);
  if (!parsed.success) throw new BadRequestException('Endpoint push tidak valid');
  return parsed.data;
}

function readStoredEndpoint(endpoint: string): string | null {
  const parsed = PushEndpointSchema.safeParse(endpoint);
  return parsed.success ? parsed.data : null;
}

function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function reportHref(studentId: string): string {
  return `/dashboard/rapor?studentId=${encodeURIComponent(studentId)}`;
}

function defaultTargetHref(refType: string | null | undefined): string {
  if (refType === 'class_session_alert') return '/dashboard/jadwal#today-class-sessions';
  return refType === 'report-card' ? '/dashboard/rapor' : '/dashboard/akademik';
}

@Injectable()
export class PushService {
  constructor(private readonly prisma: PrismaService) {}

  /** Save a push subscription for the current user */
  async subscribe(dto: SubscribeDto, user: AuthUser) {
    const input = parseSubscribeDto(dto);
    if (!Number.isSafeInteger(user.tokenIssuedAt) || (user.tokenIssuedAt ?? 0) <= 0) {
      throw new UnauthorizedException('Sesi autentikasi tidak memiliki urutan binding yang valid');
    }
    const userId = await resolveUserId(this.prisma, user.keycloakId);
    const bindingIssuedAt = user.tokenIssuedAt!;
    const storedKeys = JSON.stringify({ ...input.keys, bindingIssuedAt });

    // The verified JWT issue time is a monotonic account-binding version. The
    // conditional UPSERT prevents a delayed request from an older login from
    // taking an endpoint back after a newer account session has claimed it.
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "notification"."push_subscriptions" AS current_subscription
        ("user_id", "endpoint", "keys")
      VALUES
        (${userId}::uuid, ${input.endpoint}, ${storedKeys}::jsonb)
      ON CONFLICT ("endpoint") DO UPDATE SET
        "user_id" = EXCLUDED."user_id",
        "keys" = EXCLUDED."keys"
      WHERE CASE
              WHEN current_subscription."keys"->>'bindingIssuedAt' ~ '^[0-9]+$'
                THEN (current_subscription."keys"->>'bindingIssuedAt')::bigint
              ELSE 0
            END < ${bindingIssuedAt}
         OR (
              current_subscription."user_id" = EXCLUDED."user_id"
              AND CASE
                    WHEN current_subscription."keys"->>'bindingIssuedAt' ~ '^[0-9]+$'
                      THEN (current_subscription."keys"->>'bindingIssuedAt')::bigint
                    ELSE 0
                  END = ${bindingIssuedAt}
            )
      RETURNING "id"
    `);

    return { reconciled: rows.length === 1 };
  }

  /** Remove a push subscription */
  async unsubscribe(dto: UnsubscribeDto, user: AuthUser) {
    const input = parseUnsubscribeDto(dto);
    const userId = await resolveUserId(this.prisma, user.keycloakId);
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint: input.endpoint },
    });
    return { unsubscribed: true };
  }

  async verifyDelivery(dto: VerifyPushDeliveryDto, user: AuthUser): Promise<{ deliver: boolean }> {
    const input = VerifyPushDeliverySchema.safeParse(dto);
    if (!input.success) return { deliver: false };
    const vapid = readVapidConfig();
    if (!vapid) return { deliver: false };
    const userId = await resolveUserId(this.prisma, user.keycloakId);
    const owner = await this.prisma.pushSubscription.findFirst({
      where: { endpoint: input.data.endpoint, userId },
      select: { id: true },
    });
    if (!owner) return { deliver: false };
    const { message, endpoint, proof } = input.data;
    const expected = deliveryProof(vapid.privateKey, userId, endpoint, message);
    if (!timingSafeEqual(expected, Buffer.from(proof, 'hex'))) return { deliver: false };
    const log = await this.prisma.notificationLog.findFirst({
      where: {
        id: message.messageId,
        recipient: userId,
        channel: 'push',
        status: { in: ['pending', 'sent'] },
      },
      select: deliveryLogSelect,
    });
    if (
      !log ||
      message.refType !== log.refType ||
      message.refId !== log.refId ||
      message.title !== (log.subject ?? 'Notifikasi DIIS') ||
      message.body !== log.body ||
      message.tag !== notificationTag(message.messageId, log.refType)
    )
      return { deliver: false };
    // Read-only: a provider-accepted intent is normally already sent, not pending.
    const target = await this.resolveNotificationTargetHref(log, userId);
    return { deliver: target !== null && message.url === target };
  }

  async dispatchNotificationLog(
    input: PushLogInput,
  ): Promise<{ attempted: number; staleRemoved: number }> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: input.userId },
      select: { id: true, endpoint: true, keys: true },
      take: 20,
    });
    if (subscriptions.length === 0) {
      logger.info('[PushService] No push subscriptions for notification log', {
        logId: input.logId,
      });
      return { attempted: 0, staleRemoved: 0 };
    }
    const vapid = readVapidConfig();
    if (!vapid) {
      throw new Error('VAPID configuration is not available');
    }
    const log = await this.prisma.notificationLog.findFirst({
      where: { id: input.logId, recipient: input.userId, channel: 'push', status: 'pending' },
      select: deliveryLogSelect,
    });
    if (!log) return { attempted: 0, staleRemoved: 0 };
    const targetHref = await this.resolveNotificationTargetHref(log, input.userId);
    if (!targetHref) return { attempted: 0, staleRemoved: 0 };
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    // Sensitivity comes from the stored intent, never optional caller flags.
    const attendanceTopic =
      log.refType === 'student_session_attendance'
        ? notificationTag(input.logId, log.refType)
        : null;
    const payload = {
      title: log.subject ?? 'Notifikasi DIIS',
      body: log.body,
      url: targetHref,
      tag: notificationTag(input.logId, log.refType),
    };
    const delivery = {
      version: 2 as const,
      messageId: input.logId,
      refType: log.refType,
      refId: log.refId,
    };
    const message = PushDeliveryMessageSchema.parse({ ...delivery, ...payload });
    let attempted = 0;
    let staleRemoved = 0;
    for (const subscription of subscriptions) {
      const endpoint = readStoredEndpoint(subscription.endpoint);
      const keys = readPushKeys(subscription.keys);
      if (!endpoint || !keys) {
        await this.prisma.pushSubscription.delete({ where: { id: subscription.id } });
        staleRemoved++;
        continue;
      }
      try {
        if (input.beforeSend && !(await input.beforeSend())) break;
        attempted++;
        const proof = deliveryProof(vapid.privateKey, input.userId, endpoint, message).toString(
          'hex',
        );
        await webpush.sendNotification(
          {
            endpoint,
            keys,
          },
          JSON.stringify({ ...payload, delivery, deliveryProof: proof }),
          {
            TTL: attendanceTopic ? 60 * 60 * 24 : input.beforeSend ? 60 : 60 * 60 * 24,
            topic: attendanceTopic ?? (input.beforeSend ? 'class-session' : 'report-card'),
          },
        );
      } catch (error) {
        const status = staleSubscriptionStatus(error);
        if (status === 404 || status === 410) {
          await this.prisma.pushSubscription.delete({ where: { id: subscription.id } });
          staleRemoved++;
          continue;
        }
        throw error;
      }
    }
    return { attempted, staleRemoved };
  }

  /** Get push notification logs for the current user. */
  async findMyNotifications(user: AuthUser) {
    const userId = await resolveUserId(this.prisma, user.keycloakId);
    const fetched: PushNotificationLogRow[] = await this.prisma.notificationLog.findMany({
      where: { recipient: userId, channel: 'push' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        channel: true,
        subject: true,
        body: true,
        status: true,
        sentAt: true,
        refType: true,
        refId: true,
        createdAt: true,
      },
    });
    const targets = await Promise.all(
      fetched.map(async (log) =>
        log.refType === 'student_session_attendance'
          ? studentAttendanceNoticeTarget(this.prisma, { ...log, recipient: userId })
          : null,
      ),
    );
    const logs = fetched.filter(
      (log, index) => log.refType !== 'student_session_attendance' || targets[index],
    );
    const targetHrefs = await this.resolveNotificationTargetHrefs(userId, user, logs);
    fetched.forEach((log, index) => {
      if (targets[index]) targetHrefs.set(log.id, targets[index]!);
    });
    return logs.map(({ refId: _refId, ...log }) => ({
      ...log,
      targetHref: targetHrefs.get(log.id) ?? defaultTargetHref(log.refType),
    }));
  }

  private async resolveNotificationTargetHref(
    log: DeliveryLog,
    userId: string,
  ): Promise<string | null> {
    if (log.refType === 'student_session_attendance')
      return studentAttendanceNoticeTarget(this.prisma, { ...log, recipient: userId });
    if (log.refType !== 'report-card' || !isUuid(log.refId)) return defaultTargetHref(log.refType);
    const report = await this.prisma.reportCard.findFirst({
      where: {
        id: log.refId,
        status: 'distributed',
        student: {
          deletedAt: null,
          OR: [{ userId }, { parentId: userId }],
        },
      },
      select: { studentId: true },
    });
    return report ? reportHref(report.studentId) : '/dashboard/rapor';
  }

  private async resolveNotificationTargetHrefs(
    userId: string,
    user: AuthUser,
    logs: PushNotificationLogRow[],
  ): Promise<Map<string, string>> {
    const reportIds = [
      ...new Set(
        logs.flatMap((log) =>
          log.refType === 'report-card' && isUuid(log.refId) ? [log.refId] : [],
        ),
      ),
    ];
    if (reportIds.length === 0) return new Map();

    const ownership: Prisma.StudentWhereInput[] = [];
    if (user.roles.includes('SISWA')) ownership.push({ userId });
    if (user.roles.includes('ORANG_TUA')) ownership.push({ parentId: userId });
    if (ownership.length === 0) return new Map();

    const reports = await this.prisma.reportCard.findMany({
      where: {
        id: { in: reportIds },
        status: 'distributed',
        student: {
          deletedAt: null,
          OR: ownership,
        },
      },
      select: { id: true, studentId: true },
    });
    const reportTargets = new Map(
      reports.map((report) => [report.id, reportHref(report.studentId)]),
    );
    const logTargets = new Map<string, string>();
    for (const log of logs) {
      if (log.refType !== 'report-card' || !log.refId) continue;
      const target = reportTargets.get(log.refId);
      if (target) logTargets.set(log.id, target);
    }
    return logTargets;
  }
}
