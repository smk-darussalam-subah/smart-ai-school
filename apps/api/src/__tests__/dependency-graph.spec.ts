import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = readFileSync(
  resolve(__dirname, '../../../../scripts/verify-dependency-graph.cjs'),
  'utf8',
);
type LockedPackage = { version: string; dependencies?: Record<string, string> };
interface FixtureOptions {
  api?: boolean;
  web?: boolean;
  lockedNext?: string;
  nestedNext?: string;
  lockedSharp?: string;
  installedNext?: string;
  installedSharp?: string;
  missingNext?: boolean;
  brokenSharp?: boolean;
  missingApi?: boolean;
  splitObservable?: boolean;
  nestedRx?: boolean;
  workerVersion?: string;
  nestedWorker?: boolean;
  lockedThread?: string;
  noNextLock?: boolean;
}

/** Linux-shaped filesystem/module fixture: absent sibling modules really throw. */
function inspect(options: FixtureOptions = {}) {
  const api = options.api ?? true;
  const web = options.web ?? true;
  const packages: Record<string, LockedPackage> = {
    'node_modules/next': { version: options.lockedNext ?? '15.5.28' },
    'node_modules/sharp': { version: options.lockedSharp ?? '0.35.5' },
    'node_modules/rxjs': { version: '7.8.2' },
    'node_modules/thread-stream': {
      version: options.lockedThread ?? '3.2.0',
      dependencies: { 'real-require': '^0.2.0' },
    },
    'node_modules/real-require': { version: '0.2.0' },
  };
  if (options.noNextLock) delete packages['node_modules/next'];
  if (options.nestedNext) packages['apps/web/node_modules/next'] = { version: options.nestedNext };
  if (options.nestedRx) packages['apps/api/node_modules/rxjs'] = { version: '7.8.2' };
  const accesses: string[] = [];
  const output: string[] = [];
  const root = '/app';
  const workerPackage = options.nestedWorker
    ? '/app/node_modules/thread-stream/node_modules/real-require/package.json'
    : '/app/node_modules/real-require/package.json';
  const missing = (name: string): never => {
    throw Object.assign(new Error(`Cannot find module '${name}'`), { code: 'MODULE_NOT_FOUND' });
  };
  class Observable {}
  class OtherObservable {}
  const moduleRequire = (anchor: string) =>
    Object.assign(
      (name: string): unknown => {
        accesses.push(`${anchor}:${name}`);
        if (name === 'next/package.json') {
          if (!web || options.missingNext) return missing(name);
          return { version: options.installedNext ?? '15.5.28' };
        }
        if (name === 'sharp') {
          if (!web) return missing(name);
          if (options.brokenSharp) throw new Error('sharp native module failed to load');
          return { versions: { sharp: options.installedSharp ?? '0.35.5' } };
        }
        if (!api || options.missingApi) return missing(name);
        if (name === 'rxjs')
          return {
            Observable:
              anchor.includes('@nestjs') && options.splitObservable ? OtherObservable : Observable,
          };
        if (name === 'rxjs/package.json') return { version: '7.8.2' };
        return missing(name);
      },
      {
        resolve: (name: string) => {
          if (name === 'next/package.json') {
            if (!web || options.missingNext) return missing(name);
            return '/app/node_modules/next/package.json';
          }
          if (name === '@nestjs/core/package.json') {
            if (!api || options.missingApi) return missing(name);
            return '/app/node_modules/@nestjs/core/package.json';
          }
          return missing(name);
        },
      },
    );
  const imports = Object.assign(
    (name: string): unknown => {
      if (name === 'node:assert/strict') return assert;
      if (name === 'node:path') return posix;
      if (name === 'node:module') return { createRequire: moduleRequire };
      if (name === 'node:fs')
        return {
          existsSync: (p: string) =>
            (p === `${root}/apps/api/package.json` && api) ||
            (p === `${root}/apps/web/package.json` && web),
          realpathSync: (p: string) => p,
          readFileSync: (p: string) => {
            if (p === `${root}/package-lock.json`) return JSON.stringify({ packages });
            if (p === workerPackage)
              return JSON.stringify({ version: options.workerVersion ?? '0.2.0' });
            throw new Error(`Unexpected fixture file: ${p}`);
          },
        };
      throw new Error(`Unexpected builtin: ${name}`);
    },
    {
      resolve: (name: string) => {
        if (!api || options.missingApi) return missing(name);
        if (name === 'thread-stream/lib/worker.js')
          return '/app/node_modules/thread-stream/lib/worker.js';
        if (name === 'real-require/package.json') return workerPackage;
        return missing(name);
      },
    },
  );
  runInNewContext(
    source,
    {
      require: imports,
      __dirname: '/app/scripts',
      process: { stdout: { write: (text: string) => output.push(text) } },
    },
    { timeout: 2000 },
  );
  const result = JSON.parse(output.join('')) as {
    contexts: { api: boolean; web: boolean };
    physicalChecks: { api: boolean; web: boolean };
    next: string | null;
    sharp: string | null;
    sharedObservableConstructor: boolean | null;
  };
  return { result, accesses };
}

