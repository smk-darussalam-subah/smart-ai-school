// =============================================================================
// PushService — PWA push notification subscriptions (P16 — W3-6).
// Subscribe/unsubscribe push endpoints + notification list for SISWA/ORTU.
// =============================================================================

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUserId } from '../common/helpers/role-helpers';
import {
  PushEndpointSchema,
  SubscribeDto,
  SubscribeSchema,
  UnsubscribeDto,
  UnsubscribeSchema,
} from './dto/push.dto';

interface PushLogInput {
  logId: string;
  userId: string;
  title: string;
  body: string;
}

interface StoredPushKeys {
  p256dh: string;
  auth: string;
}

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

@Injectable()
export class PushService {
  constructor(private readonly prisma: PrismaService) {}

  /** Save a push subscription for the current user */
  async subscribe(dto: SubscribeDto, user: AuthUser) {
    const input = parseSubscribeDto(dto);
    const userId = await resolveUserId(this.prisma, user.keycloakId);
    // Upsert: if subscription with same endpoint exists for this user, update keys
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { userId_endpoint: { userId, endpoint: input.endpoint } },
      select: { id: true },
    });
    if (existing) {
      return this.prisma.pushSubscription.update({
        where: { id: existing.id },
        data: { keys: input.keys as Prisma.InputJsonValue },
      });
    }
    return this.prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: input.endpoint,
        keys: input.keys as Prisma.InputJsonValue,
      },
    });
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

  async dispatchNotificationLog(input: PushLogInput): Promise<{ attempted: number; staleRemoved: number }> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: input.userId },
      select: { id: true, endpoint: true, keys: true },
      take: 20,
    });
    if (subscriptions.length === 0) {
      logger.info('[PushService] No push subscriptions for notification log', { logId: input.logId });
      return { attempted: 0, staleRemoved: 0 };
    }
    const vapid = readVapidConfig();
    if (!vapid) {
      throw new Error('VAPID configuration is not available');
    }
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    const payload = JSON.stringify({
      title: input.title,
      body: input.body,
      url: '/dashboard/rapor',
      tag: `report-card:${input.logId}`,
    });
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
      attempted++;
      try {
        await webpush.sendNotification({
          endpoint,
          keys,
        }, payload, {
          TTL: 60 * 60 * 24,
          topic: 'report-card',
        });
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
    return this.prisma.notificationLog.findMany({
      where: { recipient: userId, channel: 'push' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, channel: true, subject: true,
        body: true, status: true, sentAt: true, refType: true, createdAt: true,
      },
    });
  }
}
