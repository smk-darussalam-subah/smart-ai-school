// =============================================================================
// public-kiosk.spec.ts — PublicKioskService (R3): gerbang token + agregat.
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { PublicKioskController } from '../public-kiosk/public-kiosk.controller';
import { PublicKioskService } from '../public-kiosk/public-kiosk.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { SchoolConfigService } from '../school-config/school-config.service';

function build(school: Partial<SchoolConfigService>, prisma: unknown = {}, attendance: unknown = {}) {
  return Test.createTestingModule({
    providers: [
      PublicKioskService,
      { provide: PrismaService, useValue: prisma },
      { provide: AttendanceService, useValue: attendance },
      { provide: SchoolConfigService, useValue: school },
    ],
  }).compile().then((m: TestingModule) => m.get(PublicKioskService));
}

describe('PublicKioskService', () => {
  it('token tidak valid → ForbiddenException (tak ekspos data)', async () => {
    const svc = await build({ validateKioskToken: jest.fn().mockResolvedValue(false) });
    await expect(svc.getKiosk('salah')).rejects.toThrow(ForbiddenException);
  });

  it('token valid → balikan agregat (tanpa PII)', async () => {
    const school = {
      validateKioskToken: jest.fn().mockResolvedValue(true),
      getProfile: jest.fn().mockResolvedValue({ name: 'SMK Darussalam Subah' }),
      getCalendarEvents: jest.fn().mockResolvedValue([]),
    } as Partial<SchoolConfigService>;
    const attendance = { heatmap: jest.fn().mockResolvedValue({ dates: ['2026-06-15'], classes: [], overall: { today: { pct: 90 } } }) };
    const prisma = {
      teacherAttendance: { count: jest.fn().mockResolvedValue(8) },
      teacher: { count: jest.fn().mockResolvedValue(10) },
      class: { count: jest.fn().mockResolvedValue(12) },
      schedule: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = await build(school, prisma, attendance);
    const res = await svc.getKiosk('benar');
    expect(res.schoolName).toBe('SMK Darussalam Subah');
    expect(res.kpi.teacherHadir).toBe(8);
    expect(res.kpi.totalGuru).toBe(10);
    expect(res.health.breakdown.find((b) => b.label === 'Kehadiran Guru')?.pct).toBe(80); // 8/10
    // tak ada field nama siswa di payload
    expect(JSON.stringify(res)).not.toMatch(/student.*fullName|nama siswa/i);
  });
});

describe('PublicKioskController', () => {
  it('menolak token query string dan hanya menerima header kiosk', async () => {
    const service = { getKiosk: jest.fn().mockResolvedValue({ schoolName: 'SMK Darussalam Subah' }) };
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicKioskController],
      providers: [{ provide: PublicKioskService, useValue: service }],
    }).compile();
    const controller = moduleRef.get(PublicKioskController);

    expect(() => controller.kiosk(undefined)).toThrow(BadRequestException);
    await expect(controller.kiosk('token-header')).resolves.toEqual({ schoolName: 'SMK Darussalam Subah' });
    expect(service.getKiosk).toHaveBeenCalledWith('token-header');
  });

  it('membuktikan kontrak transport Fastify: query token ditolak dan header mendukung rotasi', async () => {
    const service = { getKiosk: jest.fn(async (token: string) => ({ tokenSeen: token })) };
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicKioskController],
      providers: [{ provide: PublicKioskService, useValue: service }],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    const fastify = app.getHttpAdapter().getInstance();
    await fastify.ready();

    try {
      const queryOnly = await fastify.inject({ method: 'GET', url: '/public/kiosk?token=token-v1' });
      expect(queryOnly.statusCode).toBe(400);
      expect(service.getKiosk).not.toHaveBeenCalled();

      const firstHeader = await fastify.inject({
        method: 'GET',
        url: '/public/kiosk',
        headers: { 'x-diis-kiosk-token': 'token-v1' },
      });
      expect(firstHeader.statusCode).toBe(200);
      expect(JSON.parse(firstHeader.payload)).toEqual({ tokenSeen: 'token-v1' });

      const rotatedHeader = await fastify.inject({
        method: 'GET',
        url: '/public/kiosk',
        headers: { 'x-diis-kiosk-token': 'token-v2' },
      });
      expect(rotatedHeader.statusCode).toBe(200);
      expect(JSON.parse(rotatedHeader.payload)).toEqual({ tokenSeen: 'token-v2' });
      expect(service.getKiosk).toHaveBeenNthCalledWith(1, 'token-v1');
      expect(service.getKiosk).toHaveBeenNthCalledWith(2, 'token-v2');
    } finally {
      await app.close();
    }
  });
});
