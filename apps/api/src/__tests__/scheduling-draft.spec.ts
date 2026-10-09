import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { SKIP_AUDIT_KEY } from '../audit-log/decorators/audit.decorator';
import {
  CreateDraftSchema, DraftSlot, DraftSlotSchema, ListDraftSchema, ReplaceDraftSchema, parseDraft,
} from '../scheduling/dto/scheduling-draft.dto';
import { SchedulingController } from '../scheduling/scheduling.controller';
import { canonicalJson, digest, DraftScope, SchedulingSnapshot } from '../scheduling/scheduling-input-snapshot';
import { schedulingPolicy } from '../scheduling/scheduling-feature-policy';
import { validateDraft } from '../scheduling/scheduling-validator';

const uuid = (n: number) => '84000000-0000-4000-8000-' + String(n).padStart(12, '0');
const scope: DraftScope = { academicYearId: uuid(1), semesterNumber: 1, effectiveFrom: '2026-10-05',
  effectiveUntil: '2026-10-17', classIds: [uuid(2), uuid(3)] };
function fixture(): SchedulingSnapshot {
  return { schemaVersion: 1, period: { id: uuid(4), academicYearId: uuid(1), academicYear: '2026/2027',
    number: 1, startDate: '2026-10-05', endDate: '2026-10-17', closed: false },
    classes: scope.classIds.map((id) => ({ id, active: true })),
    assignments: [
      { id: uuid(10), teacherId: uuid(20), classId: uuid(2), subject: 'Produktif', hoursPerWeek: 3, eligible: true },
      { id: uuid(11), teacherId: uuid(21), classId: uuid(2), subject: 'Produktif', hoursPerWeek: 3, eligible: true },
      { id: uuid(12), teacherId: uuid(20), classId: uuid(3), subject: 'Produktif', hoursPerWeek: 3, eligible: true },
    ], baseline: [], groups: [], holidays: [], profiles: [
      { id: uuid(30), effectiveFrom: '2026-10-05', effectiveUntil: '2026-10-17', timezone: 'Asia/Jakarta',
        segments: [1,2,3,4,5,6].flatMap((dayOfWeek) => Array.from({ length: dayOfWeek === 5 ? 8 : 10 }, (_, i) => ({
          dayOfWeek, jpNumber: i + 1, type: 'INSTRUCTION', startMinute: 420 + i * 35,
          endMinute: 455 + i * 35, sortOrder: i + 1,
        }))) },
    ] };
}
const slot = (assignment = 10, start = 1, end = 3, day = 1): DraftSlot => ({
  assignmentId: uuid(assignment), sessionIndex: 0, dayOfWeek: day, jpStart: start, jpEnd: end,
  roomLabel: null, concurrencyGroupId: null,
});
const check = (input: SchedulingSnapshot, slots: DraftSlot[], target = scope) =>
  validateDraft(target, input, slots, '2026-10-06');
const codes = (result: ReturnType<typeof check>) => result.errors.map((e) => e.code);

