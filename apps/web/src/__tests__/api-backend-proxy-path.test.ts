import http, { type Server } from 'node:http';
import { NextRequest } from 'next/server';

const previous = process.env.API_URL;
let upstream: Server;
let origin: string;
let handlers: typeof import('../app/api/backend/[...path]/route');
beforeAll(async () => {
  upstream = http.createServer(async (request, response) => {
    for await (const _chunk of request) {
      /* Drain synthetic request only. */
    }
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        method: request.method,
        url: request.url,
        auth: request.headers.authorization,
        cookie: request.headers.cookie ?? null,
      }),
    );
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  if (!address || typeof address === 'string') throw Error('Invalid local listener');
  origin = `http://127.0.0.1:${address.port}`;
  process.env.API_URL = origin;
  jest.resetModules();
  handlers = await import('../app/api/backend/[...path]/route');
});
afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  if (previous === undefined) delete process.env.API_URL;
  else process.env.API_URL = previous;
});
describe('R10 decoded route segments keep their exact upstream identity', () => {
  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    '%s preserves once-encoded year slash on actual loopback HTTP',
    async (method) => {
      const request = new NextRequest(
        'http://localhost/api/backend/kktp-config/Matematika/2026%2F2027/1?note=a%26b&subject=B%2FING',
        {
          method,
          headers: { authorization: 'Bearer synthetic-path-test', cookie: 'must-not-forward=1' },
          ...(method === 'GET' ? {} : { body: '{}' }),
        },
      );
      const result = await handlers[method](request, {
        params: Promise.resolve({ path: ['kktp-config', 'Matematika', '2026/2027', '1'] }),
      });
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({
        method,
        url: '/api/v1/kktp-config/Matematika/2026%2F2027/1?note=a%26b&subject=B%2FING',
        auth: 'Bearer synthetic-path-test',
        cookie: null,
      });
    },
  );
  it.each(['Bahasa Jawa', 'Bidang/Praktik', '日本語', '100%', 'a?x=1#fragment', '%2F'])(
    'segment %s does not become routing or query syntax',
    async (segment) => {
      const result = await handlers.GET(
        new NextRequest('http://localhost/api/backend/catalog/test', {
          headers: { authorization: 'Bearer synthetic-path-test' },
        }),
        { params: Promise.resolve({ path: ['catalog', segment] }) },
      );
      expect((await result.json()).url).toBe('/api/v1/catalog/' + encodeURIComponent(segment));
    },
  );
  it.each(['.', '..'])(
    'rejects dot segment %s before origin path normalization',
    async (segment) => {
      const result = await handlers.DELETE(
        new NextRequest('http://localhost/api/backend/test', {
          method: 'DELETE',
          headers: { authorization: 'Bearer synthetic-path-test' },
        }),
        { params: Promise.resolve({ path: ['kktp-config', segment, '1'] }) },
      );
      expect(result.status).toBe(400);
    },
  );
});
