jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));
import * as webpush from 'web-push';
import { PushService } from '../push/push.service';
import type { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'node:crypto';
import { PermissionsService } from '../permissions/permissions.service';

describe('session reminder final send fence (transport is synthetic)', () => {
  it('student attendance keeps per-intent delivery and a full-day TTL with a fresh send fence', async () => {
    const savedPublic = process.env.VAPID_PUBLIC_KEY,
      savedPrivate = process.env.VAPID_PRIVATE_KEY;
    process.env.VAPID_PUBLIC_KEY = 'synthetic-public';
    process.env.VAPID_PRIVATE_KEY = 'synthetic-private';
    const send = jest.mocked(webpush.sendNotification);
    send.mockReset();
    send.mockResolvedValue({} as never);
    const records = [{ jp: 1, status: 'alpha', notes: null, revision: 1 }];
    const hash = createHash('sha256')
      .update(JSON.stringify([[1, 'alpha', null, 1]]))
      .digest('hex')
      .slice(0, 24);
    const permission = jest
      .spyOn(PermissionsService.prototype, 'hasFreshPermission')
      .mockResolvedValue(true);
    const service = new PushService({
      pushSubscription: {
        findMany: async () => [
          {
            id: 's',
            endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic',
            keys: { p256dh: 'synthetic-p', auth: 'synthetic-a' },
          },
        ],
      },
      notificationLog: {
        findFirst: async () => ({
          subject: 'Kehadiran',
          body: 'Sintetis',
          refType: 'student_session_attendance',
          refId: `12000000-0000-4000-8000-000000000002:12000000-0000-4000-8000-000000000003:${hash}`,
        }),
      },
      student: { findFirst: async () => ({ parent: { keycloakId: 'synthetic' } }) },
      classSession: {
        findFirst: async () => ({
          serviceDate: new Date('2026-10-22'),
          academicYear: { code: '2026/2027' },
          semester: { number: 1 },
        }),
      },
      studentSessionAttendance: { findMany: async () => records },
    } as unknown as PrismaService);
    const fence = jest.fn(async () => true);
    try {
      await service.dispatchNotificationLog({
        logId: '12000000-0000-4000-8000-000000000001',
        userId: 'synthetic-parent',
        title: 'Kehadiran',
        body: 'Sintetis',
        kind: 'student-attendance',
        beforeSend: fence,
      });
      expect(fence).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]![2]).toMatchObject({
        TTL: 86400,
        topic: expect.stringMatching(/^att-[0-9a-f]{24}$/),
      });
      expect(JSON.parse(String(send.mock.calls[0]![1]!)).tag).toMatch(/^att-/);
    } finally {
      permission.mockRestore();
      if (savedPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
      else process.env.VAPID_PUBLIC_KEY = savedPublic;
      if (savedPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
      else process.env.VAPID_PRIVATE_KEY = savedPrivate;
    }
  });
  it.each([0, 1])(
    'checks fresh intent before each endpoint and stops after %i permitted sends',
    async (permitted) => {
      const savedPublic = process.env.VAPID_PUBLIC_KEY,
        savedPrivate = process.env.VAPID_PRIVATE_KEY;
      process.env.VAPID_PUBLIC_KEY = 'synthetic-public';
      process.env.VAPID_PRIVATE_KEY = 'synthetic-private';
      const send = jest.mocked(webpush.sendNotification);
      send.mockReset();
      send.mockResolvedValue({} as never);
      const findMany = jest.fn().mockResolvedValue(
        [1, 2].map((index) => ({
          id: `synthetic-${index}`,
          endpoint: `https://fcm.googleapis.com/fcm/send/synthetic-${index}`,
          keys: { p256dh: 'synthetic-p', auth: 'synthetic-a' },
        })),
      );
      const service = new PushService({
        pushSubscription: { findMany },
        notificationLog: {
          findFirst: async () => ({
            subject: 'Pengingat',
            body: 'Sintetis',
            refType: 'class_session_alert',
            refId: '10000000-0000-4000-8000-000000000001',
          }),
        },
      } as unknown as PrismaService);
      let count = 0;
      const beforeSend = jest.fn(async () => count++ < permitted);
      try {
        expect(
          await service.dispatchNotificationLog({
            logId: '12000000-0000-4000-8000-000000000001',
            userId: 'diis-account-id',
            title: 'Pengingat',
            body: 'Sintetis',
            beforeSend,
          }),
        ).toEqual({ attempted: permitted, staleRemoved: 0 });
        expect(findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { userId: 'diis-account-id' } }),
        );
        expect(beforeSend).toHaveBeenCalledTimes(permitted + 1);
        expect(send).toHaveBeenCalledTimes(permitted);
        if (permitted) {
          expect(JSON.parse(String(send.mock.calls[0]![1]!))).toMatchObject({
            url: '/dashboard/jadwal#today-class-sessions',
            tag: 'class-session',
          });
          expect(send.mock.calls[0]![2]).toMatchObject({ TTL: 60, topic: 'class-session' });
        }
      } finally {
        if (savedPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
        else process.env.VAPID_PUBLIC_KEY = savedPublic;
        if (savedPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
        else process.env.VAPID_PRIVATE_KEY = savedPrivate;
      }
    },
  );
});