describe('Scheduling Wave 1A pure contract and negative controls', () => {
  const savedEnv = { ...process.env };
  afterEach(() => { process.env = { ...savedEnv }; });
  it.each([undefined, 'false', 'TRUE', '1', '', ' true '])('A01 exact opt-in rejects %s', (flag) => {
    if (flag === undefined) delete process.env.SMART_SCHEDULER_ENABLED;
    else process.env.SMART_SCHEDULER_ENABLED = flag;
    expect(() => schedulingPolicy()).toThrow();
  });
  it('A01 configurable ceilings fail closed rather than using school counts', () => {
    process.env.SMART_SCHEDULER_ENABLED = 'true';
    expect(schedulingPolicy()).toEqual({ maxSlots: 1000, maxClasses: 256, maxOccurrenceDays: 370 });
    process.env.SMART_SCHEDULER_MAX_DRAFT_SLOTS = '17';
    expect(schedulingPolicy().maxSlots).toBe(17);
    process.env.SMART_SCHEDULER_MAX_DRAFT_SLOTS = 'NaN';
    expect(() => schedulingPolicy()).toThrow();
  });
  it('A02 protected controller, only pure validation skips audit, no publish/solver methods', () => {
    const reflector = new Reflector();
    expect(reflector.get(IS_PUBLIC_KEY, SchedulingController)).toBeUndefined();
    const methods = Object.getOwnPropertyNames(SchedulingController.prototype).filter((s) => s !== 'constructor');
    expect(methods.sort()).toEqual(['archive', 'create', 'get', 'list', 'precheck', 'rename', 'replace']);
    for (const method of methods) {
      const handler = SchedulingController.prototype[method as keyof SchedulingController];
      expect(reflector.get(SKIP_AUDIT_KEY, handler)).toBe(method === 'precheck' ? true : undefined);
      expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
    }
  });
  it('A15 sequential competency parts preserve separate teachers and JP', () => {
    const result = check(fixture(), [slot(), slot(11, 4, 6), slot(12, 7, 9)]);
    expect(result.errors).toEqual([]);
    expect(result.coverage.map((c) => c.allocatedJp)).toEqual([3,3,3]);
    expect(result.publishable).toBe(false);
    expect(result.solverStatus).toBeNull();
  });
  it('A15 simultaneous different teachers still collide in the same class', () => {
    expect(codes(check(fixture(), [slot(), slot(11)]))).toContain('CLASS_OVERLAP');
  });
  it('A16 incomplete allocation is visible and overflow is rejected', () => {
    const result = check(fixture(), [slot(10, 1, 2)]);
    expect(result.warnings[0]?.code).toBe('ASSIGNMENT_JP_INCOMPLETE');
    expect(result.coverage[0]?.missingJp).toBe(1);
    expect(codes(check(fixture(), [slot(10, 1, 4)]))).toContain('ASSIGNMENT_JP_OVERFLOW');
  });
  it('A17 10-JP day allows JP 9 but 8-JP Friday rejects it; 35-min is not coerced to 40', () => {
    expect(codes(check(fixture(), [slot(10, 9, 9)]))).toEqual([]);
    expect(codes(check(fixture(), [slot(10, 9, 9, 5)]))).toContain('JP_UNAVAILABLE_OR_NONCONTIGUOUS');
  });
  it('A17 every occurrence uses its own future profile, not today', () => {
    const input = fixture();
    input.profiles[0]!.effectiveUntil = '2026-10-11';
    input.profiles.push({ ...input.profiles[0]!, id: uuid(31), effectiveFrom: '2026-10-12',
      effectiveUntil: '2026-10-17', segments: input.profiles[0]!.segments.filter((s) => s.jpNumber !== 10) });
    const result = check(input, [slot(10, 10, 10)]);
    expect(result.errors).toContainEqual({ code: 'JP_UNAVAILABLE_OR_NONCONTIGUOUS', slot: 0, date: '2026-10-12' });
  });
  it('A17 BREAK and empty JP holes cannot be crossed by one continuous session', () => {
    const input = fixture();
    for (const s of input.profiles[0]!.segments) if (s.jpNumber! >= 3) { s.startMinute += 15; s.endMinute += 15; }
    expect(codes(check(input, [slot(10, 2, 3)]))).toContain('JP_UNAVAILABLE_OR_NONCONTIGUOUS');
    expect(codes(check(input, [slot(10, 3, 4)]))).toEqual([]);
  });
  it('A18 a single holiday removes that date, not every weekly occurrence', () => {
    const input = fixture();
    input.holidays.push({ startDate: '2026-10-05', endDate: '2026-10-05' });
    expect(codes(check(input, [slot()]))).toEqual([]);
    input.holidays.push({ startDate: '2026-10-12', endDate: '2026-10-12' });
    expect(codes(check(input, [slot()]))).toContain('NO_TEACHING_OCCURRENCE');
  });
  it.each(['missing', 'ambiguous', 'timezone'])('A17 %s profile fails closed', (kind) => {
    const input = fixture();
    if (kind === 'missing') input.profiles = [];
    if (kind === 'ambiguous') input.profiles.push({ ...input.profiles[0]!, id: uuid(31) });
    if (kind === 'timezone') input.profiles[0]!.timezone = 'UTC';
    expect(codes(check(input, [slot()]))).toContain('BELL_PROFILE_MISSING_OR_AMBIGUOUS');
  });
  function approved() {
    const input = fixture();
    input.groups.push({ id: uuid(40), teacherId: uuid(20), mode: 'JOINT_CLASS', approvedBy: uuid(50),
      dayOfWeek: 1, jpStart: 1, jpEnd: 3, expiresOn: '2026-10-17' });
    const slots = [slot(), slot(12)];
    for (const s of slots) { s.concurrencyGroupId = uuid(40); s.roomLabel = 'Lapangan'; }
    input.baseline = slots.map((s,i) => ({ ...s, id: uuid(60+i), classId: scope.classIds[i]! }));
    return { input, slots };
  }
  it('A19 exact approved baseline is retained, not newly authorized', () => {
    const { input, slots } = approved();
    expect(check(input, slots).errors).toEqual([]);
  });
  it.each(['partial', 'expanded', 'expired', 'extended', 'moved', 'forged', 'approval'])('A19 %s binding rejected', (kind) => {
    const { input, slots } = approved();
    if (kind === 'partial') slots.pop();
    if (kind === 'expanded') slots.push({ ...slots[0]!, sessionIndex: 1 });
    if (kind === 'expired') input.groups[0]!.expiresOn = '2026-10-05';
    if (kind === 'extended') input.groups[0]!.expiresOn = '2026-10-10';
    if (kind === 'moved') slots[0]!.jpStart = 2;
    if (kind === 'forged') input.groups = [];
    if (kind === 'approval') input.groups[0]!.approvedBy = '';
    expect(codes(check(input, slots))).toContain('CONCURRENCY_NOT_EXACT_ACTIVE_BASELINE');
  });
  it('A19 baseline exception never waives class collision', () => {
    const { input, slots } = approved();
    input.assignments[2]!.classId = uuid(2);
    input.baseline[1]!.classId = uuid(2);
    expect(codes(check(input, slots))).toContain('CLASS_OVERLAP');
  });
  it('A20 room labels detect concurrent occupancy but do not prove workshop/PC capacity', () => {
    const a = slot(); const b = slot(11); b.assignmentId = uuid(12);
    const input = fixture(); input.assignments[2]!.teacherId = uuid(21);
    a.roomLabel = 'Lab A'; b.roomLabel = 'lab A';
    const result = check(input, [a,b]);
    expect(codes(result)).toContain('ROOM_LABEL_OVERLAP');
    expect(result.notVerified).toContain('EQUIPMENT_AND_SAFETY');
    expect(result.publishable).toBe(false);
  });
  it('A14 captured semantic source digest changes when master is edited/deleted', () => {
    const input = fixture(); const original = digest(input);
    input.assignments[0]!.hoursPerWeek++;
    expect(digest(input)).not.toBe(original);
    input.assignments.shift();
    expect(codes(check(input, [slot()]))).toContain('ASSIGNMENT_INVALID_OR_OUTSIDE_SCOPE');
  });
  it('A21 duplicate session indexes are not silently deduplicated', () => {
    expect(codes(check(fixture(), [slot(10,1,1),slot(10,2,2)]))).toContain('DUPLICATE_SESSION_INDEX');
  });
  it.each([
    { ...slot(), teacherId: uuid(20) }, { ...slot(), locked: true }, { ...slot(), jpStart: 1.5 },
    { ...slot(), jpStart: 0 }, { ...slot(), jpStart: 4, jpEnd: 3 },
  ])('A21 rejects illegal slot input %j', (raw) => {
    expect(() => parseDraft(DraftSlotSchema, raw)).toThrow(BadRequestException);
  });
  it('A21 unknown create/list fields, calendar errors, duplicate scope and oversized batches reject', () => {
    const create = { ...scope, name: 'Draft' };
    expect(CreateDraftSchema.safeParse({ ...create, status: 'PUBLISHED' }).success).toBe(false);
    expect(CreateDraftSchema.safeParse({ ...create, effectiveFrom: '2026-02-30' }).success).toBe(false);
    expect(CreateDraftSchema.safeParse({ ...create, classIds: [uuid(2),uuid(2)] }).success).toBe(false);
    expect(ListDraftSchema.safeParse({ academicYearId: uuid(1), semesterNumber: 1, all: true }).success).toBe(false);
    expect(ReplaceDraftSchema.safeParse({ expectedRevision: 0, slots: Array(10001).fill(slot()) }).success).toBe(false);
  });
  it('A06 invalid period/range/class is rejected', () => {
    const input = fixture(); input.period!.closed = true; input.classes = [];
    const result = check(input, [], { ...scope, effectiveFrom: '2026-10-04' });
    expect(codes(result)).toEqual(expect.arrayContaining(['PERIOD_CLOSED','EFFECTIVE_RANGE_OUTSIDE_PERIOD','CLASS_SCOPE_INVALID']));
  });
  it('Canonical request object keys are stable without ignoring array order', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(digest({ b: 2, a: 1 })).toBe(digest({ a: 1, b: 2 }));
    expect(digest([1,2])).not.toBe(digest([2,1]));
  });
});
