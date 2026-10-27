import http, { type Server } from 'node:http';
import { NextRequest } from 'next/server';

// Real loopback upstream + production route; identity persistence is an adapter.
// Installed JWT/session libraries are separately covered by proxy-auth tests.
jest.mock('../lib/request-session', () => ({
  ...jest.requireActual<typeof import('../lib/request-session')>('../lib/request-session'),
  resolveRequestSession: async () => ({
    session: { accessToken: 'synthetic-stream-token' },
    cookies: [],
  }),
}));

let server: Server;
let GET: typeof import('../app/api/backend/[...path]/route').GET;
let origin: string;
let disconnected = 0;
let sawCookie: string | undefined;
let sawAuthorization: string | undefined;
const previousApiUrl = process.env.API_URL;
const context = { params: Promise.resolve({ path: ['assessment', 'sessions', 'qa', 'stream'] }) };

beforeAll(async () => {
  server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.invalid');
    const status = Number(url.searchParams.get('status') ?? 200);
    sawCookie = request.headers.cookie;
    sawAuthorization = request.headers.authorization;
    response.writeHead(status, { 'content-type': 'text/event-stream' });
    response.write('data: {"sequence":1}\n\n');
    const timer = setInterval(() => response.write('data: {"sequence":2}\n\n'), 60);
    response.on('close', () => {
      clearInterval(timer);
      disconnected++;
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Invalid synthetic listener');
  origin = `http://127.0.0.1:${address.port}`;
  process.env.API_URL = origin;
  jest.resetModules();
  ({ GET } = await import('../app/api/backend/[...path]/route'));
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (previousApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = previousApiUrl;
});

it('streams the initial and subsequent chunks without buffering and cancels upstream on body cancel', async () => {
  const before = disconnected;
  const response = await GET(
    new NextRequest(origin + '/api/backend/assessment/sessions/qa/stream', {
      headers: {
        cookie: 'private-synthetic-cookie=never-forward',
        'x-forwarded-for': '203.0.113.1',
      },
    }),
    context,
  );
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('x-accel-buffering')).toBe('no');
  expect(sawAuthorization).toBe('Bearer synthetic-stream-token');
  expect(sawCookie).toBeUndefined();
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"sequence":1');
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"sequence":2');
  await reader.cancel();
  await new Promise((resolve) => setTimeout(resolve, 120));
  expect(disconnected).toBe(before + 1);
});

it('propagates a browser request abort to the upstream producer', async () => {
  const before = disconnected;
  const controller = new AbortController();
  const response = await GET(
    new NextRequest(origin + '/api/backend/assessment/sessions/qa/stream', {
      signal: controller.signal,
    }),
    context,
  );
  await response.body!.getReader().read();
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 120));
  expect(disconnected).toBe(before + 1);
});

it.each([401, 403])(
  'preserves upstream denial %i rather than inventing successful data',
  async (status) => {
    const response = await GET(
      new NextRequest(origin + '/api/backend/assessment/sessions/qa/stream?status=' + status),
      context,
    );
    expect(response.status).toBe(status);
    await response.body!.cancel();
  },
);
