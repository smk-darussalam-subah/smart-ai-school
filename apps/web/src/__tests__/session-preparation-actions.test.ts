const mockApi = jest.fn(),
  mockRevalidate = jest.fn();
jest.mock('@/lib/server-actions', () => ({ apiAction: (...args: unknown[]) => mockApi(...args) }));
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidate(...args),
}));
import {
  previewClassSessions,
  prepareClassSessions,
  getSessionActivation,
  previewSessionActivation,
  enableSessionActivation,
  disableSessionActivation,
} from '@/app/dashboard/jadwal/session-actions';
const date = '2026-10-20';
const plan = {
  date,
  academicYear: '2026/2027',
  semester: 1,
  scheduledCount: 2,
  eligibleCount: 1,
  existingCount: 0,
  newCount: 1,
  skippedStartedCount: 1,
  skippedExpiredCount: 0,
  firstStartAt: `${date}T03:00:00Z`,
  planHash: 'a'.repeat(64),
};
const activation = {
  semesterId: '10000000-0000-4000-8000-000000000001',
  enabled: false,
  revision: 0,
};
it.each([
  null,
  { ...activation, enabled: true, revision: 0 },
  { ...activation, enabled: true, revision: 1, activatedAt: null },
])('does not mistake invalid status for disabled/active %#', async (value) => {
  mockApi.mockResolvedValue({ data: value });
  expect(await getSessionActivation()).toMatchObject({ status: 502 });
  expect(mockRevalidate).not.toHaveBeenCalled();
});
it('reads explicit off and checks activation preview without mutation', async () => {
  mockApi
    .mockResolvedValueOnce({
      data: { ...activation, academicYear: '2026/2027', semester: 1, date, activatedAt: null },
    })
    .mockResolvedValueOnce({ data: { ...plan, activation } });
  expect(await getSessionActivation()).toMatchObject({ data: { enabled: false, revision: 0 } });
  expect(await previewSessionActivation(date)).toMatchObject({ data: { activation } });
  expect(mockRevalidate).not.toHaveBeenCalled();
});
it.each([
  { date, createdCount: 1, totalCount: 1, activation },
  {
    date: '2026-10-21',
    createdCount: 1,
    totalCount: 1,
    activation: { ...activation, enabled: true, revision: 1 },
  },
  {
    date,
    createdCount: 2,
    totalCount: 1,
    activation: { ...activation, enabled: true, revision: 1 },
  },
])('does not certify an invalid enable receipt %#', async (data) => {
  mockApi.mockResolvedValue({ data });
  expect(await enableSessionActivation(date, plan.planHash)).toMatchObject({ status: 502 });
  expect(mockRevalidate).not.toHaveBeenCalled();
});
it('certifies only the matching enable and monotonic disable receipts', async () => {
  mockApi
    .mockResolvedValueOnce({
      data: {
        date,
        createdCount: 1,
        totalCount: 1,
        activation: { ...activation, enabled: true, revision: 1 },
      },
    })
    .mockResolvedValueOnce({ data: { ...activation, revision: 2 } });
  expect(await enableSessionActivation(date, plan.planHash)).toMatchObject({
    data: { activation: { enabled: true } },
  });
  expect(await disableSessionActivation(activation.semesterId, 1)).toMatchObject({
    data: { enabled: false, revision: 2 },
  });
  expect(mockRevalidate).toHaveBeenCalledTimes(10);
});
it.each([
  { ...activation, revision: 1 },
  { ...activation, revision: 2, enabled: true },
  { ...activation, revision: 2, semesterId: '20000000-0000-4000-8000-000000000002' },
])('rejects stale/wrong disable receipt %#', async (data) => {
  mockApi.mockResolvedValue({ data });
  expect(await disableSessionActivation(activation.semesterId, 1)).toMatchObject({ status: 502 });
  expect(mockRevalidate).not.toHaveBeenCalled();
});
beforeEach(() => {
  mockApi.mockReset();
  mockRevalidate.mockClear();
});
it('binds a valid preview to its requested date and never mutates', async () => {
  mockApi.mockResolvedValue({ data: plan, status: 200 });
  expect(await previewClassSessions(date)).toMatchObject({ data: plan });
  expect(mockApi).toHaveBeenCalledWith(`/class-sessions/preparation?date=${date}`, 'GET');
  expect(mockRevalidate).not.toHaveBeenCalled();
});
it.each([
  null,
  { ...plan, date: '2026-10-21' },
  { ...plan, newCount: 100 },
  { ...plan, planHash: '' },
])('rejects malformed or stale preview %#', async (data) => {
  mockApi.mockResolvedValue({ data, status: 200 });
  expect(await previewClassSessions(date)).toMatchObject({
    error: expect.any(String),
    status: 502,
  });
  expect(mockApi).toHaveBeenCalledTimes(1);
});
it('revalidates all consumers only after a valid receipt', async () => {
  mockApi.mockResolvedValue({ data: { date, createdCount: 1, totalCount: 2 }, status: 201 });
  expect(await prepareClassSessions(date, plan.planHash)).toMatchObject({
    data: { createdCount: 1 },
  });
  for (const path of [
    '/dashboard',
    '/dashboard/jadwal',
    '/dashboard/akademik',
    '/dashboard/monitoring',
    '/dashboard/executive',
  ])
    expect(mockRevalidate).toHaveBeenCalledWith(path);
  expect(mockApi).toHaveBeenCalledTimes(1);
});
it.each([
  { data: null },
  { data: { date, createdCount: 2, totalCount: 1 } },
  { error: 'Conflict', status: 409 },
])('does not certify an uncertain result or replay the mutation %#', async (result) => {
  mockApi.mockResolvedValue(result);
  expect(await prepareClassSessions(date, plan.planHash)).toMatchObject({
    error: expect.any(String),
  });
  expect(mockRevalidate).not.toHaveBeenCalled();
  expect(mockApi).toHaveBeenCalledTimes(1);
});
