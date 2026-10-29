import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AssessmentController } from '../assessment/assessment.controller';
import { AssessmentService } from '../assessment/assessment.service';
import { AssessmentWriteAdmission } from '../assessment/assessment-write-admission';
import { SseTokenService } from '../auth/sse-token.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

describe('assessment admission through actual controller/Fastify/filter', () => {
  it('preserves explicit safe retry code, refuses invalid/unauthenticated requests, and releases capacity', async () => {
    const gate = new AssessmentWriteAdmission(1, 0, 100);
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const work = jest.fn(async () => ({ started: true }));
    const module = await Test.createTestingModule({
      controllers: [AssessmentController],
      providers: [
        { provide: SseTokenService, useValue: {} },
        {
          provide: AssessmentService,
          useValue: {
            startResponse: (_id: string, user: { keycloakId: string }) =>
              gate.run(user.keycloakId, work),
          },
        },
      ],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    // Deliberate synthetic identity; this proves HTTP/filter, not Keycloak login.
    app.useGlobalGuards({
      canActivate(context: ExecutionContext) {
        const req = context
          .switchToHttp()
          .getRequest<{ headers: Record<string, string>; user: unknown }>();
        if (req.headers['x-proof-user'] !== 'synthetic') throw new UnauthorizedException();
        req.user = { keycloakId: 'synthetic', roles: ['SISWA'] };
        return true;
      },
    });
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    const fastify = app.getHttpAdapter().getInstance();
    await fastify.ready();
    const headers = { 'x-proof-user': 'synthetic' };
    const url = '/assessment/sessions/00000000-0000-4000-8000-000000000001/start-response';
    const blocking = gate.run('other', () => hold);
    try {
      const denied = await fastify.inject({ method: 'POST', url });
      expect(denied.statusCode).toBe(401);
      const invalid = await fastify.inject({
        method: 'POST',
        url: url.replace('00000000-0000-4000-8000-000000000001', 'invalid'),
        headers,
      });
      expect(invalid.statusCode).toBe(400);
      const busy = await fastify.inject({ method: 'POST', url, headers });
      expect(busy.statusCode).toBe(503);
      expect(busy.headers['retry-after']).toBe('2');
      expect(busy.json()).toMatchObject({ code: 'ASSESSMENT_WRITE_BUSY' });
      expect(work).not.toHaveBeenCalled();
      release();
      await blocking;
      const accepted = await fastify.inject({ method: 'POST', url, headers });
      expect(accepted.statusCode).toBe(201);
      expect(work).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await blocking;
      await app.close();
    }
  });
});
