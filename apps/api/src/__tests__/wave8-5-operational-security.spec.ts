import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import {
  ActivateDisplayDeviceSchema,
  CreateDisplayPairingSchema,
} from '../display-devices/display-device.dto';
import { DisplayDeviceService } from '../display-devices/display-device.service';
import { PublicKioskService } from '../public-kiosk/public-kiosk.service';
import { SchoolConfigService } from '../school-config/school-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { serializeDisplayEvent } from '../operational-monitoring/operational-monitoring.controller';
import { DisplayPlaybackLeaseService } from '../operational-monitoring/display-playback-lease.service';
import { OperationalMonitoringService } from '../operational-monitoring/operational-monitoring.service';

const playbackLeases = {
  claim: jest.fn(),
  assertAndExtend: jest.fn(),
  release: jest.fn(),
} as unknown as DisplayPlaybackLeaseService;

const profile = {
  id: '10000000-0000-4000-8000-000000000001',
  code: 'REGULAR',
  name: 'Reguler',
  scope: 'SCHOOL',
  kind: 'NORMAL',
  timezone: 'Asia/Jakarta',
  effectiveFrom: new Date('2026-01-01'),
  effectiveUntil: null,
  provenance: 'test',
  createdBy: null,
  revokedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  segments: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      profileId: '10000000-0000-4000-8000-000000000001',
      jpNumber: 1,
      label: 'JP 1',
      type: 'INSTRUCTION',
      startMinute: 450,
      endMinute: 490,
      sortOrder: 1,
      createdAt: new Date(),
    },
  ],
};

