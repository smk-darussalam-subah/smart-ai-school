import http, { type Server } from 'node:http';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { NextRequest } from 'next/server';

jest.mock('next-auth/jwt', () => ({ getToken: async () => ({ accessToken: 'synthetic-session-token' }) }));

const fixture = { fixtureOnly: true, data: Array.from({ length: 50 }, (_, id) => ({ id, note: 'Synthetic transport payload; no school data.' })) };
type ProxyHandler = (request: NextRequest, context: { params: Promise<{ path: string[] }> }) => Promise<Response>;
let GET: ProxyHandler;
let POST: ProxyHandler;
let upstream: Server;
let downstream: Server;
let upstreamOrigin: string;
let downstreamOrigin: string;
const previousApiUrl = process.env.API_URL;

async function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Invalid fixture listener'));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}
async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

beforeAll(async () => {
  upstream = http.createServer(async (request, response) => {
    for await (const _chunk of request) { /* Drain synthetic bytes. */ }
    const url = new URL(request.url ?? '/', 'http://fixture.invalid');
    if (url.pathname === '/api/v1/scheduling/drafts' && request.method === 'POST') {
      response.statusCode = request.headers['idempotency-key'] === 'synthetic-draft-operation-01' ? 201 : 400;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ fixtureOnly: true,
        key: request.headers['idempotency-key'] ?? null,
        authorized: request.headers.authorization === 'Bearer synthetic-session-token',
        cookie: request.headers.cookie ?? null,
        identity: request.headers['x-forwarded-for'] ?? null }));
      return;
    }
    const status = Number(url.searchParams.get('status') ?? 200);
    response.statusCode = status;
    if ([204, 304].includes(status)) { response.end(); return; }
    const body = Buffer.from(JSON.stringify(fixture));
    const encoding = url.searchParams.get('encoding') ?? 'gzip';
    const encoded = encoding === 'gzip' ? gzipSync(body)
      : encoding === 'deflate' ? deflateSync(body)
        : encoding === 'br' ? brotliCompressSync(body) : body;
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-fixture', 'retained');
    if (encoding !== 'identity') response.setHeader('content-encoding', encoding);
    response.setHeader('content-length', encoded.byteLength);
    response.end(encoded);
  });
  upstreamOrigin = await listen(upstream);
  process.env.API_URL = upstreamOrigin;
  jest.resetModules();
  ({ GET, POST } = await import('../app/api/backend/[...path]/route'));
  downstream = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const req = new NextRequest(`${downstreamOrigin}${request.url}`, {
      method: request.method,
      headers,
      ...(request.method !== 'GET' ? { body: Buffer.concat(chunks) } : {}),
    });
    const path = new URL(req.url).pathname.replace('/api/backend/', '').split('/');
    const result = await (request.method === 'POST' ? POST : GET)(req, { params: Promise.resolve({ path }) });
    response.statusCode = result.status;
    result.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await result.arrayBuffer()));
  });
  downstreamOrigin = await listen(downstream);
});

afterAll(async () => {
  await close(downstream);
  await close(upstream);
  if (previousApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = previousApiUrl;
});

describe('actual HTTP proxy transport with loopback-only fixtures', () => {
  it.each(['gzip', 'deflate', 'br', 'identity'])('reads %s JSON without stale compression metadata', async (encoding) => {
    const response = await fetch(`${downstreamOrigin}/api/backend/staff-attendance/context?encoding=${encoding}`, { signal: AbortSignal.timeout(5000) });
    expect(response.status).toBe(200);
    expect(response.headers.has('content-encoding')).toBe(false);
    expect(response.headers.get('x-fixture')).toBe('retained');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(fixture);
  });
  it.each(['staff-attendance/history', 'staff-attendance/report', 'schedules', 'bell-schedules/catalog', 'teaching-assignments', 'class-sessions/today', 'scheduling/drafts'])('reads the full %s payload', async (endpoint) => {
    const response = await fetch(`${downstreamOrigin}/api/backend/${endpoint}`, { signal: AbortSignal.timeout(5000) });
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual(fixture);
  });
  it.each([400, 401, 403, 429, 500])('preserves status %i and its compressed error body', async (status) => {
    const response = await fetch(`${downstreamOrigin}/api/backend/schedules?status=${status}`, { signal: AbortSignal.timeout(5000) });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(fixture);
  });
  it.each([204, 304])('preserves empty status %i', async (status) => {
    const response = await fetch(`${downstreamOrigin}/api/backend/schedules?status=${status}`, { signal: AbortSignal.timeout(5000) });
    expect(response.status).toBe(status);
    expect(await response.text()).toBe('');
  });
  it('does not forward the length of encoded upstream bytes', async () => {
    const result = await GET(new NextRequest(`${downstreamOrigin}/api/backend/schedules`), { params: Promise.resolve({ path: ['schedules'] }) });
    expect(result.headers.has('content-length')).toBe(false);
    expect(result.headers.has('content-encoding')).toBe(false);
    expect(await result.json()).toEqual(fixture);
  });
  it('passes required draft idempotency while excluding browser cookie and spoofed identity', async () => {
    const response = await fetch(`${downstreamOrigin}/api/backend/scheduling/drafts`, {
      method: 'POST', signal: AbortSignal.timeout(5000), body: JSON.stringify({ fixtureOnly: true }),
      headers: { 'content-type': 'application/json', 'idempotency-key': 'synthetic-draft-operation-01',
        cookie: 'synthetic-cookie=not-forwarded', 'x-forwarded-for': '203.0.113.45' },
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ fixtureOnly: true, key: 'synthetic-draft-operation-01', authorized: true, cookie: null, identity: null });
  });
});
