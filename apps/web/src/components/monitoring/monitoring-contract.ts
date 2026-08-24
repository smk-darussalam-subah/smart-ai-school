import type { DisplayAlert, DisplaySession } from '@/lib/display-contract';
import { normalizeDisplaySnapshot } from '@/lib/display-contract';

export interface MonitoringDevice {
  id: string;
  label: string;
  profile: 'RUANG_GURU' | 'RUANG_TU';
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  audibleLeader: boolean;
  lastSeenAt: string | null;
  expiresAt: string | null;
}

export interface MonitoringSnapshot {
  generatedAt: string;
  staleAfterSeconds: number;
  currentSegment: string | null;
  sessions: DisplaySession[];
  alerts: DisplayAlert[];
  summary: {
    scheduled: number;
    started: number;
    completed: number;
    missed: number;
    attention: number;
  };
}

type RecordValue = Record<string, unknown>;

const MONITORING_READER_ROLES = new Set([
  'SUPER_ADMIN',
  'TATA_USAHA',
  'KEPALA_SEKOLAH',
]);

export function hasMonitoringReaderRole(roles: readonly string[]): boolean {
  return roles.some((role) => MONITORING_READER_ROLES.has(role));
}

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

function iso(value: unknown): string | null {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normalizeSessionList(input: unknown): DisplaySession[] {
  const synthetic = normalizeDisplaySnapshot({
    profile: 'RUANG_GURU',
    generatedAt: new Date(0).toISOString(),
    sessions: input,
  });
  return synthetic?.sessions ?? [];
}

function normalizeAlertList(input: unknown): DisplayAlert[] {
  const synthetic = normalizeDisplaySnapshot({
    profile: 'RUANG_GURU',
    generatedAt: new Date(0).toISOString(),
    alerts: input,
  });
  return synthetic?.alerts ?? [];
}

export function normalizeMonitoringSnapshot(input: unknown): MonitoringSnapshot | null {
  const source = record(input);
  const payload = Object.keys(record(source.snapshot)).length ? record(source.snapshot) : source;
  const generatedAt = iso(payload.generatedAt);
  if (!generatedAt) return null;
  const sessions = normalizeSessionList(payload.sessions);
  const alerts = normalizeAlertList(payload.alerts);
  const supplied = record(payload.summary);
  const counters = record(payload.counters);
  const statusCount = (status: DisplaySession['status']) => sessions.filter((item) => item.status === status).length;
  return {
    generatedAt,
    staleAfterSeconds: Math.min(300, Math.max(30, count(payload.staleAfterSeconds) || 75)),
    currentSegment: text(payload.currentSegment) || text(record(payload.schoolDay).currentSegment) || null,
    sessions,
    alerts,
    summary: {
      scheduled: count(supplied.scheduled) || count(counters.SCHEDULED) || statusCount('SCHEDULED'),
      started: count(supplied.started) || count(counters.STARTED) || statusCount('STARTED'),
      completed: count(supplied.completed) || count(counters.COMPLETED) || statusCount('COMPLETED'),
      missed: count(supplied.missed) || count(counters.MISSED) || statusCount('MISSED'),
      attention: count(supplied.attention) || count(payload.activeAlerts) || alerts.filter((item) => !item.acknowledged).length,
    },
  };
}

function normalizeDevice(value: unknown): MonitoringDevice | null {
  const source = record(value);
  const id = text(source.id);
  const label = text(source.label);
  const profile = source.profile;
  const status = source.status;
  if (!id || !label || (profile !== 'RUANG_GURU' && profile !== 'RUANG_TU')
    || (status !== 'PENDING' && status !== 'ACTIVE' && status !== 'EXPIRED' && status !== 'REVOKED')) return null;
  return {
    id,
    label,
    profile,
    status,
    audibleLeader: source.audibleLeader === true || source.isAudibleLeader === true,
    lastSeenAt: iso(source.lastSeenAt),
    expiresAt: iso(source.expiresAt),
  };
}

export function normalizeMonitoringDevices(input: unknown): MonitoringDevice[] {
  const source = record(input);
  const values = Array.isArray(input) ? input : array(source.data).length ? array(source.data) : array(source.devices);
  return values.map(normalizeDevice).filter((item): item is MonitoringDevice => item !== null);
}

export interface MonitoringFilters {
  query: string;
  status: 'ALL' | DisplaySession['status'];
  attentionOnly: boolean;
}

export function filterMonitoringSessions(sessions: DisplaySession[], filters: MonitoringFilters): DisplaySession[] {
  const query = filters.query.trim().toLocaleLowerCase('id-ID');
  return sessions.filter((session) => {
    if (filters.status !== 'ALL' && session.status !== filters.status) return false;
    if (filters.attentionOnly && session.status !== 'MISSED' && !(session.lateByMinutes && session.lateByMinutes > 0)) return false;
    if (!query) return true;
    return [session.className, session.subject, session.room, session.teacherName]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('id-ID').includes(query));
  });
}