describe('Wave 8.5 bell resolver and strict DTO boundary', () => {
  it('fails closed when profile is missing or ambiguous', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([profile, { ...profile, id: '10000000-0000-4000-8000-000000000002' }]);
    const service = new BellScheduleService({
      bellScheduleProfile: { findMany },
    } as unknown as PrismaService);
    await expect(service.resolveForDate('2026-08-24')).rejects.toThrow(ServiceUnavailableException);
    await expect(service.resolveForDate('2026-08-24')).rejects.toThrow(ServiceUnavailableException);
  });

  it('resolves exactly one authoritative Asia/Jakarta profile', async () => {
    const service = new BellScheduleService({
      bellScheduleProfile: { findMany: jest.fn().mockResolvedValue([profile]) },
    } as unknown as PrismaService);
    await expect(service.resolveForDate('2026-08-24')).resolves.toMatchObject({
      code: 'REGULAR',
      timezone: 'Asia/Jakarta',
    });
    expect(service.resolveInstructionWindow('2026-08-24', profile, 1, 1)).toEqual({
      startAt: new Date('2026-08-24T07:30:00.000+07:00'),
      endAt: new Date('2026-08-24T08:10:00.000+07:00'),
    });
  });

  it('rejects overlap and unknown DTO fields before persistence', async () => {
    const service = new BellScheduleService({} as PrismaService);
    await expect(
      service.create(
        {
          code: 'TEST',
          name: 'Test',
          scope: 'SCHOOL',
          kind: 'NORMAL',
          effectiveFrom: '2026-08-24',
          provenance: 'test',
          segments: [
            {
              jpNumber: 1,
              label: 'JP1',
              type: 'INSTRUCTION',
              startMinute: 450,
              endMinute: 500,
              sortOrder: 1,
            },
            {
              jpNumber: 2,
              label: 'JP2',
              type: 'INSTRUCTION',
              startMinute: 490,
              endMinute: 530,
              sortOrder: 2,
            },
          ],
        },
        'actor',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(
      CreateDisplayPairingSchema.safeParse({ profile: 'RUANG_GURU', label: 'TV', rogue: true })
        .success,
    ).toBe(false);
    expect(
      ActivateDisplayDeviceSchema.safeParse({ deviceId: crypto.randomUUID(), pairingCode: 'short' })
        .success,
    ).toBe(false);
  });
});

describe('Wave 8.5 pairing credential invariants', () => {
  it('allows only the configured web origin for public activation', () => {
    const previous = process.env.WEB_URL;
    process.env.WEB_URL = 'https://staging.school.test';
    const service = new DisplayDeviceService({} as PrismaService);
    try {
      expect(() =>
        service.assertTrustedActivationOrigin('https://staging.school.test'),
      ).not.toThrow();
      expect(() => service.assertTrustedActivationOrigin('https://evil.test')).toThrow(
        ForbiddenException,
      );
      expect(() => service.assertTrustedActivationOrigin(undefined)).toThrow(ForbiddenException);
    } finally {
      if (previous === undefined) delete process.env.WEB_URL;
      else process.env.WEB_URL = previous;
    }
  });

  it('serializes an SSE event as bounded JSON without header injection', () => {
    expect(
      serializeDisplayEvent({
        type: 'snapshot\r\nforged',
        id: 'event-1\r\nretry: 0',
        data: { profile: 'RUANG_TU', secret: undefined },
      }),
    ).toBe('event: snapshotforged\nid: event-1retry: 0\ndata: {"profile":"RUANG_TU"}\n\n');
  });

  function buildActivation(options?: { consumed?: number; expired?: boolean }) {
    const updateDevice = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      displayPairingChallenge: {
        findFirst: jest.fn().mockResolvedValue({
          id: '30000000-0000-4000-8000-000000000001',
          challengeHash: 'ignored',
          expiresAt: options?.expired ? new Date(Date.now() - 1) : new Date(Date.now() + 60_000),
          attempts: 0,
          maxAttempts: 5,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: options?.consumed ?? 1 }),
      },
      displayDevice: {
        updateMany: updateDevice,
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: '40000000-0000-4000-8000-000000000001',
          profile: 'RUANG_GURU',
          label: 'TV Guru',
          expiresAt: null,
          credentialVersion: 1,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    return {
      service: new DisplayDeviceService(prisma as unknown as PrismaService),
      tx,
      updateDevice,
    };
  }

  it('returns a high-entropy credential once and stores only SHA-256', async () => {
    const { service, tx, updateDevice } = buildActivation();
    const code = 'valid-code-123';
    const hash = (service as unknown as { hash(value: string): string }).hash(code);
    tx.displayPairingChallenge.findFirst.mockResolvedValue({
      id: '30000000-0000-4000-8000-000000000001',
      challengeHash: hash,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      maxAttempts: 5,
    });
    const result = await service.activate('40000000-0000-4000-8000-000000000001', code);
    expect(result.credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const written = updateDevice.mock.calls[0]?.[0]?.data?.credentialHash as string;
    expect(written).toMatch(/^[a-f0-9]{64}$/);
    expect(written).not.toBe(result.credential);
  });

  it('rejects replay/expired challenge generically and CAS permits one winner', async () => {
    const replay = buildActivation({ consumed: 0 });
    const hash = (replay.service as unknown as { hash(value: string): string }).hash(
      'valid-code-123',
    );
    replay.tx.displayPairingChallenge.findFirst.mockResolvedValue({
      id: '30000000-0000-4000-8000-000000000001',
      challengeHash: hash,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      maxAttempts: 5,
    });
    await expect(
      replay.service.activate('40000000-0000-4000-8000-000000000001', 'valid-code-123'),
    ).rejects.toThrow(UnauthorizedException);

    const expired = buildActivation({ expired: true });
    await expect(
      expired.service.activate('40000000-0000-4000-8000-000000000001', 'valid-code-123'),
    ).rejects.toThrow('Aktivasi perangkat gagal');
  });

  it('commits each wrong attempt and locks the challenge after five failures', async () => {
    let attempts = 0;
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      displayPairingChallenge: {
        findFirst: jest.fn().mockImplementation(async () => ({
          id: '30000000-0000-4000-8000-000000000001',
          challengeHash: 'not-the-submitted-hash',
          expiresAt: new Date(Date.now() + 60_000),
          attempts,
          maxAttempts: 5,
        })),
        updateMany: jest.fn().mockImplementation(async () => {
          attempts += 1;
          return { count: 1 };
        }),
      },
      displayDevice: {
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    const service = new DisplayDeviceService({
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService);

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await expect(
        service.activate('40000000-0000-4000-8000-000000000001', 'wrong-code-123'),
      ).rejects.toThrow('Aktivasi perangkat gagal');
      expect(attempts).toBe(Math.min(attempt, 5));
    }
    expect(tx.displayDevice.updateMany).not.toHaveBeenCalled();
  });

  it('derives expired credentials as non-active in management and monitoring projections', async () => {
    const now = new Date('2026-08-24T03:00:00.000Z');
    const expired = {
      id: '40000000-0000-4000-8000-000000000001',
      profile: 'RUANG_GURU',
      label: 'TV Guru',
      status: 'ACTIVE',
      credentialVersion: 1,
      expiresAt: new Date('2026-08-24T02:59:59.000Z'),
      activatedAt: new Date('2026-08-24T01:00:00.000Z'),
      lastSeenAt: new Date('2026-08-24T02:59:58.000Z'),
      revokedAt: null,
      audioEnabled: true,
      isAudibleLeader: true,
      createdAt: new Date('2026-08-24T00:00:00.000Z'),
      updatedAt: new Date('2026-08-24T02:00:00.000Z'),
    };
    const deviceService = new DisplayDeviceService({
      displayDevice: { findMany: jest.fn().mockResolvedValue([expired]) },
    } as unknown as PrismaService);
    await expect(deviceService.list(now)).resolves.toEqual([
      expect.objectContaining({ status: 'EXPIRED' }),
    ]);

    jest.useFakeTimers().setSystemTime(now);
    try {
      const monitoring = new OperationalMonitoringService(
        {
          classSession: {
            findMany: jest.fn().mockResolvedValue([]),
            groupBy: jest.fn().mockResolvedValue([]),
          },
          displayDevice: { findMany: jest.fn().mockResolvedValue([expired]) },
          classSessionAlert: { count: jest.fn().mockResolvedValue(0) },
        } as unknown as PrismaService,
        deviceService,
        {} as BellScheduleService,
        playbackLeases,
      );
      await expect(monitoring.privateSnapshot({ date: '2026-08-24' })).resolves.toMatchObject({
        devices: [expect.objectContaining({ status: 'EXPIRED', health: 'EXPIRED' })],
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('authenticates profile only from stored credential and rejects revoked/forged credentials', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: '40000000-0000-4000-8000-000000000001',
        profile: 'RUANG_TU',
        label: 'TV TU',
        audioEnabled: false,
        isAudibleLeader: false,
        credentialVersion: 2,
      })
      .mockResolvedValueOnce(null);
    const service = new DisplayDeviceService({
      displayDevice: { findFirst, updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as PrismaService);
    await expect(service.authenticateCredential('x'.repeat(43))).resolves.toMatchObject({
      profile: 'RUANG_TU',
    });
    await expect(service.authenticateCredential('y'.repeat(43))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('Wave 8.5 legacy kiosk cutover', () => {
  it('always rejects legacy kiosk validation and link management', async () => {
    const school = new SchoolConfigService(
      {} as PrismaService,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(school.validateKioskToken('legacy-token')).resolves.toBe(false);
    await expect(school.getKioskToken()).rejects.toThrow(GoneException);
    await expect(school.regenerateKioskToken()).rejects.toThrow(GoneException);
  });

  it('returns only generic pairing guidance from the old public service', async () => {
    const service = new PublicKioskService(
      {} as PrismaService,
      {} as never,
      { validateKioskToken: jest.fn().mockResolvedValue(false) } as unknown as SchoolConfigService,
    );
    await expect(service.getKiosk('legacy-token')).rejects.toThrow(ForbiddenException);
    await expect(service.getKiosk('legacy-token')).rejects.toThrow(/pairing Display Sekolah/);
  });
});

describe('Wave 8.5 durable display playback', () => {
  const device = {
    id: '40000000-0000-4000-8000-000000000001',
    profile: 'RUANG_GURU' as const,
    label: 'TV Guru',
    audioEnabled: true,
    isAudibleLeader: true,
    credentialVersion: 1,
  };

  function buildService(status: 'PENDING' | 'PLAYED', changed = 1) {
    const updateMany = jest.fn().mockResolvedValue({ count: changed });
    const prisma = {
      classSessionAlertDelivery: {
        findFirst: jest.fn().mockResolvedValue({
          id: '50000000-0000-4000-8000-000000000001',
          status,
          audible: true,
          deliveredAt: status === 'PLAYED' ? new Date() : null,
        }),
        updateMany,
      },
    };
    const devices = { authenticateCredential: jest.fn().mockResolvedValue(device) };
    const leases = {
      claim: jest.fn().mockResolvedValue({
        token: '60000000-0000-4000-8000-000000000001',
        expiresAt: '2026-08-25T03:00:45.000Z',
      }),
      assertAndExtend: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(true),
    };
    return {
      service: new OperationalMonitoringService(
        prisma as unknown as PrismaService,
        devices as unknown as DisplayDeviceService,
        {} as BellScheduleService,
        leases as unknown as DisplayPlaybackLeaseService,
      ),
      updateMany,
      leases,
    };
  }

  it('claims before playback and fences the PLAYED transition with the winning token', async () => {
    const first = buildService('PENDING');
    await expect(first.service.claimPlayback('opaque', 'delivery-1')).resolves.toMatchObject({
      claimed: true,
      claimToken: '60000000-0000-4000-8000-000000000001',
    });
    await expect(
      first.service.markPlayed('opaque', 'delivery-1', '60000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual({
      status: 'PLAYED',
      transitioned: true,
    });
    expect(first.leases.assertAndExtend).toHaveBeenCalledWith(
      'RUANG_GURU',
      'delivery-1',
      '60000000-0000-4000-8000-000000000001',
    );
    expect(first.updateMany).toHaveBeenCalledTimes(1);

    const replay = buildService('PLAYED');
    await expect(
      replay.service.markPlayed('opaque', 'delivery-1', '60000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual({
      status: 'PLAYED',
      transitioned: false,
    });
    expect(replay.updateMany).not.toHaveBeenCalled();
  });

  it('allows only one concurrent playback claim and rejects a stale claimant', async () => {
    const first = buildService('PENDING');
    first.leases.claim
      .mockResolvedValueOnce({
        token: '60000000-0000-4000-8000-000000000001',
        expiresAt: '2026-08-25T03:00:45.000Z',
      })
      .mockResolvedValueOnce(null);

    const results = await Promise.allSettled([
      first.service.claimPlayback('opaque', 'delivery-1'),
      first.service.claimPlayback('opaque', 'delivery-1'),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);

    first.leases.assertAndExtend.mockResolvedValueOnce(false);
    await expect(
      first.service.markPlayed('opaque', 'delivery-1', '60000000-0000-4000-8000-000000000099'),
    ).rejects.toThrow('Klaim audio tidak berlaku');
    expect(first.updateMany).not.toHaveBeenCalled();
  });
});

describe('Wave 8.5 display operational projection', () => {
  it('projects real aggregates, active-year agenda, and curated announcements without PII', async () => {
    const now = new Date('2026-08-25T03:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    try {
      const prisma = {
        classSession: { findMany: jest.fn().mockResolvedValue([]) },
        classSessionAlertDelivery: { findMany: jest.fn().mockResolvedValue([]) },
        attendance: {
          groupBy: jest.fn().mockResolvedValue([
            { date: new Date('2026-08-24'), status: 'hadir', _count: { _all: 18 } },
            { date: new Date('2026-08-24'), status: 'izin', _count: { _all: 2 } },
            { date: new Date('2026-08-25'), status: 'hadir', _count: { _all: 19 } },
            { date: new Date('2026-08-25'), status: 'sakit', _count: { _all: 1 } },
          ]),
        },
        teacherAttendance: {
          groupBy: jest.fn().mockResolvedValue([
            { date: new Date('2026-08-24'), _count: { _all: 7 } },
            { date: new Date('2026-08-25'), _count: { _all: 8 } },
          ]),
        },
        student: { count: jest.fn().mockResolvedValue(20) },
        teacher: { count: jest.fn().mockResolvedValue(10) },
        academicCalendar: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'calendar-1',
              name: 'Rapat Evaluasi Bulanan',
              startDate: new Date('2026-08-26'),
              endDate: new Date('2026-08-26'),
              type: 'event',
              description: 'Tidak boleh masuk proyeksi',
            },
          ]),
        },
        announcement: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'announcement-1',
              title: 'Pemeliharaan jaringan sekolah',
              priority: 'penting',
              isPinned: true,
              publishedAt: new Date('2026-08-25T02:00:00.000Z'),
              scheduledAt: null,
              createdAt: new Date('2026-08-25T01:00:00.000Z'),
              content: 'Nomor telepon dan data privat tidak boleh ikut',
              audience: ['GURU'],
              createdBy: 'internal-user-id',
            },
          ]),
        },
      };
      const device = {
        id: '40000000-0000-4000-8000-000000000001',
        profile: 'RUANG_GURU' as const,
        label: 'Display Guru QA',
        audioEnabled: true,
        isAudibleLeader: true,
        credentialVersion: 1,
      };
      const service = new OperationalMonitoringService(
        prisma as unknown as PrismaService,
        {
          authenticateCredential: jest.fn().mockResolvedValue(device),
        } as unknown as DisplayDeviceService,
        {
          resolveForDate: jest.fn().mockResolvedValue(profile),
        } as unknown as BellScheduleService,
        playbackLeases,
      );

      const result = await service.deviceSnapshot('opaque');

      expect(result.attendance).toEqual({
        students: { present: 19, recorded: 20, total: 20 },
        teachers: { present: 8, recorded: 8, total: 10 },
        trend: [
          {
            date: '2026-08-24',
            studentPresent: 18,
            studentRecorded: 20,
            studentTotal: 20,
            teacherPresent: 7,
            teacherRecorded: 7,
            teacherTotal: 10,
          },
          {
            date: '2026-08-25',
            studentPresent: 19,
            studentRecorded: 20,
            studentTotal: 20,
            teacherPresent: 8,
            teacherRecorded: 8,
            teacherTotal: 10,
          },
        ],
      });
      expect(result.agenda).toEqual([
        expect.objectContaining({ id: 'calendar-1', title: 'Rapat Evaluasi Bulanan' }),
      ]);
      expect(result.announcements).toEqual([
        expect.objectContaining({ id: 'announcement-1', title: 'Pemeliharaan jaringan sekolah' }),
      ]);
      expect(JSON.stringify(result)).not.toMatch(
        /Nomor telepon|data privat|internal-user-id|description/i,
      );
      expect(prisma.academicCalendar.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ academicYear: { isActive: true } }),
        }),
      );
      expect(prisma.attendance.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: { status: 'active', deletedAt: null, classId: { not: null } },
          }),
        }),
      );
      expect(prisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ audience: { array_contains: ['GURU'] } }]),
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('projects real TU queue counts instead of a false empty state', async () => {
    const prisma = {
      classSession: { findMany: jest.fn().mockResolvedValue([]) },
      classSessionAlertDelivery: { findMany: jest.fn().mockResolvedValue([]) },
      attendance: { groupBy: jest.fn().mockResolvedValue([]) },
      teacherAttendance: { groupBy: jest.fn().mockResolvedValue([]) },
      student: { count: jest.fn().mockResolvedValueOnce(120).mockResolvedValueOnce(3) },
      teacher: { count: jest.fn().mockResolvedValue(15) },
      academicCalendar: { findMany: jest.fn().mockResolvedValue([]) },
      announcement: { findMany: jest.fn().mockResolvedValue([]) },
      user: { count: jest.fn().mockResolvedValue(4) },
      ppdbLead: { count: jest.fn().mockResolvedValue(6) },
      sppPayment: { count: jest.fn().mockResolvedValue(8) },
    };
    const service = new OperationalMonitoringService(
      prisma as unknown as PrismaService,
      {
        authenticateCredential: jest.fn().mockResolvedValue({
          id: '40000000-0000-4000-8000-000000000002',
          profile: 'RUANG_TU',
          label: 'Display TU QA',
          audioEnabled: false,
          isAudibleLeader: false,
          credentialVersion: 1,
        }),
      } as unknown as DisplayDeviceService,
      { resolveForDate: jest.fn().mockResolvedValue(profile) } as unknown as BellScheduleService,
      playbackLeases,
    );

    await expect(service.deviceSnapshot('opaque')).resolves.toMatchObject({
      operations: [
        { key: 'onboarding', count: 4 },
        { key: 'ppdb', count: 6 },
        { key: 'placement', count: 3 },
        { key: 'finance', count: 8 },
      ],
    });
  });
});
