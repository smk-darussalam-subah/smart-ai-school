import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { StudentSessionAttendanceController } from '../attendance/student-session-attendance.controller';
import { StudentSessionAttendanceService } from '../attendance/student-session-attendance.service';
import { StudentSessionAttendanceReadService } from '../attendance/student-session-attendance-read.service';
import { JpReadAdmission } from '../attendance/jp-read-admission';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

describe('JP read admission through real controller/Fastify/error filter', () => {
  it('preserves bounded retry, rejects invalid/unauthenticated reads, and recovers', async () => {
    const gate = new JpReadAdmission(1, 0, 100);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const work = jest.fn(async () => ({ unit: 'student_session_jp' }));
    const module = await Test.createTestingModule({
      controllers: [StudentSessionAttendanceController],
      providers: [
        {
          provide: StudentSessionAttendanceService,
          useValue: {
            learner: (_q: unknown, user: { keycloakId: string }) => gate.run(user.keycloakId, work),
          },
        },
        { provide: StudentSessionAttendanceReadService, useValue: {} },
      ],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    app.useGlobalGuards({
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<{
          headers: Record<string, string>;
          user: unknown;
        }>();
        if (req.headers['x-proof-user'] !== 'synthetic') throw new UnauthorizedException();
        req.user = { keycloakId: 'synthetic', roles: ['SISWA'] };
        return true;
      },
    });
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    const fastify = app.getHttpAdapter().getInstance();
    await fastify.ready();
    const url = '/attendance/student-sessions/summary?from=2026-10-01&to=2026-10-22';
    const headers = { 'x-proof-user': 'synthetic' };
    const blocking = gate.run('other', () => held);
    try {
      expect((await fastify.inject({ method: 'GET', url })).statusCode).toBe(401);
      expect(
        (await fastify.inject({ method: 'GET', url: url + '&semester=bad', headers })).statusCode,
      ).toBe(400);
      const busy = await fastify.inject({ method: 'GET', url, headers });
      expect(busy.statusCode).toBe(503);
      expect(busy.headers['retry-after']).toBe('2');
      expect(busy.json()).toMatchObject({
        code: 'JP_READ_BUSY',
        message: 'Rekap sedang sibuk. Coba lagi sebentar.',
      });
      expect(work).not.toHaveBeenCalled();
      release();
      await blocking;
      const ok = await fastify.inject({ method: 'GET', url, headers });
      expect(ok.statusCode).toBe(200);
      expect(work).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await blocking;
      await app.close();
    }
  });
});
