import { readFileSync, realpathSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { FastifyAdapter } from '@nestjs/platform-fastify';

const root = resolve(__dirname, '../../../..');
// DIIS worktrees may use a junction to the same locked installation.
const installedRoot = realpathSync(resolve(root, 'node_modules'));
function expectRootRealRequire(resolvedPackage: string): void {
  expect(relative(installedRoot, realpathSync(resolvedPackage)).replaceAll('\\', '/')).toBe('real-require/package.json');
}
const lock: { packages: Record<string, { version?: string }> } = JSON.parse(
  readFileSync(resolve(root, 'package-lock.json'), 'utf8'),
);

describe('W10-D installed dependency security boundary', () => {
  it.each([
    ['fastify', '5.12.1'],
    ['postcss', '8.5.28'],
    ['pino', '9.14.0'],
    ['next-auth', '4.24.15'],
  ])('pins every lockfile location of %s to %s', (name, version) => {
    const entries = Object.entries(lock.packages).filter(
      ([path]) => path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`,
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const [, entry] of entries) expect(entry.version).toBe(version);
  });

  it('resolves patched PostCSS from the actual Next installation', () => {
    const nextPath = dirname(require.resolve('next/package.json'));
    const postcssPath = require.resolve('postcss/package.json', { paths: [nextPath] });
    const installed: { version: string } = JSON.parse(readFileSync(postcssPath, 'utf8'));
    expect(installed.version).toBe('8.5.28');
  });

  it('keeps the thread-stream worker on its declared real-require 0.2.x edge', () => {
    const threadEntry = lock.packages['node_modules/thread-stream'] as {
      version?: string;
      dependencies?: Record<string, string>;
    };
    expect(threadEntry.version).toBe('3.2.0');
    expect(threadEntry.dependencies?.['real-require']).toBe('^0.2.0');
    expect(lock.packages['node_modules/real-require']?.version).toBe('0.2.0');
    expect(lock.packages['node_modules/thread-stream/node_modules/real-require']).toBeUndefined();

    const workerPath = require.resolve('thread-stream/lib/worker.js');
    const resolvedPackage = require.resolve('real-require/package.json', {
      paths: [dirname(workerPath)],
    });
    const installed: { version: string } = JSON.parse(readFileSync(resolvedPackage, 'utf8'));
    expect(installed.version).toBe('0.2.0');
    expectRootRealRequire(resolvedPackage);
  });

  it('still rejects nested or foreign dependency locations under junction-aware resolution', () => {
    // Existing files make the negative controls exercise realpath, not invented paths.
    expect(() => expectRootRealRequire(require.resolve('thread-stream/package.json'))).toThrow();
    expect(() => expectRootRealRequire(resolve(root, 'package-lock.json'))).toThrow();
  });

  it('runs the patched Fastify through Nest and rejects malformed JSON without an open server', async () => {
    const adapter = new FastifyAdapter({ logger: false });
    const instance = adapter.getInstance();
    try {
      expect(instance.version).toBe('5.12.1');
      instance.post('/synthetic', async () => ({ accepted: true }));
      await instance.ready();
      const invalid = await instance.inject({
        method: 'POST',
        url: '/synthetic',
        headers: { 'content-type': 'application/json' },
        payload: '{',
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).not.toHaveProperty('accepted');
      const valid = await instance.inject({
        method: 'POST',
        url: '/synthetic',
        payload: { synthetic: true },
      });
      expect(valid.statusCode).toBe(200);
      expect(valid.json()).toEqual({ accepted: true });
    } finally {
      await adapter.close();
    }
  });
});
