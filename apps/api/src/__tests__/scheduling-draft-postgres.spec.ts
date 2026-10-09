import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { ConflictException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AuthUser } from '@smk/auth';
import { SchedulingService } from '../scheduling/scheduling.service';
import { SchedulingController } from '../scheduling/scheduling.controller';
import { SchedulingAudit } from '../scheduling/scheduling-audit';
import { PermissionsService } from '../permissions/permissions.service';
import { PermissionGuard } from '../permissions/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditInterceptor } from '../audit-log/interceptors/audit.interceptor';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { UserStatusService } from '../auth/user-status.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { ClassesService } from '../classes/classes.service';
import { digest } from '../scheduling/scheduling-input-snapshot';

const url = process.env.WAVE1A_PROOF_DATABASE_URL;
if (url && !/^postgresql:\/\/wave1a_local:wave1a_local@127\.0\.0\.1:55441\/diis_wave1a_[a-z0-9_]+$/.test(url)) {
  throw new Error('Wave 1A proof only accepts its dedicated disposable database');
}
const fixtureDate = process.env.WAVE1A_PROOF_CLOCK_DATE ?? '2026-10-06';
if (!['2026-10-06','2026-10-13'].includes(fixtureDate)) throw new Error('Unsupported Wave 1A fixture date');
const date = (offset: number) => new Date(Date.parse(fixtureDate) + offset * 86400000).toISOString().slice(0,10);
const proof = url ? describe : describe.skip;

