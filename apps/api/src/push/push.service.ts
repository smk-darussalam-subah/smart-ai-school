// =============================================================================
// PushService — PWA push notification subscriptions (P16 — W3-6).
// Subscribe/unsubscribe push endpoints + notification list for SISWA/ORTU.
// =============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUserId } from '../common/helpers/role-helpers';
import { SubscribeDto, UnsubscribeDto } from './dto/push.dto';

@Injectable()
export class PushService {
  constructor(private readonly prisma: PrismaService) {}

  /** Save a push subscription for the current user */
  async subscribe(dto: SubscribeDto, user: AuthUser) {
    const userId = await resolveUserId(this.prisma, user.keycloakId);
    // Upsert: if subscription with same endpoint exists for this user, update keys
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { userId_endpoint: { userId, endpoint: dto.endpoint } },
      select: { id: true },
    });
    if (existing) {
      return this.prisma.pushSubscription.update({
        where: { id: existing.id },
        data: { keys: dto.keys as Prisma.InputJsonValue },
      });
    }
    return this.prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: dto.endpoint,
        keys: dto.keys as Prisma.InputJsonValue,
      },
    });
  }

  /** Remove a push subscription */
  async unsubscribe(dto: UnsubscribeDto, user: AuthUser) {
    const userId = await resolveUserId(this.prisma, user.keycloakId);
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint: dto.endpoint },
    });
    return { unsubscribed: true };
  }

  /** Get notification logs for the current user (by phone/email) */
  async findMyNotifications(user: AuthUser) {
    const userId = await resolveUserId(this.prisma, user.keycloakId);
    const userData = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, email: true },
    });
    if (!userData) return [];

    const recipients: string[] = [];
    if (userData.phone) recipients.push(userData.phone);
    recipients.push(userData.email);

    return this.prisma.notificationLog.findMany({
      where: { recipient: { in: recipients } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, recipient: true, channel: true, subject: true,
        body: true, status: true, sentAt: true, refType: true, createdAt: true,
      },
    });
  }
}

