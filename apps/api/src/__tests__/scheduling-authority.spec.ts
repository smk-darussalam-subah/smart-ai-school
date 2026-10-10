import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingAudit } from '../scheduling/scheduling-audit';
import { SchedulingService } from '../scheduling/scheduling.service';

describe('Wave 1A fresh authority protocol (unit; PostgreSQL proof is separate)', () => {
  const env = { ...process.env };
  let active = true;
  let role: string | null = 'SUPER_ADMIN';
  let events: string[];
  let tx: {
    $executeRaw: jest.Mock; $executeRawUnsafe: jest.Mock; $queryRaw: jest.Mock;
    schedulingMutationReceipt: { findUnique: jest.Mock };
    schedulingVersion: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let service: SchedulingService;
  let permission: { getAuthoritativePrimaryRole: jest.Mock; hasFreshPermission: jest.Mock };
  const id = '85000000-0000-4000-8000-000000000001';
  beforeEach(() => {
    process.env.SMART_SCHEDULER_ENABLED = 'true'; active = true; role = 'SUPER_ADMIN'; events = [];
    tx = {
      $executeRaw: jest.fn(async (query: Prisma.Sql) => { events.push(String(query.values[0])); return 1; }),
      $executeRawUnsafe: jest.fn(async () => { events.push('READ_ONLY'); return 0; }),
      $queryRaw: jest.fn(async () => { events.push('ROOT_LOCK'); return []; }),
      schedulingMutationReceipt: { findUnique: jest.fn(async () => { events.push('RECEIPT'); return null; }) },
      schedulingVersion: {
        findUnique: jest.fn(async () => ({ id, status: 'DRAFT', revision: 0, slots: [] })),
        findMany: jest.fn(async () => []), count: jest.fn(async () => 0),
      },
    };
    permission = {
      getAuthoritativePrimaryRole: jest.fn(async () => { events.push('FRESH_ROLE'); return active ? role : null; }),
      hasFreshPermission: jest.fn(async () => true),
    };
    service = new SchedulingService({
      $transaction: async (fn: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        fn(tx as unknown as Prisma.TransactionClient),
    } as unknown as PrismaService, permission as unknown as PermissionsService,
    { acquireCutoverLock: async () => { events.push('CUTOVER'); } } as unknown as AcademicPeriodService,
    new SchedulingAudit());
  });
  afterEach(() => { process.env = { ...env }; });
  it.each([null, 'GURU', 'TATA_USAHA', 'KEPALA_SEKOLAH'])('A04 fresh role %s cannot read despite a stale SA token', async (newRole) => {
    role = newRole;
    await expect(service.list({ academicYearId: id, semesterNumber: 1 }, id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.schedulingVersion.findMany).not.toHaveBeenCalled();
  });
  it('A04 read is DB-read-only and fresh after domain/cutover locks', async () => {
    await service.list({ academicYearId: id, semesterNumber: 1 }, id);
    expect(events).toEqual(['READ_ONLY','academic:schedule:mutation:v1','CUTOVER','users:last-active-super-admin','FRESH_ROLE']);
  });
  it('A03 actor revoked while waiting on domain lock is checked after the wait', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    tx.$executeRaw.mockImplementation(async (query: Prisma.Sql) => {
      events.push(String(query.values[0]));
      if (query.values[0] === 'academic:schedule:mutation:v1') await gate;
      return 1;
    });
    const pending = service.rename(id, { name: 'Late write', expectedRevision: 0 }, id, 'unit-race-key');
    await Promise.resolve();
    active = false; release();
    await expect(pending).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.schedulingMutationReceipt.findUnique).not.toHaveBeenCalled();
    expect(events.indexOf('FRESH_ROLE')).toBeGreaterThan(events.indexOf('ROOT_LOCK'));
  });
  it('A10 receipt replay never precedes fresh permission/identity', async () => {
    active = false;
    tx.schedulingMutationReceipt.findUnique.mockResolvedValue({ responseJson: { id, revision: 0 } });
    await expect(service.rename(id, { name: 'Replay', expectedRevision: 0 }, id, 'unit-replay-key')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.schedulingMutationReceipt.findUnique).not.toHaveBeenCalled();
  });
  it('A01 flag disabled before service entry does not open a transaction', async () => {
    process.env.SMART_SCHEDULER_ENABLED = 'false';
    await expect(service.list({ academicYearId: id, semesterNumber: 1 }, id)).rejects.toThrow();
    expect(events).toEqual([]);
  });
});