describe('dependency graph guard by build context', () => {
  it('verifies both physical graphs in a complete repository', () => {
    const { result } = inspect();
    expect(result.physicalChecks).toEqual({ api: true, web: true });
    expect(result.next).toBe('15.5.28');
    expect(result.sharp).toBe('0.35.5');
    expect(result.sharedObservableConstructor).toBe(true);
  });
  it('accepts API-only without trying to install or resolve Web modules', () => {
    const { result, accesses } = inspect({ web: false });
    expect(result.physicalChecks).toEqual({ api: true, web: false });
    expect(result.next).toBeNull();
    expect(accesses.some((x) => x.includes('next/package.json') || x.endsWith(':sharp'))).toBe(
      false,
    );
  });
  it('accepts Web-only without requiring API modules', () => {
    const { result, accesses } = inspect({ api: false });
    expect(result.physicalChecks).toEqual({ api: false, web: true });
    expect(result.sharedObservableConstructor).toBeNull();
    expect(accesses.some((x) => x.endsWith(':rxjs'))).toBe(false);
  });
  it('rejects a context with neither workspace', () =>
    expect(() => inspect({ api: false, web: false })).toThrow('workspace manifest required'));
  it.each([true, false])('rejects the vulnerable Next lock even with web=%s', (web) => {
    expect(() => inspect({ web, lockedNext: '15.5.25' })).toThrow('15.5.28');
  });
  it('rejects an unpatched nested Next lock in API-only context', () =>
    expect(() => inspect({ web: false, nestedNext: '15.5.27' })).toThrow('15.5.28'));
  it('rejects a missing Next lock in API-only context', () =>
    expect(() => inspect({ web: false, noNextLock: true })).toThrow('Next.js must be locked'));
  it('rejects a downgraded Sharp lock in API-only context', () =>
    expect(() => inspect({ web: false, lockedSharp: '0.35.4' })).toThrow('sharp lock'));
  it('rejects a vulnerable physical Next despite a safe lock', () =>
    expect(() => inspect({ installedNext: '15.5.25' })).toThrow('installed Next.js'));
  it('rejects physical Next version drift even to another patched version', () =>
    expect(() => inspect({ installedNext: '15.5.29' })).toThrow('Next.js install/lock drift'));
  it('does not swallow missing Next when the Web manifest is present', () =>
    expect(() => inspect({ missingNext: true })).toThrow('Cannot find module'));
  it('rejects physical Sharp drift', () =>
    expect(() => inspect({ installedSharp: '0.35.4' })).toThrow('sharp install/lock drift'));
  it('does not swallow a broken native Sharp load', () =>
    expect(() => inspect({ api: false, brokenSharp: true })).toThrow('sharp native module'));
  it('still rejects split Observable constructors in API-only context', () =>
    expect(() => inspect({ web: false, splitObservable: true })).toThrow('share one Observable'));
  it('does not swallow missing API modules when the API manifest is present', () =>
    expect(() => inspect({ web: false, missingApi: true })).toThrow('Cannot find module'));
  it('retains the global ban on nested RxJS even in Web-only context', () =>
    expect(() => inspect({ api: false, nestedRx: true })).toThrow('nested RxJS'));
  it('still rejects incompatible real-require for the worker', () =>
    expect(() => inspect({ web: false, workerVersion: '0.1.0' })).toThrow(
      'incompatible real-require',
    ));
  it('still rejects a nested real-require worker resolution', () =>
    expect(() => inspect({ web: false, nestedWorker: true })).toThrow('valid root dependency'));
  it('still rejects an unexpected thread-stream lock', () =>
    expect(() => inspect({ lockedThread: '3.1.0' })).toThrow('unexpected thread-stream'));
});
