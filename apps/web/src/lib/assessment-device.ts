const DEVICE_KEY = 'diis-exam-device-v1';
let ephemeralDeviceId: string | undefined;

export function getAssessmentDeviceId(): string | undefined {
  if (typeof window === 'undefined' || typeof window.crypto?.randomUUID !== 'function') return;
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored && /^[a-f0-9-]{36}$/i.test(stored)) return stored;
    const id = window.crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    ephemeralDeviceId ??= window.crypto.randomUUID();
    return ephemeralDeviceId;
  }
}