proof('Wave 1A actual API/services and task-owned PostgreSQL', () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const db = prisma as unknown as PrismaService;
  const permissions = new PermissionsService(db);
  const period = new AcademicPeriodService(db, permissions);
  const audit = new SchedulingAudit();
  const service = new SchedulingService(db, permissions, period, audit);
  // Only the external identity provider is stubbed; DIIS identity writers/locks are real.
  const users = new UsersService(db, new UserStatusService(db), {
    getUserRealmRoles: async () => [], assignRealmRole: async () => {}, removeRealmRole: async () => {},
    setEnabled: async () => {},
  } as unknown as KeycloakAdminService, permissions, {} as ClassesService);
  let admin: Awaited<ReturnType<typeof employee>>;
  let yearId: string;
  let semesterId: string;
  let app: NestFastifyApplication;
  const classIds: string[] = [];
  const assignmentIds: string[] = [];
  const teachers: string[] = [];
  const key = () => 'wave1a-' + randomUUID();
  async function employee(role: 'SUPER_ADMIN' | 'GURU' = 'SUPER_ADMIN') {
    const keycloakId = randomUUID();
    const user = await prisma.user.create({ data: { keycloakId, email: keycloakId + '@example.invalid',
      fullName: 'Synthetic Wave 1A', role } });
    return { user, auth: { keycloakId, roles: [role], username: 'synthetic-wave1a' } as AuthUser };
  }
  const body = () => ({ academicYearId: yearId, semesterNumber: 1, name: 'Synthetic draft',
    effectiveFrom: date(-1), effectiveUntil: date(11), classIds });
  const slot = (index = 0, jpStart = 1, jpEnd = 3, dayOfWeek = 1) => ({
    assignmentId: assignmentIds[index]!, sessionIndex: 0, dayOfWeek, jpStart, jpEnd,
    roomLabel: null, concurrencyGroupId: null as string | null,
  });
  async function create(actor = admin.auth.keycloakId) { return service.create(body(), actor, key()); }
  async function domainCounts() {
    return Promise.all([prisma.schedulingVersion.count(), prisma.schedulingVersionSlot.count(),
      prisma.schedulingMutationReceipt.count(), prisma.auditLog.count({ where: { method: 'DOMAIN' } })]);
  }
  async function legacyBytes() {
    return digest(await prisma.$queryRaw(Prisma.sql`SELECT
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM academic.schedules s) AS schedules,
      (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM academic.class_sessions c) AS sessions`));
  }
  async function allTableBytes() {
    const tables = await prisma.$queryRaw<{ schemaname: string; tablename: string }[]>(Prisma.sql`
      SELECT schemaname,tablename FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename`);
    const result: { table: string; hash: string }[] = [];
    for (const t of tables) {
      if (!/^[a-z0-9_]+$/.test(t.schemaname) || !/^[a-z0-9_]+$/.test(t.tablename)) throw new Error('Unexpected fixture table identifier');
      const contents = await prisma.$queryRawUnsafe(
        'SELECT md5(COALESCE(string_agg(to_jsonb(t)::text, chr(10) ORDER BY to_jsonb(t)::text),\'\')) AS hash FROM "' +
        t.schemaname + '"."' + t.tablename + '" t');
      result.push({ table: t.schemaname + '.' + t.tablename, hash: digest(contents) });
    }
    return digest(result);
  }
  function deferred() {
    let resolveGate!: () => void;
    const promise = new Promise<void>((r) => { resolveGate = r; });
    return { promise, release: resolveGate };
  }
  async function waiter(lock: string) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted
        AND objid=((hashtext(${lock})::bigint & 4294967295)::oid)`);
      if (Number(rows[0]?.count)) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('Expected actual advisory lock waiter');
  }
  async function hold(lock: string) {
    const entered = deferred(); const release = deferred();
    const completion = prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lock}))`);
      entered.release(); await release.promise;
    }, { timeout: 15000 });
    await entered.promise;
    return { release: release.release, completion };
  }
  beforeAll(async () => {
    jest.useFakeTimers({ doNotFake: ['setTimeout','clearTimeout','setInterval','clearInterval','nextTick',
      'setImmediate','clearImmediate','hrtime','performance','queueMicrotask'] });
    jest.setSystemTime(new Date(fixtureDate + 'T00:31:00Z'));
    admin = await employee();
    await prisma.bellScheduleProfile.updateMany({ data: { revokedAt: new Date() } });
    const year = await prisma.academicYear.create({ data: { code: '2026/2027',
      startDate: new Date('2026-07-13'), endDate: new Date('2027-06-30') } });
    yearId = year.id;
    const semester = await prisma.semester.create({ data: { academicYearId: year.id, number: 1,
      startDate: new Date(date(-1)), endDate: new Date(date(11)) } });
    semesterId = semester.id;
    for (let i = 0; i < 2; i++) {
      const person = await employee('GURU');
      const teacher = await prisma.teacher.create({ data: { userId: person.user.id } });
      teachers.push(teacher.id);
      const row = await prisma.class.create({ data: { name: 'X SYN ' + i, grade: 10, majorCode: 'SYN',
        academicYear: year.code } });
      classIds.push(row.id);
    }
    for (let i = 0; i < 3; i++) {
      const a = await prisma.teachingAssignment.create({ data: { teacherId: teachers[i === 1 ? 1 : 0]!,
        classId: classIds[i === 2 ? 1 : 0]!, subject: 'Produktif', hoursPerWeek: 3, academicYear: year.code } });
      assignmentIds.push(a.id);
    }
    const bell = await prisma.bellScheduleProfile.create({ data: {
      code: 'WAVE1A_SYN', name: 'Synthetic daily profile', scope: 'SCHOOL', kind: 'NORMAL',
      effectiveFrom: new Date(date(-1)), effectiveUntil: new Date(date(11)), provenance: 'disposable fixture',
      segments: { create: [1,2,3,4,5,6].flatMap((dayOfWeek) => Array.from({ length: dayOfWeek === 5 ? 8 : 10 }, (_, i) => ({
        dayOfWeek, jpNumber: i + 1, label: 'JP ' + (i+1), type: 'INSTRUCTION', sortOrder: i+1,
        startMinute: 420+i*35, endMinute: 455+i*35,
      }))) },
    } });
    const schedule = await prisma.schedule.create({ data: { classId: classIds[1]!, teachingAssignmentId: assignmentIds[2]!,
      dayOfWeek: 1, jpStart: 7, jpEnd: 9, academicYear: year.code, semester: 1, room: 'Historical room' } });
    await prisma.classSession.create({ data: { scheduleId: schedule.id, serviceDate: new Date(date(-1)),
      academicYearId: yearId, semesterId, bellScheduleProfileId: bell.id, classId: classIds[1]!,
      teachingAssignmentId: assignmentIds[2]!, scheduledTeacherId: teachers[0]!, assignedTeacherId: teachers[0]!,
      classNameSnapshot: 'Frozen class', subjectSnapshot: 'Frozen subject', scheduledTeacherName: 'Frozen teacher',
      assignedTeacherName: 'Frozen teacher', scheduledStartAt: new Date(date(-1)+'T03:30:00Z'),
      scheduledEndAt: new Date(date(-1)+'T05:15:00Z'),
    } });
    const module = await Test.createTestingModule({
      controllers: [SchedulingController], providers: [{ provide: SchedulingService, useValue: service }],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
    app.setGlobalPrefix('api/v1');
    const reflector = new Reflector();
    app.useGlobalGuards({
      // Isolated authentication seam only; production JWT code remains untouched and is not claimed proven here.
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<{ headers: Record<string,string>; user?: AuthUser }>();
        if (req.headers['x-wave1a-user']) req.user = { ...admin.auth, keycloakId: req.headers['x-wave1a-user']! };
        return true;
      },
    }, new PermissionGuard(reflector, permissions), new RolesGuard(reflector, permissions));
    app.useGlobalInterceptors(new AuditInterceptor(new AuditLogService(db), reflector));
    await app.init(); await app.getHttpAdapter().getInstance().ready();
  }, 30000);
  afterAll(async () => { if (app) await app.close(); jest.useRealTimers(); await prisma.$disconnect(); });
  afterEach(() => { jest.restoreAllMocks(); process.env.SMART_SCHEDULER_ENABLED = 'true'; });

  it('A05/A07 migration has three additive tables; domain operations preserve legacy schedule/session bytes', async () => {
    const sql = readFileSync(resolve(__dirname, '../../../../packages/database/prisma/migrations/20261008000020_scheduling_draft_foundation/migration.sql'),'utf8');
    expect((sql.match(/CREATE TABLE/g) ?? []).length).toBe(3);
    expect(sql).not.toMatch(/^\s*(DROP|UPDATE|DELETE|TRUNCATE|ALTER)\s/gmi);
    const before = await legacyBytes();
    // Task-owned empty draft tables only. Reapply the actual additive DDL with pre-existing
    // legacy history inside a rollback transaction; never delete retained proof/application data.
    expect((await domainCounts()).slice(0,3)).toEqual([0,0,0]);
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TABLE academic.scheduling_mutation_receipts');
      await tx.$executeRawUnsafe('DROP TABLE academic.scheduling_version_slots');
      await tx.$executeRawUnsafe('DROP TABLE academic.scheduling_versions');
      for (const statement of sql.split(';').filter((s) => s.trim())) await tx.$executeRawUnsafe(statement);
      const after = digest(await tx.$queryRaw(Prisma.sql`SELECT
        (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM academic.schedules s) AS schedules,
        (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM academic.class_sessions c) AS sessions`));
      expect(after).toBe(before);
      throw new Error('migration-proof-rollback');
    })).rejects.toThrow('migration-proof-rollback');
    expect(await legacyBytes()).toBe(before);
    const draft = await create();
    const saved = await service.replace(draft.id, { expectedRevision: 0, slots: [slot(),slot(1,4,6),slot(2,7,9)] }, admin.auth.keycloakId, key());
    await service.rename(draft.id, { expectedRevision: saved.revision, name: 'Renamed' }, admin.auth.keycloakId, key());
    await service.archive(draft.id, { expectedRevision: 2 }, admin.auth.keycloakId, key());
    expect(await legacyBytes()).toBe(before);
    expect(await prisma.schedulingVersionSlot.count({ where: { versionId: draft.id } })).toBe(3);
  });
  it.each(['PUBLISHED','APPROVED','FAILED'])('A06 database denies root status %s', async (status) => {
    const d = await create();
    await expect(prisma.$executeRaw(Prisma.sql`UPDATE academic.scheduling_versions SET status=${status} WHERE id=${d.id}::uuid`)).rejects.toThrow();
  });
  it.each(['revision','range','period','locked','jp','session'])('A06 database constraint %s cannot be bypassed through Prisma', async (kind) => {
    const d = await create();
    if (kind === 'revision') await expect(prisma.schedulingVersion.update({ where: { id: d.id }, data: { revision: -1 } })).rejects.toThrow();
    if (kind === 'range') await expect(prisma.schedulingVersion.update({ where: { id: d.id }, data: { effectiveUntil: new Date(date(-2)) } })).rejects.toThrow();
    if (kind === 'period') await expect(prisma.schedulingVersion.update({ where: { id: d.id }, data: { semesterNumber: 2 } })).rejects.toThrow();
    if (['locked','jp','session'].includes(kind)) await expect(prisma.schedulingVersionSlot.create({ data: {
      versionId: d.id, ...slot(), ...(kind === 'locked' ? { locked: true } : kind === 'jp' ? { jpEnd: 0 } : { sessionIndex: -1 }),
    } })).rejects.toThrow();
  });
  it('A06 existing period deletion is explicitly restricted while drafts refer to it', async () => {
    await create();
    await expect(prisma.semester.delete({ where: { id: semesterId } })).rejects.toThrow();
  });
  it('A09 competing revisions commit exactly once', async () => {
    const d = await create();
    const responses = await Promise.allSettled([
      service.rename(d.id, { expectedRevision: 0, name: 'A' }, admin.auth.keycloakId, key()),
      service.rename(d.id, { expectedRevision: 0, name: 'B' }, admin.auth.keycloakId, key()),
    ]);
    expect(responses.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.schedulingVersion.findUniqueOrThrow({ where: { id: d.id } })).revision).toBe(1);
  });
  it('A10 concurrent exact replay has one root/audit/receipt; request mismatch conflicts; old ack is not current state', async () => {
    const k = key(); const before = await domainCounts();
    const responses = await Promise.all([service.create(body(),admin.auth.keycloakId,k),service.create(body(),admin.auth.keycloakId,k)]);
    expect(responses[0]!.id).toBe(responses[1]!.id);
    expect(responses.map((r) => r.replayed).sort()).toEqual([false,true]);
    expect(await domainCounts()).toEqual(before.map((n,i) => n + (i === 1 ? 0 : 1)));
    await expect(service.create({ ...body(),name:'Different' },admin.auth.keycloakId,k)).rejects.toBeInstanceOf(ConflictException);
    await service.rename(responses[0]!.id,{ expectedRevision:0,name:'Newer' },admin.auth.keycloakId,key());
    expect((await service.create(body(),admin.auth.keycloakId,k)).revision).toBe(0);
    expect((await service.get(responses[0]!.id,admin.auth.keycloakId)).revision).toBe(1);
  });
  it('A11 audit failure rolls back root and receipt', async () => {
    const before = await domainCounts();
    jest.spyOn(audit,'record').mockRejectedValueOnce(new Error('Synthetic domain audit failure'));
    await expect(create()).rejects.toThrow('Synthetic domain audit failure');
    expect(await domainCounts()).toEqual(before);
  });
  it('A11 receipt insertion failure rolls back atomic slot replacement and domain audit', async () => {
    const d = await create(); await service.replace(d.id,{ expectedRevision:0,slots:[slot()] },admin.auth.keycloakId,key());
    const before = await domainCounts(); const beforeDraft = await prisma.schedulingVersion.findUnique({ where:{id:d.id},include:{slots:true} });
    await prisma.$executeRawUnsafe(`CREATE FUNCTION academic.wave1a_receipt_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic receipt failure'; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER wave1a_receipt_fail BEFORE INSERT ON academic.scheduling_mutation_receipts FOR EACH ROW EXECUTE FUNCTION academic.wave1a_receipt_fail()');
    try {
      await expect(service.replace(d.id,{ expectedRevision:1,slots:[slot(1,4,6)] },admin.auth.keycloakId,key())).rejects.toThrow();
      expect(await domainCounts()).toEqual(before);
      expect(await prisma.schedulingVersion.findUnique({ where:{id:d.id},include:{slots:true} })).toEqual(beforeDraft);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER wave1a_receipt_fail ON academic.scheduling_mutation_receipts');
      await prisma.$executeRawUnsafe('DROP FUNCTION academic.wave1a_receipt_fail()');
    }
  });
  it('A12 invalid replacement preserves every existing slot and revision', async () => {
    const d=await create(); await service.replace(d.id,{expectedRevision:0,slots:[slot()]},admin.auth.keycloakId,key());
    const before=await domainCounts();
    await expect(service.replace(d.id,{expectedRevision:1,slots:[slot(),slot(1)]},admin.auth.keycloakId,key())).rejects.toBeInstanceOf(ConflictException);
    expect(await domainCounts()).toEqual(before);
    expect((await service.get(d.id,admin.auth.keycloakId)).slots[0]?.assignmentId).toBe(assignmentIds[0]);
  });
  it('A13 archive is immutable while authorized exact replay still acknowledges original operation', async () => {
    const k=key(); const d=await create();
    await service.archive(d.id,{expectedRevision:0},admin.auth.keycloakId,k);
    await expect(service.rename(d.id,{expectedRevision:1,name:'Forbidden'},admin.auth.keycloakId,key())).rejects.toBeInstanceOf(ConflictException);
    expect((await service.archive(d.id,{expectedRevision:0},admin.auth.keycloakId,k)).replayed).toBe(true);
  });
  it('A14 live master edits/deletion expose stale input; no assignment FK blocks deletion', async () => {
    const d=await create();
    await prisma.teachingAssignment.update({where:{id:assignmentIds[0]},data:{hoursPerWeek:4}});
    expect((await service.get(d.id,admin.auth.keycloakId)).stale).toBe(true);
    await prisma.teachingAssignment.update({where:{id:assignmentIds[0]},data:{hoursPerWeek:3}});
    const a=await prisma.teachingAssignment.create({data:{ teacherId:teachers[1]!,classId:classIds[1]!,
      subject:'Temporary competency',hoursPerWeek:1,academicYear:'2026/2027'}});
    const extra=await create();
    await service.replace(extra.id,{expectedRevision:0,slots:[{...slot(),assignmentId:a.id,jpEnd:1}]},admin.auth.keycloakId,key());
    await prisma.teachingAssignment.delete({where:{id:a.id}});
    const current=await service.get(extra.id,admin.auth.keycloakId);
    expect(current.stale).toBe(true);
    expect(current.precheck.errors.some((e)=>e.code==='ASSIGNMENT_INVALID_OR_OUTSIDE_SCOPE')).toBe(true);
  });
  it('A17/A18 actual date-specific profiles, BREAK gaps and holidays use every occurrence', async () => {
    const d=await create();
    const original=await prisma.bellScheduleProfile.findUniqueOrThrow({where:{code:'WAVE1A_SYN'}});
    await prisma.bellScheduleProfile.update({where:{id:original.id},data:{effectiveUntil:new Date(date(4))}});
    const future=await prisma.bellScheduleProfile.create({data:{
      code:'WAVE1A_FUTURE',name:'Synthetic future eight JP',effectiveFrom:new Date(date(5)),effectiveUntil:new Date(date(11)),
      provenance:'disposable occurrence proof',
      segments:{create:[1,2,3,4,5,6].flatMap((dayOfWeek)=>Array.from({length:8},(_,i)=>({
        dayOfWeek,jpNumber:i+1,label:'JP '+(i+1),type:'INSTRUCTION',sortOrder:i+1,
        startMinute:420+i*35+(i>=2?15:0),endMinute:455+i*35+(i>=2?15:0),
      })))},
    }});
    const holidays:string[]=[];
    try {
      const high=await service.precheck(d.id,{slots:[slot(0,9,9)]},admin.auth.keycloakId);
      expect(high.errors).toContainEqual({code:'JP_UNAVAILABLE_OR_NONCONTIGUOUS',slot:0,date:date(6)});
      const gap=await service.precheck(d.id,{slots:[slot(0,2,3)]},admin.auth.keycloakId);
      expect(gap.errors.some((e)=>e.code==='JP_UNAVAILABLE_OR_NONCONTIGUOUS')).toBe(true);
      const holiday=await prisma.academicCalendar.create({data:{academicYearId:yearId,name:'Synthetic holiday',
        startDate:new Date(date(-1)),endDate:new Date(date(-1)),type:'holiday'}});
      holidays.push(holiday.id);
      const one=await service.precheck(d.id,{slots:[slot(0,9,9)]},admin.auth.keycloakId);
      expect(one.errors.some((e)=>e.date===date(6))).toBe(true);
      const second=await prisma.academicCalendar.create({data:{academicYearId:yearId,name:'Synthetic second holiday',
        startDate:new Date(date(6)),endDate:new Date(date(6)),type:'holiday'}});
      holidays.push(second.id);
      expect((await service.precheck(d.id,{slots:[slot()]},admin.auth.keycloakId)).errors)
        .toContainEqual({code:'NO_TEACHING_OCCURRENCE',slot:0});
    } finally {
      await prisma.academicCalendar.deleteMany({where:{id:{in:holidays}}});
      await prisma.bellScheduleProfile.delete({where:{id:future.id}});
      await prisma.bellScheduleProfile.update({where:{id:original.id},data:{effectiveUntil:original.effectiveUntil}});
    }
  });
  it('A19/A14 actual baseline group is exact, cannot be partial/forged/expired, and deletion stales the draft', async () => {
    const g=await prisma.scheduleConcurrencyGroup.create({data:{teacherId:teachers[0]!,mode:'JOINT_CLASS',
      reason:'Synthetic authorized baseline',approvedBy:admin.auth.keycloakId,dayOfWeek:1,jpStart:1,jpEnd:3,
      academicYear:'2026/2027',semester:1,expiresOn:new Date(date(11))}});
    const baseline:string[]=[];
    try {
      for(const i of [0,2]) {
        const s=await prisma.schedule.create({data:{teachingAssignmentId:assignmentIds[i]!,classId:classIds[i===0?0:1]!,
          dayOfWeek:1,jpStart:1,jpEnd:3,room:'Synthetic joint site',concurrencyGroupId:g.id,academicYear:'2026/2027',semester:1}});
        baseline.push(s.id);
      }
      const d=await create();
      const slots=[{...slot(),roomLabel:'Synthetic joint site',concurrencyGroupId:g.id},
        {...slot(2),roomLabel:'Synthetic joint site',concurrencyGroupId:g.id}];
      await service.replace(d.id,{expectedRevision:0,slots},admin.auth.keycloakId,key());
      expect((await service.precheck(d.id,{},admin.auth.keycloakId)).errors).toEqual([]);
      await expect(service.replace(d.id,{expectedRevision:1,slots:slots.slice(0,1)},admin.auth.keycloakId,key())).rejects.toBeInstanceOf(ConflictException);
      await expect(service.replace(d.id,{expectedRevision:1,slots:slots.map(s=>({...s,concurrencyGroupId:randomUUID()}))},admin.auth.keycloakId,key())).rejects.toBeInstanceOf(ConflictException);
      await prisma.scheduleConcurrencyGroup.update({where:{id:g.id},data:{expiresOn:new Date(date(4))}});
      expect((await service.precheck(d.id,{},admin.auth.keycloakId)).errors.some(e=>e.code==='CONCURRENCY_NOT_EXACT_ACTIVE_BASELINE')).toBe(true);
      await prisma.scheduleConcurrencyGroup.update({where:{id:g.id},data:{expiresOn:new Date(date(-1))}});
      await expect(service.replace(d.id,{expectedRevision:1,slots},admin.auth.keycloakId,key())).rejects.toBeInstanceOf(ConflictException);
      await prisma.schedule.deleteMany({where:{id:{in:baseline}}}); baseline.length=0;
      await prisma.scheduleConcurrencyGroup.delete({where:{id:g.id}});
      expect((await service.get(d.id,admin.auth.keycloakId)).stale).toBe(true);
    } finally {
      if(baseline.length) await prisma.schedule.deleteMany({where:{id:{in:baseline}}});
      await prisma.scheduleConcurrencyGroup.deleteMany({where:{id:g.id}});
    }
  });
  it.each(['valid','invalid','unknown-fields','missing-root','database-readonly'])('A08 pure API precheck %s changes no row in any table', async (kind) => {
    const d=await create(); const before=await allTableBytes();
    if(kind==='database-readonly') {
      // The actual read transaction rejects writes; use an injected period lock probe in that transaction.
      const probe=new SchedulingService(db,permissions,
        { acquireCutoverLock: async (tx: Prisma.TransactionClient)=>{
          await tx.auditLog.create({data:{actorRoles:[],action:'must-fail',method:'TEST',path:'/',statusCode:200,outcome:'success'}});
        } } as unknown as AcademicPeriodService,audit);
      await expect(probe.precheck(d.id,{},admin.auth.keycloakId)).rejects.toThrow(/read.only/i);
    } else {
      const response=await app.inject({method:'POST',url:'/api/v1/scheduling/drafts/'+(kind==='missing-root'?randomUUID():d.id)+'/validate',
        headers:{'x-wave1a-user':admin.auth.keycloakId},payload:kind==='invalid'?{slots:[slot(),slot(1)]}:kind==='unknown-fields'?{persist:true}:{}});
      expect(response.statusCode).toBe(kind==='unknown-fields'?400:kind==='missing-root'?404:201);
      if(kind==='invalid') expect(response.json().precheckValid).toBe(false);
    }
    await new Promise((r)=>setTimeout(r,10));
    expect(await allTableBytes()).toBe(before);
  });
  it('A02/A04 actual Fastify guards reject unauthenticated, role spoof and inactive accounts; absent solver routes stay 404', async () => {
    const teacher=await employee('GURU'); const inactive=await employee();
    await users.updateActive(inactive.user.id,false,admin.auth.keycloakId);
    const path='/api/v1/scheduling/drafts?academicYearId='+yearId+'&semesterNumber=1';
    for(const actor of [undefined,teacher.auth.keycloakId,inactive.auth.keycloakId]) {
      const r=await app.inject({method:'GET',url:path,headers:actor?{'x-wave1a-user':actor}:{}});
      expect(r.statusCode).toBe(403);
    }
    expect((await app.inject({method:'GET',url:path,headers:{'x-wave1a-user':admin.auth.keycloakId}})).statusCode).toBe(200);
    const d=await create();
    for(const action of ['publish','generate','restore']) expect((await app.inject({method:'POST',
      url:'/api/v1/scheduling/drafts/'+d.id+'/'+action,headers:{'x-wave1a-user':admin.auth.keycloakId},payload:{}})).statusCode).toBe(404);
  });
  it('A07 HTTP mutative audit remains separate from one atomic domain event', async () => {
    const before=await prisma.auditLog.count({where:{action:'scheduling.http.CREATE'}});
    const response=await app.inject({method:'POST',url:'/api/v1/scheduling/drafts',
      headers:{'x-wave1a-user':admin.auth.keycloakId,'idempotency-key':key()},payload:body()});
    expect(response.statusCode).toBe(201);
    await new Promise((r)=>setTimeout(r,30));
    expect(await prisma.auditLog.count({where:{action:'scheduling.http.CREATE'}})).toBe(before+1);
    expect(await prisma.auditLog.count({where:{resourceId:response.json().id,method:'DOMAIN'}})).toBe(1);
  });
  it.each(['disable','role','delete'] as const)('A03 actual %s winning while request waits blocks all draft side effects', async (action) => {
    const actor=await employee(); const before=await domainCounts();
    const held=await hold('academic:schedule:mutation:v1');
    const pending=create(actor.auth.keycloakId).then(()=>null,(err:unknown)=>err);
    try {
      await waiter('academic:schedule:mutation:v1');
      if(action==='disable') await users.updateActive(actor.user.id,false,admin.auth.keycloakId);
      else if(action==='role') await users.updateRole(actor.user.id,'GURU',admin.auth.keycloakId);
      else await prisma.$transaction(async(tx)=> {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('users:last-active-super-admin'))`);
        await tx.user.delete({where:{id:actor.user.id}}); // Dedicated no-relations fixture only.
      });
    } finally {held.release();await held.completion;}
    expect(await pending).toBeInstanceOf(ForbiddenException);
    expect(await domainCounts()).toEqual(before);
  });
  it.each(['disable','role'] as const)('A03 mutation winning identity lock commits before real %s, replay then fails closed', async (action) => {
    const actor=await employee(); const entered=deferred(); const release=deferred();
    const extended=prisma.$extends({query:{schedulingVersion:{async create({args,query}) {
      entered.release(); await release.promise; return query(args);
    }}}});
    const controlled=new SchedulingService(extended as unknown as PrismaService,permissions,period,audit);
    const k=key(); const pending=controlled.create(body(),actor.auth.keycloakId,k);
    let revoke:Promise<unknown>|undefined;
    try {
      await Promise.race([entered.promise,pending.then(()=>{throw new Error('Must pause inside identity lock');})]);
      revoke=action==='disable'?users.updateActive(actor.user.id,false,admin.auth.keycloakId):
        users.updateRole(actor.user.id,'GURU',admin.auth.keycloakId);
      await waiter('users:last-active-super-admin');
    } finally {release.release();}
    const result=await pending; await revoke;
    expect(await prisma.schedulingVersion.count({where:{id:result.id}})).toBe(1);
    const before=await domainCounts();
    await expect(service.create(body(),actor.auth.keycloakId,k)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.get(result.id,actor.auth.keycloakId)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await domainCounts()).toEqual(before);
  });
  it('A01 feature disabled on actual HTTP performs no domain mutation', async () => {
    const before=await domainCounts(); process.env.SMART_SCHEDULER_ENABLED='false';
    const r=await app.inject({method:'POST',url:'/api/v1/scheduling/drafts',
      headers:{'x-wave1a-user':admin.auth.keycloakId,'idempotency-key':key()},payload:body()});
    expect(r.statusCode).toBe(503); expect(await domainCounts()).toEqual(before);
  });
  it('A21 configured batch ceiling and strict fields reject without row loss', async () => {
    const d=await create(); const before=await domainCounts();
    process.env.SMART_SCHEDULER_MAX_DRAFT_SLOTS='1';
    try {
      await expect(service.replace(d.id,{expectedRevision:0,slots:[slot(),slot(1,4,6)]},admin.auth.keycloakId,key())).rejects.toThrow();
      await expect(service.replace(d.id,{expectedRevision:0,slots:[{...slot(),teacherId:teachers[1]}]},admin.auth.keycloakId,key())).rejects.toThrow();
      await expect(service.create({...body(),effectiveUntil:'2035-01-01'},admin.auth.keycloakId,key())).rejects.toThrow('Rentang occurrence');
      expect(await domainCounts()).toEqual(before);
    } finally { delete process.env.SMART_SCHEDULER_MAX_DRAFT_SLOTS; }
  });
});
