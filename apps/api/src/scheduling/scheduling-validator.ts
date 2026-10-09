import { DraftSlot } from './dto/scheduling-draft.dto';
import { DraftScope, SchedulingSnapshot } from './scheduling-input-snapshot';

export interface DraftIssue { code: string; slot?: number; assignmentId?: string; date?: string }
const overlaps = (a: { jpStart: number; jpEnd: number }, b: { jpStart: number; jpEnd: number }) =>
  a.jpStart <= b.jpEnd && a.jpEnd >= b.jpStart;
const placement = (s: { assignmentId: string; dayOfWeek: number; jpStart: number; jpEnd: number; roomLabel: string | null }) =>
  [s.assignmentId, s.dayOfWeek, s.jpStart, s.jpEnd, s.roomLabel].join('|');

/** Pure bounded precheck. A successful save is not a solver/publish certificate. */
export function validateDraft(
  scope: DraftScope, input: SchedulingSnapshot, slots: DraftSlot[], today: string,
) {
  const errors: DraftIssue[] = [];
  const warnings: DraftIssue[] = [];
  const classes = new Set(scope.classIds);
  const assignmentMap = new Map(input.assignments.map((a) => [a.id, a]));
  const groupMap = new Map(input.groups.map((g) => [g.id, g]));
  const period = input.period;
  if (!period || period.academicYearId !== scope.academicYearId || period.number !== scope.semesterNumber) {
    errors.push({ code: 'PERIOD_NOT_FOUND' });
  } else {
    if (period.closed) errors.push({ code: 'PERIOD_CLOSED' });
    if (scope.effectiveFrom < period.startDate || scope.effectiveUntil > period.endDate ||
      scope.effectiveUntil < scope.effectiveFrom) errors.push({ code: 'EFFECTIVE_RANGE_OUTSIDE_PERIOD' });
  }
  if (scope.classIds.some((id) => !input.classes.some((c) => c.id === id && c.active))) {
    errors.push({ code: 'CLASS_SCOPE_INVALID' });
  }

  // Calendar days are bounded by the registered semester; a holiday removes occurrences, not the weekday template.
  const datesByDay = new Map<number, string[]>();
  if (period && !errors.some((e) => e.code === 'EFFECTIVE_RANGE_OUTSIDE_PERIOD')) {
    for (let ms = Date.parse(scope.effectiveFrom); ms <= Date.parse(scope.effectiveUntil); ms += 86400000) {
      const date = new Date(ms).toISOString().slice(0, 10);
      if (input.holidays.some((h) => h.startDate <= date && h.endDate >= date)) continue;
      const day = new Date(ms).getUTCDay() || 7;
      datesByDay.set(day, [...(datesByDay.get(day) ?? []), date]);
    }
  }
  const unique = new Set<string>();
  const totals = new Map<string, number>();
  const retained = new Map<string, DraftSlot[]>();
  const occupancy = new Map<string, { slot: DraftSlot; index: number }[]>();
  slots.forEach((slot, index) => {
    const a = assignmentMap.get(slot.assignmentId);
    const key = slot.assignmentId + ':' + slot.sessionIndex;
    if (unique.has(key)) errors.push({ code: 'DUPLICATE_SESSION_INDEX', slot: index });
    unique.add(key);
    if (!a || !classes.has(a.classId) || !a.eligible || a.hoursPerWeek <= 0) {
      errors.push({ code: 'ASSIGNMENT_INVALID_OR_OUTSIDE_SCOPE', slot: index }); return;
    }
    totals.set(a.id, (totals.get(a.id) ?? 0) + slot.jpEnd - slot.jpStart + 1);
    const dates = datesByDay.get(slot.dayOfWeek) ?? [];
    if (!dates.length) errors.push({ code: 'NO_TEACHING_OCCURRENCE', slot: index });
    for (const date of dates) {
      const profiles = input.profiles.filter((p) => p.effectiveFrom <= date && (!p.effectiveUntil || p.effectiveUntil >= date));
      if (profiles.length !== 1 || profiles[0]!.timezone !== 'Asia/Jakarta') {
        errors.push({ code: 'BELL_PROFILE_MISSING_OR_AMBIGUOUS', slot: index, date }); break;
      }
      const all = profiles[0]!.segments;
      const daily = all.filter((s) => s.dayOfWeek === (all.some((s) => s.dayOfWeek !== 0) ? slot.dayOfWeek : 0));
      const instructions = daily.filter((s) => s.type === 'INSTRUCTION').sort((x, y) => (x.jpNumber ?? 0) - (y.jpNumber ?? 0));
      const window = instructions.filter((s) => s.jpNumber !== null && s.jpNumber >= slot.jpStart && s.jpNumber <= slot.jpEnd);
      if (window.length !== slot.jpEnd - slot.jpStart + 1 ||
          new Set(instructions.map((s) => s.jpNumber)).size !== instructions.length ||
          instructions.some((s, i) => s.jpNumber === null || s.startMinute < 0 || s.endMinute > 1440 ||
            s.endMinute <= s.startMinute || (i > 0 && s.startMinute < instructions[i - 1]!.endMinute)) ||
          window.some((s, i) => i > 0 && s.startMinute !== window[i - 1]!.endMinute)) {
        errors.push({ code: 'JP_UNAVAILABLE_OR_NONCONTIGUOUS', slot: index, date }); break;
      }
    }
    if (slot.concurrencyGroupId) {
      retained.set(slot.concurrencyGroupId, [...(retained.get(slot.concurrencyGroupId) ?? []), slot]);
    }
    const identities = ['class:' + a.classId, 'teacher:' + a.teacherId];
    if (slot.roomLabel) identities.push('room:' + slot.roomLabel.toLocaleLowerCase().replace(/\s+/g, ' '));
    for (const kind of identities) {
      const bucket = kind + ':' + slot.dayOfWeek;
      occupancy.set(bucket, [...(occupancy.get(bucket) ?? []), { slot, index }]);
    }
  });

  const validGroups = new Set<string>();
  for (const [id, members] of retained) {
    const g = groupMap.get(id);
    const baseline = input.baseline.filter((s) => s.concurrencyGroupId === id);
    const fixed = baseline.filter((s) => !classes.has(s.classId));
    const expected = baseline.filter((s) => classes.has(s.classId)).map(placement).sort();
    const supplied = members.map(placement).sort();
    const allMembers = [...members, ...fixed];
    const valid = g && g.approvedBy.trim() && ['JOINT_CLASS', 'AUTHORIZED_EXCEPTION'].includes(g.mode) &&
      (g.mode !== 'AUTHORIZED_EXCEPTION' || g.expiresOn !== null) &&
      (!g.expiresOn || (g.expiresOn >= today &&
        (datesByDay.get(g.dayOfWeek) ?? []).every((date) => date <= g.expiresOn!))) &&
      baseline.length >= 2 && allMembers.length === baseline.length &&
      new Set(baseline.map((s) => s.classId)).size === baseline.length &&
      expected.length === supplied.length && expected.every((s, i) => s === supplied[i]) &&
      allMembers.every((s) => s.dayOfWeek === g.dayOfWeek && s.jpStart === g.jpStart && s.jpEnd === g.jpEnd &&
        assignmentMap.get(s.assignmentId)?.teacherId === g.teacherId &&
        assignmentMap.get(s.assignmentId)?.eligible) &&
      (g.mode !== 'JOINT_CLASS' || (allMembers.every((s) => s.roomLabel && s.roomLabel === allMembers[0]!.roomLabel) &&
        allMembers.every((s) => assignmentMap.get(s.assignmentId)?.subject === assignmentMap.get(allMembers[0]!.assignmentId)?.subject)));
    if (valid) validGroups.add(id);
    else errors.push({ code: 'CONCURRENCY_NOT_EXACT_ACTIVE_BASELINE' });
  }

  // Sweep per identity/day; no unbounded all-slot cross product. Stop at first conflict per bucket.
  for (const [bucket, rows] of occupancy) {
    rows.sort((a, b) => a.slot.jpStart - b.slot.jpStart);
    let active: typeof rows = [];
    for (const row of rows) {
      active = active.filter((prior) => prior.slot.jpEnd >= row.slot.jpStart);
      const conflict = active.find((prior) => overlaps(prior.slot, row.slot) &&
        !(!bucket.startsWith('class:') && row.slot.concurrencyGroupId &&
          row.slot.concurrencyGroupId === prior.slot.concurrencyGroupId && validGroups.has(row.slot.concurrencyGroupId) &&
          (bucket.startsWith('teacher:') || groupMap.get(row.slot.concurrencyGroupId)?.mode === 'JOINT_CLASS')));
      if (conflict) {
        errors.push({ code: bucket.startsWith('class:') ? 'CLASS_OVERLAP' :
          bucket.startsWith('teacher:') ? 'TEACHER_OVERLAP' : 'ROOM_LABEL_OVERLAP', slot: row.index }); break;
      }
      active.push(row);
    }
  }
  // Classes outside this draft remain operationally fixed.
  const external = new Map<string, typeof input.baseline>();
  for (const b of input.baseline) {
    if (classes.has(b.classId)) continue;
    const teacher = assignmentMap.get(b.assignmentId)?.teacherId;
    const keys = teacher ? ['teacher:' + teacher + ':' + b.dayOfWeek] : [];
    if (b.roomLabel) keys.push('room:' + b.roomLabel.trim().toLowerCase().replace(/\s+/g, ' ') + ':' + b.dayOfWeek);
    for (const key of keys) external.set(key, [...(external.get(key) ?? []), b]);
  }
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const a = assignmentMap.get(slot.assignmentId);
    if (!a) continue;
    const candidates = [...(external.get('teacher:' + a.teacherId + ':' + slot.dayOfWeek) ?? []),
      ...(slot.roomLabel ? external.get('room:' + slot.roomLabel.toLowerCase().replace(/\s+/g, ' ') + ':' + slot.dayOfWeek) ?? [] : [])];
    const conflict = candidates.find((b) => {
      if (!overlaps(b, slot)) return false;
      const sameTeacher = assignmentMap.get(b.assignmentId)?.teacherId === a.teacherId;
      const sameRoom = Boolean(slot.roomLabel && b.roomLabel &&
        slot.roomLabel.toLocaleLowerCase().replace(/\s+/g, ' ') === b.roomLabel.trim().toLocaleLowerCase().replace(/\s+/g, ' '));
      const group = slot.concurrencyGroupId && b.concurrencyGroupId === slot.concurrencyGroupId &&
        validGroups.has(slot.concurrencyGroupId);
      return (sameTeacher && !group) || (sameRoom && !(group && groupMap.get(slot.concurrencyGroupId!)?.mode === 'JOINT_CLASS'));
    });
    if (conflict) errors.push({ code: 'FIXED_EXTERNAL_OCCUPANCY_OVERLAP', slot: i });
  }
  const coverage = input.assignments.filter((a) => classes.has(a.classId)).map((a) => {
    const allocatedJp = totals.get(a.id) ?? 0;
    if (allocatedJp > a.hoursPerWeek) errors.push({ code: 'ASSIGNMENT_JP_OVERFLOW', assignmentId: a.id });
    if (allocatedJp < a.hoursPerWeek) warnings.push({ code: 'ASSIGNMENT_JP_INCOMPLETE', assignmentId: a.id });
    if (!a.eligible || a.hoursPerWeek <= 0) errors.push({ code: 'ASSIGNMENT_NOT_ELIGIBLE', assignmentId: a.id });
    return { assignmentId: a.id, targetJp: a.hoursPerWeek, allocatedJp, missingJp: Math.max(0, a.hoursPerWeek - allocatedJp) };
  });
  return { kind: 'DRAFT_PRECHECK' as const, errors, warnings, coverage,
    notVerified: ['STRUCTURED_FACILITY_CAPACITY', 'EQUIPMENT_AND_SAFETY', 'TEACHER_AVAILABILITY'],
    solverStatus: null, publishable: false as const, precheckValid: errors.length === 0 };
}
