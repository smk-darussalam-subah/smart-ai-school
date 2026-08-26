import { ConflictException, Injectable, MessageEvent, NotFoundException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { DisplayDeviceProfile, Prisma } from '@prisma/client';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import {
  AuthenticatedDisplayDevice,
  DisplayDeviceService,
} from '../display-devices/display-device.service';
import { PrismaService } from '../prisma/prisma.service';
import { DisplayPlaybackLeaseService } from './display-playback-lease.service';

const STREAM_INTERVAL_MS = 5_000;
const STALE_AFTER_SECONDS = 75;
const DISPLAY_PROJECTION_CACHE_MS = 30_000;
const DISPLAY_TREND_LOOKBACK_DAYS = 7;
const DISPLAY_AGENDA_HORIZON_DAYS = 14;

type DisplayAttendancePoint = {
  date: string;
  studentPresent: number;
  studentRecorded: number;
  studentTotal: number;
  teacherPresent: number;
  teacherRecorded: number;
  teacherTotal: number;
};

type DisplayOperationalProjection = {
  attendance: {
    students: { present: number; recorded: number; total: number };
    teachers: { present: number; recorded: number; total: number };
    trend: DisplayAttendancePoint[];
  };
  agenda: Array<{
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    kind: string;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    publishedAt: Date;
    priority: string;
    pinned: boolean;
  }>;
  operations: Array<{
    key: string;
    label: string;
    count: number;
    tone: 'neutral' | 'attention' | 'critical';
  }>;
};

@Injectable()
export class OperationalMonitoringService {
  private readonly projectionCache = new Map<
    string,
    { expiresAt: number; value: DisplayOperationalProjection }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DisplayDeviceService,
    private readonly bells: BellScheduleService,
    private readonly playbackLeases: DisplayPlaybackLeaseService,
  ) {}

  async privateSnapshot(input: { date?: string; classId?: string; status?: string }) {
    const now = new Date();
    const date = input.date ?? this.jakartaDate(now);
    const serviceDate = this.asDate(date);
    const where: Prisma.ClassSessionWhereInput = {
      serviceDate,
      ...(input.classId ? { classId: input.classId } : {}),
      ...(input.status ? { status: input.status as never } : {}),
    };
    const [sessions, statusGroups, activeDevices, activeAlerts] = await Promise.all([
      this.prisma.classSession.findMany({
        where,
        select: {
          id: true,
          classNameSnapshot: true,
          subjectSnapshot: true,
          assignedTeacherName: true,
          roomSnapshot: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          status: true,
          startedAt: true,
          completedAt: true,
          lateByMinutes: true,
        },
        orderBy: [{ scheduledStartAt: 'asc' }, { classNameSnapshot: 'asc' }],
      }),
      this.prisma.classSession.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.displayDevice.findMany({
        where: { status: 'ACTIVE', revokedAt: null },
        select: {
          id: true,
          profile: true,
          label: true,
          status: true,
          lastSeenAt: true,
          expiresAt: true,
          audioEnabled: true,
          isAudibleLeader: true,
          credentialVersion: true,
        },
        orderBy: [{ profile: 'asc' }, { label: 'asc' }],
      }),
      this.prisma.classSessionAlert.count({
        where: { session: where, status: { in: ['PENDING', 'CLAIMED', 'DISPATCHED'] } },
      }),
    ]);
    return {
      date,
      generatedAt: new Date().toISOString(),
      counters: Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all])),
      activeAlerts,
      sessions,
      devices: activeDevices.map((device) => ({
        ...device,
        status: device.expiresAt && device.expiresAt <= now ? 'EXPIRED' : device.status,
        health:
          device.expiresAt && device.expiresAt <= now
            ? 'EXPIRED'
            : !device.lastSeenAt
              ? 'NEVER_CONNECTED'
              : now.getTime() - device.lastSeenAt.getTime() > STALE_AFTER_SECONDS * 1000
                ? 'STALE'
                : 'ONLINE',
      })),
    };
  }

  async deviceSnapshot(credential: string | undefined) {
    const device = await this.devices.authenticateCredential(credential);
    return this.buildDeviceSnapshot(device);
  }

  streamDevice(credential: string | undefined): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let timer: NodeJS.Timeout | null = null;
      let polling = false;
      let stopped = false;
      const poll = async () => {
        if (polling || stopped) return;
        polling = true;
        try {
          const device = await this.devices.authenticateCredential(credential);
          const snapshot = await this.buildDeviceSnapshot(device);
          if (!stopped) subscriber.next({ type: 'snapshot', data: snapshot });
        } catch (error) {
          stopped = true;
          if (timer) clearInterval(timer);
          subscriber.error(error);
        } finally {
          polling = false;
        }
      };
      void poll();
      timer = setInterval(() => void poll(), STREAM_INTERVAL_MS);
      timer.unref?.();
      return () => {
        stopped = true;
        if (timer) clearInterval(timer);
      };
    });
  }

  async markDelivered(credential: string | undefined, deliveryId: string, now = new Date()) {
    const device = await this.devices.authenticateCredential(credential);
    const delivery = await this.findOwnedDelivery(device.id, deliveryId);
    if (['DELIVERED', 'PLAYED', 'ACKNOWLEDGED'].includes(delivery.status)) {
      return { status: delivery.status, transitioned: false };
    }
    if (delivery.status !== 'PENDING')
      throw new ConflictException('Delivery tidak dapat ditandai terkirim');
    const changed = await this.prisma.classSessionAlertDelivery.updateMany({
      where: { id: deliveryId, deviceId: device.id, status: 'PENDING' },
      data: { status: 'DELIVERED', deliveredAt: now },
    });
    if (changed.count !== 1) throw new ConflictException('Delivery telah berubah');
    return { status: 'DELIVERED', transitioned: true };
  }

  async claimPlayback(credential: string | undefined, deliveryId: string) {
    const device = await this.devices.authenticateCredential(credential);
    const delivery = await this.findOwnedDelivery(device.id, deliveryId);
    this.assertAudibleDelivery(device, delivery.audible);
    if (['PLAYED', 'ACKNOWLEDGED'].includes(delivery.status)) {
      return { status: delivery.status, claimed: false };
    }
    if (!['PENDING', 'DELIVERED'].includes(delivery.status))
      throw new ConflictException('Delivery tidak dapat diputar');
    const claim = await this.playbackLeases.claim(device.profile, deliveryId);
    if (!claim) throw new ConflictException('Audio sedang diproses oleh perangkat lain');
    return {
      status: delivery.status,
      claimed: true,
      claimToken: claim.token,
      expiresAt: claim.expiresAt,
    };
  }

  async markPlayed(
    credential: string | undefined,
    deliveryId: string,
    claimToken: string,
    now = new Date(),
  ) {
    const device = await this.devices.authenticateCredential(credential);
    const delivery = await this.findOwnedDelivery(device.id, deliveryId);
    this.assertAudibleDelivery(device, delivery.audible);
    if (['PLAYED', 'ACKNOWLEDGED'].includes(delivery.status)) {
      return { status: delivery.status, transitioned: false };
    }
    if (!['PENDING', 'DELIVERED'].includes(delivery.status))
      throw new ConflictException('Delivery tidak dapat diputar');
    if (!(await this.playbackLeases.assertAndExtend(device.profile, deliveryId, claimToken))) {
      throw new ConflictException('Klaim audio tidak berlaku atau sudah kedaluwarsa');
    }
    const changed = await this.prisma.classSessionAlertDelivery.updateMany({
      where: { id: deliveryId, deviceId: device.id, status: { in: ['PENDING', 'DELIVERED'] } },
      data: {
        status: 'PLAYED',
        deliveredAt: delivery.deliveredAt ?? now,
        playedAt: now,
      },
    });
    if (changed.count !== 1) throw new ConflictException('Delivery telah berubah');
    return { status: 'PLAYED', transitioned: true };
  }

  async releasePlaybackClaim(
    credential: string | undefined,
    deliveryId: string,
    claimToken: string,
  ) {
    const device = await this.devices.authenticateCredential(credential);
    const delivery = await this.findOwnedDelivery(device.id, deliveryId);
    this.assertAudibleDelivery(device, delivery.audible);
    return {
      released: await this.playbackLeases.release(device.profile, deliveryId, claimToken),
    };
  }

  async acknowledge(
    credential: string | undefined,
    deliveryId: string,
    reason?: string,
    now = new Date(),
  ) {
    const device = await this.devices.authenticateCredential(credential);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM academic.class_session_alert_deliveries
        WHERE id = ${deliveryId}::uuid AND device_id = ${device.id}::uuid FOR UPDATE
      `);
      const delivery = await tx.classSessionAlertDelivery.findFirst({
        where: { id: deliveryId, deviceId: device.id },
        include: { alert: { select: { sessionId: true } } },
      });
      if (!delivery) throw new NotFoundException('Delivery tidak ditemukan');
      if (delivery.status === 'CANCELLED') throw new ConflictException('Delivery sudah dibatalkan');
      await tx.classSessionAlertAcknowledgement.createMany({
        data: [{ deliveryId, actorDeviceId: device.id, reason, acknowledgedAt: now }],
        skipDuplicates: true,
      });
      await tx.classSessionAlertDelivery.update({
        where: { id: deliveryId },
        data: { status: 'ACKNOWLEDGED', deliveredAt: delivery.deliveredAt ?? now },
      });
      await tx.classSessionAlert.updateMany({
        where: {
          sessionId: delivery.alert.sessionId,
          stage: 'ESCALATION_T15',
          status: { in: ['PENDING', 'CLAIMED'] },
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: 'DISPLAY_ACKNOWLEDGED',
          claimToken: null,
          claimedAt: null,
          leaseUntil: null,
        },
      });
      await tx.classSessionEvent.createMany({
        data: [
          {
            sessionId: delivery.alert.sessionId,
            eventType: 'ALERT_CANCELLED',
            eventKey: `class-session:display-ack:${deliveryId}`,
            actorType: 'DEVICE',
            actorId: device.id,
            reason: reason ?? 'DISPLAY_ACKNOWLEDGED',
          },
        ],
        skipDuplicates: true,
      });
      return { status: 'ACKNOWLEDGED' };
    });
  }

  private async buildDeviceSnapshot(device: AuthenticatedDisplayDevice) {
    const now = new Date();
    const date = this.jakartaDate(now);
    const serviceDate = this.asDate(date);
    const bell = await this.bells.resolveForDate(serviceDate, 'SCHOOL');
    const [sessions, deliveries, operational] = await Promise.all([
      this.prisma.classSession.findMany({
        where: { serviceDate, status: { notIn: ['CANCELLED', 'SUPERSEDED'] } },
        select: {
          classNameSnapshot: true,
          subjectSnapshot: true,
          assignedTeacherName: true,
          roomSnapshot: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          status: true,
          lateByMinutes: true,
        },
        orderBy: [{ scheduledStartAt: 'asc' }, { classNameSnapshot: 'asc' }],
      }),
      this.prisma.classSessionAlertDelivery.findMany({
        where: {
          deviceId: device.id,
          status: { in: ['PENDING', 'DELIVERED', 'PLAYED'] },
          alert: {
            status: 'DISPATCHED',
            session: { serviceDate, status: { in: ['SCHEDULED', 'REASSIGNED'] } },
          },
        },
        select: {
          id: true,
          status: true,
          audible: true,
          deliveredAt: true,
          playedAt: true,
          alert: {
            select: {
              stage: true,
              dueAt: true,
              session: {
                select: {
                  classNameSnapshot: true,
                  subjectSnapshot: true,
                  assignedTeacherName: true,
                  roomSnapshot: true,
                  scheduledStartAt: true,
                  scheduledEndAt: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.displayOperationalProjection(device.profile, now, serviceDate),
    ]);

    const sessionAllowlist = sessions.map((session) => ({
      className: session.classNameSnapshot,
      subject: session.subjectSnapshot,
      scheduledTeacher: session.assignedTeacherName,
      room: session.roomSnapshot,
      scheduledStartAt: session.scheduledStartAt,
      scheduledEndAt: session.scheduledEndAt,
      status: session.status,
      lateByMinutes: session.lateByMinutes,
    }));
    const deliveryAllowlist = deliveries.map((delivery) => ({
      deliveryId: delivery.id,
      stage: delivery.alert.stage,
      dueAt: delivery.alert.dueAt,
      status: delivery.status,
      audible: device.profile === 'RUANG_GURU' && device.isAudibleLeader && delivery.audible,
      audioText:
        device.profile === 'RUANG_GURU' && device.isAudibleLeader && delivery.audible
          ? `Pengingat pembelajaran untuk ${delivery.alert.session.classNameSnapshot}.`
          : null,
      visual: {
        className: delivery.alert.session.classNameSnapshot,
        subject: delivery.alert.session.subjectSnapshot,
        scheduledTeacher: delivery.alert.session.assignedTeacherName,
        room: delivery.alert.session.roomSnapshot,
        scheduledStartAt: delivery.alert.session.scheduledStartAt,
        scheduledEndAt: delivery.alert.session.scheduledEndAt,
        status: delivery.alert.session.status,
      },
    }));

    return {
      device: {
        profile: device.profile,
        label: device.label,
        audioEnabled: device.audioEnabled,
        audibleLeader: device.isAudibleLeader,
        credentialVersion: device.credentialVersion,
      },
      freshness: { generatedAt: now.toISOString(), staleAfterSeconds: STALE_AFTER_SECONDS },
      bell: {
        code: bell.code,
        name: bell.name,
        timezone: bell.timezone,
        segments: bell.segments.map((segment) => ({
          jpNumber: segment.jpNumber,
          label: segment.label,
          type: segment.type,
          startMinute: segment.startMinute,
          endMinute: segment.endMinute,
        })),
      },
      sessions: sessionAllowlist,
      alerts: deliveryAllowlist,
      attendance: operational.attendance,
      agenda: operational.agenda,
      announcements: operational.announcements,
      operations: operational.operations,
    };
  }

  private async displayOperationalProjection(
    profile: DisplayDeviceProfile,
    now: Date,
    serviceDate: Date,
  ): Promise<DisplayOperationalProjection> {
    const date = this.dateOnly(serviceDate);
    const cacheKey = `${profile}:${date}`;
    const cached = this.projectionCache.get(cacheKey);
    if (cached && cached.expiresAt > now.getTime()) return cached.value;

    const trendFrom = this.shiftDate(serviceDate, -(DISPLAY_TREND_LOOKBACK_DAYS - 1));
    const agendaUntil = this.shiftDate(serviceDate, DISPLAY_AGENDA_HORIZON_DAYS);
    const audienceRole = profile === 'RUANG_GURU' ? 'GURU' : 'TATA_USAHA';
    const [studentGroups, teacherGroups, studentTotal, teacherTotal, agenda, announcements] =
      await Promise.all([
        this.prisma.attendance.groupBy({
          by: ['date', 'status'],
          where: {
            date: { gte: trendFrom, lte: serviceDate },
            student: { status: 'active', deletedAt: null, classId: { not: null } },
          },
          _count: { _all: true },
          orderBy: { date: 'asc' },
        }),
        this.prisma.teacherAttendance.groupBy({
          by: ['date'],
          where: {
            date: { gte: trendFrom, lte: serviceDate },
            teacher: { deletedAt: null },
          },
          _count: { _all: true },
          orderBy: { date: 'asc' },
        }),
        this.prisma.student.count({
          where: { status: 'active', deletedAt: null, classId: { not: null } },
        }),
        this.prisma.teacher.count({ where: { deletedAt: null } }),
        this.prisma.academicCalendar.findMany({
          where: {
            academicYear: { isActive: true },
            endDate: { gte: serviceDate },
            startDate: { lte: agendaUntil },
          },
          select: { id: true, name: true, startDate: true, endDate: true, type: true },
          orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
          take: 6,
        }),
        this.prisma.announcement.findMany({
          where: {
            status: 'published',
            OR: [
              { audience: { array_contains: ['ALL'] } },
              { audience: { array_contains: [audienceRole] } },
            ],
            AND: [
              { OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
              { OR: [{ isPinned: true }, { priority: { in: ['penting', 'urgent'] } }] },
            ],
          },
          select: {
            id: true,
            title: true,
            priority: true,
            isPinned: true,
            publishedAt: true,
            scheduledAt: true,
            createdAt: true,
          },
          orderBy: [
            { isPinned: 'desc' },
            { publishedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
          ],
          take: 6,
        }),
      ]);

    const points = new Map<
      string,
      {
        studentPresent: number;
        studentRecorded: number;
        teacherPresent: number;
        teacherRecorded: number;
      }
    >();
    for (const group of studentGroups) {
      const key = this.dateOnly(group.date);
      const point = points.get(key) ?? {
        studentPresent: 0,
        studentRecorded: 0,
        teacherPresent: 0,
        teacherRecorded: 0,
      };
      point.studentRecorded += group._count._all;
      if (group.status === 'hadir') point.studentPresent += group._count._all;
      points.set(key, point);
    }
    for (const group of teacherGroups) {
      const key = this.dateOnly(group.date);
      const point = points.get(key) ?? {
        studentPresent: 0,
        studentRecorded: 0,
        teacherPresent: 0,
        teacherRecorded: 0,
      };
      point.teacherPresent = group._count._all;
      point.teacherRecorded = group._count._all;
      points.set(key, point);
    }

    const trend = [...points.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-5)
      .map(([pointDate, point]) => ({
        date: pointDate,
        ...point,
        studentTotal,
        teacherTotal,
      }));
    const today = points.get(date);
    const operations = profile === 'RUANG_TU' ? await this.tuOperations() : [];
    const value: DisplayOperationalProjection = {
      attendance: {
        students: {
          present: today?.studentPresent ?? 0,
          recorded: today?.studentRecorded ?? 0,
          total: studentTotal,
        },
        teachers: {
          present: today?.teacherPresent ?? 0,
          recorded: today?.teacherRecorded ?? 0,
          total: teacherTotal,
        },
        trend,
      },
      agenda: agenda.map((item) => ({
        id: item.id,
        title: item.name,
        startsAt: item.startDate,
        endsAt: item.endDate,
        kind: item.type,
      })),
      announcements: announcements.map((item) => ({
        id: item.id,
        title: item.title,
        publishedAt: item.scheduledAt ?? item.publishedAt ?? item.createdAt,
        priority: item.priority,
        pinned: item.isPinned,
      })),
      operations,
    };
    if (this.projectionCache.size > 4) this.projectionCache.clear();
    this.projectionCache.set(cacheKey, {
      expiresAt: now.getTime() + DISPLAY_PROJECTION_CACHE_MS,
      value,
    });
    return value;
  }

  private async tuOperations(): Promise<DisplayOperationalProjection['operations']> {
    const [onboarding, ppdb, placement, finance] = await Promise.all([
      this.prisma.user.count({
        where: {
          isActive: true,
          deletedAt: null,
          consentAt: null,
          role: { in: ['SISWA', 'ORANG_TUA'] },
        },
      }),
      this.prisma.ppdbLead.count({
        where: { status: { in: ['new', 'contacted', 'interested'] } },
      }),
      this.prisma.student.count({
        where: { status: 'active', deletedAt: null, classId: null },
      }),
      this.prisma.sppPayment.count({
        where: { status: { in: ['unpaid', 'late'] } },
      }),
    ]);
    return [
      {
        key: 'onboarding',
        label: 'Onboarding belum tuntas',
        count: onboarding,
        tone: onboarding ? 'attention' : 'neutral',
      },
      {
        key: 'ppdb',
        label: 'PPDB perlu tindak lanjut',
        count: ppdb,
        tone: ppdb ? 'attention' : 'neutral',
      },
      {
        key: 'placement',
        label: 'Siswa belum ditempatkan',
        count: placement,
        tone: placement ? 'critical' : 'neutral',
      },
      {
        key: 'finance',
        label: 'SPP perlu proses',
        count: finance,
        tone: finance ? 'attention' : 'neutral',
      },
    ];
  }

  private async findOwnedDelivery(deviceId: string, deliveryId: string) {
    const delivery = await this.prisma.classSessionAlertDelivery.findFirst({
      where: { id: deliveryId, deviceId },
      select: { id: true, status: true, audible: true, deliveredAt: true },
    });
    if (!delivery) throw new NotFoundException('Delivery tidak ditemukan');
    return delivery;
  }

  private assertAudibleDelivery(device: AuthenticatedDisplayDevice, audible: boolean): void {
    if (
      !audible ||
      !device.audioEnabled ||
      !device.isAudibleLeader ||
      device.profile !== 'RUANG_GURU'
    ) {
      throw new ConflictException('Perangkat ini bukan pemimpin audio untuk delivery tersebut');
    }
  }

  private jakartaDate(value: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }

  private asDate(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private dateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private shiftDate(value: Date, days: number) {
    const shifted = new Date(value);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted;
  }
}
