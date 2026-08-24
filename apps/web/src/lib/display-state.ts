export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'stale' | 'offline';

export function isSnapshotStale(generatedAt: string, staleAfterSeconds: number, now = Date.now()): boolean {
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(generated)) return true;
  return now - generated > Math.max(30, staleAfterSeconds) * 1000;
}

export function reconnectDelay(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.min(Math.max(0, attempt), 5));
}

export function connectionLabel(state: ConnectionState): string {
  const labels: Record<ConnectionState, string> = {
    connecting: 'Menghubungkan',
    live: 'Data langsung',
    reconnecting: 'Menyambung ulang',
    stale: 'Data terlambat',
    offline: 'Tidak terhubung',
  };
  return labels[state];
}
