import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { logger } from '@smk/logger';
import { AssessmentController } from '../assessment/assessment.controller';
import { AssessmentService } from '../assessment/assessment.service';
import { SseTokenService } from '../auth/sse-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';

/** Actual Nest/Fastify async controller, service producer, token service and interceptor.
 * Persistence/identity are isolated adapters, not PostgreSQL/Keycloak acceptance. */
describe('assessment stream through actual HTTP framework boundary', () => {
  const sid = '00000000-0000-4000-8000-000000000101';
  const good = 'a'.repeat(64),
    wrongRole = 'b'.repeat(64),
    expired = 'c'.repeat(64),
    foreign = 'd'.repeat(64);
  let app: NestFastifyApplication,
    service: AssessmentService,
    origin: string,
    reads = 0,
    score = 100,
    pending = false,
    broken = false;
  let remedialCount = 1;
  const responseScopes: unknown[] = [];
  const countRemedials = jest.fn(async () => remedialCount);
  const used = new Set<string>();
  const session = {
    id: sid,
    teacherId: 'owner',
    classId: 'synthetic-class',
    title: 'Synthetic HTTP only',
    type: 'diagnostik',
    status: 'active',
    purpose: 'regular',
    questions: [],
  };
  const info = jest.spyOn(logger, 'info').mockImplementation(() => logger);
  const error = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  const db = {
    sseToken: {
      findUnique: async ({ where }: { where: { token: string } }) =>
        [good, wrongRole, expired, foreign].includes(where.token)
          ? {
              id: where.token,
              used: used.has(where.token),
              expiresAt: new Date(Date.now() + (where.token === expired ? -1 : 60000)),
              keycloakId: where.token === foreign ? 'foreign' : 'teacher',
              roles: [where.token === wrongRole ? 'SISWA' : 'GURU'],
              email: 'synthetic@example.invalid',
              username: 'synthetic',
              fullName: 'Synthetic Teacher',
            }
          : null,
      update: async ({ where }: { where: { id: string } }) => {
        used.add(where.id);
        return {};
      },
    },
    teacher: {
      findFirst: async ({ where }: { where: { user: { keycloakId: string } } }) => ({
        id: where.user.keycloakId === 'foreign' ? 'another-owner' : 'owner',
      }),
    },
    assessmentSession: { findUnique: async () => session, findMany: async () => [] },
    assessmentEventOutbox: { findMany: async () => [] },
    assessmentResponse: {
      findMany: async (args: { where: unknown }) => {
        responseScopes.push(args.where);
        reads++;
        if (broken) throw Error('Synthetic persistence unavailable');
        return (
          session.purpose === 'remedial' ? [score, 0].slice(0, remedialCount) : [score, 0]
        ).map((value, i) => ({
          id: 'response-' + i,
          score: pending ? null : value,
          submittedAt: new Date(),
          startedAt: new Date(),
          timeSpentSec: 0,
          answers: {},
          itemScores: [{ status: pending ? 'manual_pending' : 'manual_scored' }],
          lateSubmissionStatus: null,
          lastSavedAt: null,
          lastHeartbeatAt: null,
          lateSubmittedAt: null,
          clientRevision: 1,
          integrityEvents: [],
          _count: { integrityEvents: 0 },
          student: { nis: 'synthetic', user: { fullName: 'Synthetic ' + i } },
        }));
      },
    },
    student: { count: async () => 2 },
    remedialParticipant: { count: countRemedials },
  };
  beforeAll(async () => {
    const prisma = db as unknown as PrismaService;
    service = new AssessmentService(prisma, new EventEmitter2(), {} as AcademicPeriodService);
    const module = await Test.createTestingModule({
      controllers: [AssessmentController],
      providers: [
        { provide: AssessmentService, useValue: service },
        { provide: SseTokenService, useValue: new SseTokenService(prisma) },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    app.useGlobalInterceptors(new LoggingInterceptor());
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  beforeEach(() => {
    used.clear();
    reads = 0;
    score = 100;
    pending = false;
    broken = false;
    session.status = 'active';
    session.purpose = 'regular';
    remedialCount = 1;
    responseScopes.length = 0;
    countRemedials.mockClear();
    info.mockClear();
    error.mockClear();
  });
  afterAll(async () => {
    await app.close();
    info.mockRestore();
    error.mockRestore();
  });
  const streamUrl = (token: string) =>
    origin + '/assessment/sessions/' + sid + '/stream?token=' + token;
  async function frames(token: string, number: number) {
    const c = new AbortController(),
      timer = setTimeout(() => c.abort(), 10000);
    const response = await fetch(streamUrl(token), { signal: c.signal });
    const reader = response.body!.getReader();
    let text = '';
    const decoder = new TextDecoder();
    const next = async () => {
      while (text.split('\n').filter((l) => l.startsWith('data:')).length < number) {
        const part = await reader.read();
        if (part.done) break;
        text += decoder.decode(part.value);
      }
      return text
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map(
          (l) =>
            JSON.parse(l.slice(5)) as {
              rata: number | null;
              finalCount: number;
              pendingManualCount: number;
              sessionStatus: string;
              roster: Array<{ nilai: number | null }>;
            },
        );
    };
    return {
      response,
      next,
      stop: () => {
        clearTimeout(timer);
        c.abort();
      },
    };
  }
  it('delivers initial data, rejects replay and stops polling after disconnect', async () => {
    const c = await frames(good, 1);
    try {
      expect(c.response.status).toBe(200);
      expect(c.response.headers.get('content-type')).toContain('text/event-stream');
      expect((await c.next())[0]).toMatchObject({
        rata: 50,
        finalCount: 2,
        pendingManualCount: 0,
        roster: [{ nilai: 100 }, { nilai: 0 }],
      });
      // A fresh replay is rejected; a new token reconnects with authoritative data.
      expect((await fetch(streamUrl(good))).status).toBe(401);
    } finally {
      c.stop();
    }
    await new Promise((r) => setTimeout(r, 120));
    const before = reads;
    await new Promise((r) => setTimeout(r, 3200));
    expect(reads).toBe(before);
  }, 15000);
  it('emits a subsequent real polling update rather than only a connection/id', async () => {
    const c = await frames(good, 2);
    try {
      setTimeout(() => {
        score = 80;
        session.status = 'completed';
      }, 500);
      const data = await c.next();
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({ rata: 50, finalCount: 2 });
      expect(data[1]).toMatchObject({ rata: 40, finalCount: 2, sessionStatus: 'completed' });
      const rest = await service.getResults(sid, {
        keycloakId: 'teacher',
        roles: ['GURU'],
        email: 'synthetic@example.invalid',
        username: 'synthetic',
        fullName: 'Synthetic Teacher',
      });
      expect(rest.avgScore).toBe(data[1]!.rata);
      expect(rest.finalCount).toBe(data[1]!.finalCount);
    } finally {
      c.stop();
    }
  }, 15000);
  it('preserves pending/null rather than final zero', async () => {
    pending = true;
    const c = await frames(good, 1);
    try {
      expect((await c.next())[0]).toMatchObject({
        rata: null,
        finalCount: 0,
        pendingManualCount: 2,
        roster: [{ nilai: null }, { nilai: null }],
      });
    } finally {
      c.stop();
    }
  });
  it.each([0, 1])(
    'uses %i eligible remedial participants consistently in HTTP stream and results',
    async (count) => {
      session.purpose = 'remedial';
      remedialCount = count;
      const c = await frames(good, 1);
      try {
        expect((await c.next())[0]).toMatchObject({
          classStudentCount: count,
          selesai: count,
          belum: 0,
        });
        const results = await service.getResults(sid, {
          keycloakId: 'teacher',
          roles: ['GURU'],
        } as Parameters<AssessmentService['getResults']>[1]);
        expect(results.classStudentCount).toBe(count);
        expect(results.submitted).toBe(count);
        expect(countRemedials).toHaveBeenCalledWith({
          where: { sessionId: sid, status: { not: 'cancelled' } },
        });
        expect(responseScopes).toEqual(
          expect.arrayContaining([
            {
              sessionId: sid,
              student: {
                remedialParticipants: { some: { sessionId: sid, status: { not: 'cancelled' } } },
              },
            },
          ]),
        );
      } finally {
        c.stop();
      }
    },
  );
  it.each([
    ['invalid', 'invalid', 401],
    ['expired', expired, 401],
    ['student', wrongRole, 403],
  ])('denies %s token/role', async (_name, token, status) => {
    expect((await fetch(streamUrl(token))).status).toBe(status);
    expect(reads).toBe(0);
  });
  it('denies another teacher before any roster is emitted', async () => {
    const c = await frames(foreign, 1);
    try {
      expect(await c.next()).toEqual([]);
      expect(reads).toBe(0);
    } finally {
      c.stop();
    }
  });
  it('does not turn a producer error into an empty successful data snapshot', async () => {
    broken = true;
    const c = await frames(good, 1);
    try {
      expect(await c.next()).toEqual([]);
    } finally {
      c.stop();
    }
  });
  it('never places a one-use query credential in request logs', async () => {
    const c = await frames(good, 1);
    try {
      await c.next();
      expect(JSON.stringify(info.mock.calls)).not.toContain(good);
    } finally {
      c.stop();
    }
  });
});
