export type ClassSessionAction = 'start' | 'complete';

export function classSessionAction(status: string): ClassSessionAction | null {
  if (status === 'SCHEDULED' || status === 'REASSIGNED') return 'start';
  if (status === 'STARTED') return 'complete';
  return null;
}

export function claimClassSessionAction(inFlight: Set<string>, key: string): boolean {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}
