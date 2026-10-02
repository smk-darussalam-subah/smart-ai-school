import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  parseApplyCliOptions,
  safeApplyErrorMessage,
} from '../../../../scripts/apply-class-reconciliation';
import { parseCliOptions } from '../../../../scripts/plan-class-reconciliation';

describe('class reconciliation CLI contract', () => {
  it('menolak mode apply sebelum membaca manifest atau membuka database', () => {
    const repositoryRoot = resolve(__dirname, '../../../..');
    const tsNode = require.resolve('ts-node/dist/bin.js');
    const result = spawnSync(
      process.execPath,
      [
        tsNode,
        '--project',
        'apps/api/tsconfig.json',
        'scripts/plan-class-reconciliation.ts',
        '--apply',
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: '' },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Mutasi data tidak didukung');
    expect(result.stderr).not.toContain('DATABASE_URL');
  });

  it('mewajibkan manifest dan dua expected digest yang valid', () => {
    expect(() => parseCliOptions([])).toThrow('--expected-manifest-sha256');
    expect(() =>
      parseCliOptions([
        '--manifest',
        'plan.json',
        '--expected-manifest-sha256',
        'invalid',
        '--expected-target-sha256',
        '0'.repeat(64),
      ]),
    ).toThrow('Expected digest');
  });
});

describe('class reconciliation apply CLI contract', () => {
  const validArgs = [
    '--apply',
    '--manifest',
    'apply.json',
    '--expected-manifest-sha256',
    '1'.repeat(64),
    '--expected-dry-run-sha256',
    '2'.repeat(64),
    '--expected-target-sha256',
    '3'.repeat(64),
  ];

  it('requires an explicit apply flag and all three approved digests', () => {
    expect(() => parseApplyCliOptions(validArgs.filter((arg) => arg !== '--apply'))).toThrow(
      '--apply eksplisit',
    );
    expect(() =>
      parseApplyCliOptions(validArgs.map((arg) => (arg === '2'.repeat(64) ? 'invalid' : arg))),
    ).toThrow('Expected digest');
    expect(parseApplyCliOptions(validArgs)).toMatchObject({
      expectedManifestSha256: '1'.repeat(64),
      expectedDryRunSha256: '2'.repeat(64),
      expectedTargetSha256: '3'.repeat(64),
    });
  });

  it('rejects before database access when the explicit flag is absent', () => {
    const repositoryRoot = resolve(__dirname, '../../../..');
    const tsNode = require.resolve('ts-node/dist/bin.js');
    const result = spawnSync(
      process.execPath,
      [
        tsNode,
        '--project',
        'apps/api/tsconfig.json',
        'scripts/apply-class-reconciliation.ts',
        '--manifest',
        'missing.json',
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: '' },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--apply eksplisit');
    expect(result.stderr).not.toContain('DATABASE_URL');
  });

  it('redacts identifiers and normalizes concurrent database errors', () => {
    expect(
      safeApplyErrorMessage(
        Object.assign(new Error('could not serialize access due to concurrent update'), {
          code: 'P2010',
        }),
      ),
    ).toContain('perubahan bersamaan');
    expect(
      safeApplyErrorMessage(new Error('row 85000000-0000-4000-8000-000000000001 failed')),
    ).toBe('Apply gagal dan transaksi dibatalkan; detail identifier disembunyikan.');
  });
});
