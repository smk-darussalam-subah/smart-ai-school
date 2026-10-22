// Local component lab only. The production server-action modules are not edited.
let mode = 'success';
let commits = 0;
let enabled = false;
let revision = 0;
const semesterId = '10000000-0000-4000-8000-000000000001';
export function setLabMode(value: string) {
  mode = value;
}
export function commitCount() {
  return commits;
}
export async function getSessionActivation() {
  if (mode === 'status-error') return { error: 'Status belum dapat dimuat.' };
  const date = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  return {
    data: {
      semesterId,
      academicYear: '2026/2027',
      semester: 1,
      date,
      enabled,
      revision,
      activatedAt: enabled ? new Date().toISOString() : null,
    },
  };
}
export async function previewSessionActivation(date: string) {
  const plan = await previewClassSessions(date);
  return plan.data
    ? { data: { ...plan.data, activation: { semesterId, enabled, revision } } }
    : plan;
}
export async function enableSessionActivation(date: string) {
  const receipt = await prepareClassSessions(date);
  if (!receipt.data) return receipt;
  enabled = true;
  revision++;
  return { data: { ...receipt.data, activation: { semesterId, enabled, revision } } };
}
export async function disableSessionActivation() {
  commits++;
  enabled = false;
  revision++;
  return { data: { semesterId, enabled, revision } };
}
export async function previewClassSessions(date: string) {
  if (mode === 'preview-error') return { error: 'Kesiapan belum dapat dimuat. Coba lagi.' };
  return {
    data: {
      date,
      academicYear: '2026/2027',
      semester: 1,
      scheduledCount: 51,
      eligibleCount: 40,
      existingCount: 0,
      newCount: mode === 'empty' ? 0 : 40,
      skippedStartedCount: 11,
      skippedExpiredCount: 0,
      firstStartAt: `${date}T03:00:00Z`,
      planHash: 'a'.repeat(64),
    },
  };
}
export async function prepareClassSessions(date: string) {
  commits++;
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (mode === 'network') throw new Error('Synthetic network loss');
  if (mode === 'conflict')
    return { error: 'Jadwal atau waktu telah berubah. Periksa kesiapan sekali lagi.', status: 409 };
  return { data: { date, createdCount: 40, totalCount: 40 } };
}
export async function startClassSession() {
  return { success: true };
}
export async function completeClassSession() {
  return { success: true };
}
export async function cancelClassSession() {
  return { success: true };
}
export async function reassignClassSession() {
  return { success: true };
}
export function useRouter() {
  return { refresh() {} };
}
