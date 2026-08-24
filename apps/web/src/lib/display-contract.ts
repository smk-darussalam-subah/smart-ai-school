export type DisplayProfile = 'RUANG_GURU' | 'RUANG_TU';
export type SessionState = 'SCHEDULED' | 'REASSIGNED' | 'STARTED' | 'COMPLETED' | 'MISSED' | 'CANCELLED' | 'SUPERSEDED';
export type AlertSeverity = 'ATTENTION' | 'ESCALATED' | 'CRITICAL';

export interface DisplaySession {
  id: string;
  className: string;
  subject: string;
  room: string | null;
  teacherName: string | null;
  startsAt: string;
  endsAt: string;
  status: SessionState;
  lateByMinutes: number | null;
}

export interface DisplayAlert {
  id: string;
  eventKey: string;
  className: string;
  room: string | null;
  stage: string;
  severity: AlertSeverity;
  dueAt: string;
  acknowledged: boolean;
  audible: boolean;
}

export interface DisplayAgenda {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
}

export interface DisplayOperationItem {
  key: string;
  label: string;
  count: number;
  tone: 'neutral' | 'attention' | 'critical';
}

export interface DisplaySnapshot {
  profile: DisplayProfile;
  generatedAt: string;
  staleAfterSeconds: number;
  device: {
    label: string;
    audibleLeader: boolean;
  };
  schoolDay: {
    dateLabel: string;
    clockLabel: string;
    currentSegment: string | null;
    nextSegment: string | null;
  };
  sessions: DisplaySession[];
  alerts: DisplayAlert[];
  agenda: DisplayAgenda[];
  operations: DisplayOperationItem[];
  attendance: {
    present: number;
    total: number;
  } | null;
}

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(...values: unknown[]): string {
  const value = values.find((item) => typeof item === 'string' && item.trim());
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

function nullableText(...values: unknown[]): string | null {
  return text(...values) || null;
}

function integer(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function iso(value: unknown): string {
  const candidate = typeof value === 'string' ? value : '';
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : '';
}

function sessionState(value: unknown): SessionState {
  const allowed: SessionState[] = ['SCHEDULED', 'REASSIGNED', 'STARTED', 'COMPLETED', 'MISSED', 'CANCELLED', 'SUPERSEDED'];
  return allowed.includes(value as SessionState) ? value as SessionState : 'SCHEDULED';
}

function severity(value: unknown, stage: string): AlertSeverity {
  if (value === 'CRITICAL' || value === 'ESCALATED' || value === 'ATTENTION') return value;
  if (stage === 'ESCALATION_T15') return 'CRITICAL';
  if (stage === 'ROOM_T10') return 'ESCALATED';
  return 'ATTENTION';
}

function normalizeSession(value: unknown): DisplaySession | null {
  const source = record(value);
  const id = text(source.id) || [source.className, source.classNameSnapshot, source.subject, source.subjectSnapshot, source.scheduledStartAt, source.startsAt]
    .map((part) => text(part)).filter(Boolean).join(':').slice(0, 300);
  const className = text(source.className, source.classNameSnapshot);
  const subject = text(source.subject, source.subjectSnapshot);
  const startsAt = iso(source.startsAt) || iso(source.scheduledStartAt);
  const endsAt = iso(source.endsAt) || iso(source.scheduledEndAt);
  if (!id || !className || !subject || !startsAt || !endsAt) return null;
  return {
    id,
    className,
    subject,
    room: nullableText(source.room, source.roomSnapshot),
    teacherName: nullableText(source.teacherName, source.assignedTeacherName, source.scheduledTeacher),
    startsAt,
    endsAt,
    status: sessionState(source.status),
    lateByMinutes: typeof source.lateByMinutes === 'number' ? integer(source.lateByMinutes) : null,
  };
}

function normalizeAlert(value: unknown): DisplayAlert | null {
  const source = record(value);
  const session = record(source.session);
  const visual = record(source.visual);
  const id = text(source.id, source.alertId, source.deliveryId);
  const eventKey = text(source.eventKey, `${id}:${text(source.stage)}`);
  const className = text(source.className, session.className, session.classNameSnapshot, visual.className);
  const stage = text(source.stage);
  if (!id || !eventKey || !className || !stage) return null;
  return {
    id,
    eventKey,
    className,
    room: nullableText(source.room, session.room, session.roomSnapshot, visual.room),
    stage,
    severity: severity(source.severity, stage),
    dueAt: iso(source.dueAt) || iso(source.createdAt),
    acknowledged: source.acknowledged === true || source.status === 'ACKNOWLEDGED',
    audible: source.audible === true,
  };
}

function normalizeAgenda(value: unknown): DisplayAgenda | null {
  const source = record(value);
  const id = text(source.id);
  const title = text(source.title, source.name);
  const startsAt = iso(source.startsAt) || iso(source.startDate);
  if (!id || !title || !startsAt) return null;
  return { id, title, startsAt, endsAt: iso(source.endsAt) || iso(source.endDate) || null };
}

function normalizeOperation(value: unknown): DisplayOperationItem | null {
  const source = record(value);
  const key = text(source.key, source.code);
  const label = text(source.label, source.name);
  if (!key || !label) return null;
  const tone = source.tone === 'critical' || source.tone === 'attention' ? source.tone : 'neutral';
  return { key, label, count: integer(source.count), tone };
}

export function normalizeDisplaySnapshot(input: unknown, expectedProfile?: DisplayProfile): DisplaySnapshot | null {
  const source = record(input);
  const device = record(source.device);
  const freshness = record(source.freshness);
  const bell = record(source.bell);
  const profile = source.profile ?? device.profile;
  if (profile !== 'RUANG_GURU' && profile !== 'RUANG_TU') return null;
  if (expectedProfile && profile !== expectedProfile) return null;
  const schoolDay = record(source.schoolDay);
  const attendance = record(source.attendance);
  const generatedAt = iso(source.generatedAt) || iso(freshness.generatedAt);
  if (!generatedAt) return null;
  const generatedDate = new Date(generatedAt);
  const minuteParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(generatedDate);
  const generatedMinute = Number(minuteParts.find((part) => part.type === 'hour')?.value ?? 0) * 60
    + Number(minuteParts.find((part) => part.type === 'minute')?.value ?? 0);
  const segments = array(bell.segments).map(record);
  const currentSegment = segments.find((segment) => integer(segment.startMinute) <= generatedMinute && integer(segment.endMinute) > generatedMinute);
  const nextSegment = segments.find((segment) => integer(segment.startMinute) > generatedMinute);

  const present = integer(attendance.present);
  const total = integer(attendance.total);
  return {
    profile,
    generatedAt,
    staleAfterSeconds: Math.min(300, Math.max(30, integer(source.staleAfterSeconds ?? freshness.staleAfterSeconds, 75))),
    device: {
      label: text(device.label, source.deviceLabel) || 'Display DIIS',
      audibleLeader: device.audibleLeader === true || device.isAudibleLeader === true,
    },
    schoolDay: {
      dateLabel: text(schoolDay.dateLabel, source.dateLabel),
      clockLabel: text(schoolDay.clockLabel, source.clockLabel),
      currentSegment: nullableText(schoolDay.currentSegment, schoolDay.currentBell, currentSegment?.label),
      nextSegment: nullableText(schoolDay.nextSegment, schoolDay.nextBell, nextSegment?.label),
    },
    sessions: array(source.sessions).map(normalizeSession).filter((item): item is DisplaySession => item !== null),
    alerts: array(source.alerts).map(normalizeAlert).filter((item): item is DisplayAlert => item !== null),
    agenda: array(source.agenda).map(normalizeAgenda).filter((item): item is DisplayAgenda => item !== null),
    operations: array(source.operations).map(normalizeOperation).filter((item): item is DisplayOperationItem => item !== null),
    attendance: total > 0 ? { present: Math.min(present, total), total } : null,
  };
}

export function displayProfileLabel(profile: DisplayProfile): string {
  return profile === 'RUANG_GURU' ? 'Ruang Guru' : 'Ruang Tata Usaha';
}
