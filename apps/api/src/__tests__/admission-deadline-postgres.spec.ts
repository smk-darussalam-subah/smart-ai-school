import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { JpReadAdmission } from '../attendance/jp-read-admission';
import { AssessmentWriteAdmission } from '../assessment/assessment-write-admission';

const url = process.env.ASSESSMENT_RESILIENCE_DATABASE_URL;
const postgres = url ? describe : describe.skip;
postgres.each([
  ['JP reader', () => new JpReadAdmission(1, 5, 20)],
  ['assessment writer', () => new AssessmentWriteAdmission(1, 5, 20)],
] as const)('%s expired work cannot reach disposable PostgreSQL', (_name, create) => {
  let db: PrismaClient;
  beforeAll(async () => {
    if (!url) throw Error('Disposable URL required');
    const parsed = new URL(url);
    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      !parsed.pathname.includes('diis_test_assessment_resilience')
    )
      throw Error('Disposable loopback database required');
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.$connect();
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  it('does not persist expired work and permits the next live write exactly once', async () => {
    const marker = randomUUID(),
      gate = create();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const persist = () =>
      db.auditLog.create({
        data: {
          id: marker,
          actorRoles: ['GURU'],
          action: 'qa.deadline-marker',
          method: 'POST',
          path: '/qa/disposable',
          statusCode: 200,
          outcome: 'success',
        },
      });
    const first = gate.run('active', () => held);
    const expired = gate.run('expired', persist);
    const rejected = expect(expired).rejects.toMatchObject({ status: 503 });
    const until = performance.now() + 45;
    while (performance.now() < until) {
      /* Deliberately delay timeout callbacks. */
    }
    release();
    await Promise.all([first, rejected]);
    expect(await db.auditLog.count({ where: { id: marker } })).toBe(0);
    await gate.run('expired', persist);
    expect(await db.auditLog.count({ where: { id: marker } })).toBe(1);
    // Audit history is append-only; the entire disposable DB is removed by the runner.
  });
});
