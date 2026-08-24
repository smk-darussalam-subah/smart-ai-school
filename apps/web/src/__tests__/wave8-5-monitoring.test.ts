import {
  filterMonitoringSessions,
  formatMonitoringTime,
  hasMonitoringReaderRole,
  monitoringInitialClock,
  normalizeMonitoringDevices,
  normalizeMonitoringSnapshot,
} from '../components/monitoring/monitoring-contract';

const SESSION = {
  id: 'session-1',
  classNameSnapshot: 'X AKL 1',
  subjectSnapshot: 'Akuntansi Dasar',
  assignedTeacherName: 'Guru Sintetis',
  roomSnapshot: 'Ruang 4',
  scheduledStartAt: '2026-08-24T01:00:00.000Z',
  scheduledEndAt: '2026-08-24T02:00:00.000Z',
  status: 'MISSED',
  lateByMinutes: 12,
};

describe('Wave 8.5 operational monitoring contract', () => {
  it('uses a deterministic Jakarta timestamp and snapshot-derived hydration clock', () => {
    const generatedAt = '2026-08-24T02:00:00.000Z';
    expect(formatMonitoringTime(generatedAt)).toContain('09.00');
    expect(formatMonitoringTime(null)).toBe('Belum pernah');
    expect(formatMonitoringTime('invalid')).toBe('Tidak tersedia');
    expect(monitoringInitialClock(generatedAt)).toBe(Date.parse(generatedAt));
    expect(monitoringInitialClock(null)).toBe(0);
    expect(monitoringInitialClock('invalid')).toBe(0);
  });

  it.each([
    ['SUPER_ADMIN', true],
    ['TATA_USAHA', true],
    ['KEPALA_SEKOLAH', true],
    ['WAKA_KURIKULUM', false],
    ['KAPROG', false],
    ['GURU', false],
    ['SISWA', false],
    ['ORANG_TUA', false],
    ['INDUSTRI', false],
  ])('applies the monitoring reader matrix for %s', (role, expected) => {
    expect(hasMonitoringReaderRole([role])).toBe(expected);
  });

  it('derives honest summary counts from normalized sessions and alerts', () => {
    const result = normalizeMonitoringSnapshot({
      generatedAt: '2026-08-24T02:00:00.000Z',
      currentSegment: 'JP 2',
      sessions: [SESSION],
      alerts: [{ id: '123e4567-e89b-42d3-a456-426614174000', eventKey: 'evt-1', className: 'X AKL 1', stage: 'ROOM_T10' }],
    });
    expect(result?.summary.missed).toBe(1);
    expect(result?.summary.attention).toBe(1);
    expect(result?.currentSegment).toBe('JP 2');
  });

  it('filters by query, status, and attention without broadening the result', () => {
    const snapshot = normalizeMonitoringSnapshot({ generatedAt: '2026-08-24T02:00:00.000Z', sessions: [SESSION] });
    expect(filterMonitoringSessions(snapshot?.sessions ?? [], { query: 'akuntansi', status: 'MISSED', attentionOnly: true })).toHaveLength(1);
    expect(filterMonitoringSessions(snapshot?.sessions ?? [], { query: 'tkj', status: 'ALL', attentionOnly: false })).toHaveLength(0);
    expect(filterMonitoringSessions(snapshot?.sessions ?? [], { query: '', status: 'STARTED', attentionOnly: false })).toHaveLength(0);
  });

  it('accepts only known display profiles and lifecycle states', () => {
    const devices = normalizeMonitoringDevices({ data: [
      { id: 'device-1', label: 'TV Guru', profile: 'RUANG_GURU', status: 'ACTIVE', isAudibleLeader: true },
      { id: 'device-3', label: 'TV Lama', profile: 'RUANG_TU', status: 'EXPIRED' },
      { id: 'device-2', label: 'Unknown', profile: 'LOBBY', status: 'ACTIVE' },
    ] });
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({ label: 'TV Guru', profile: 'RUANG_GURU', audibleLeader: true });
    expect(devices[1]).toMatchObject({ label: 'TV Lama', status: 'EXPIRED' });
  });
});
