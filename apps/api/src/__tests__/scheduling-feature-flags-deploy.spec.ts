import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { schedulingImportPolicy, schedulingPolicy } from '../scheduling/scheduling-feature-policy';

const root = path.resolve(__dirname, '../../../..');
const dockerRoot = path.join(root, 'infrastructure/docker');
const flags = ['SMART_SCHEDULER_ENABLED', 'SMART_SCHEDULER_IMPORT_ENABLED'] as const;
type Flag = (typeof flags)[number];
interface ComposeModel {
  services: Record<string, { environment?: Record<string, string | null> }> & {
    api: { environment?: Record<string, string | null> };
  };
}
const enabledValues = { SMART_SCHEDULER_ENABLED: 'true', SMART_SCHEDULER_IMPORT_ENABLED: 'true' };

// Config is daemonless; never build/up/run, contact staging, or load real env files.
const cliEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|LOCALAPPDATA|APPDATA|PROGRAMFILES(?:\(X86\))?|PROGRAMW6432|PROGRAMDATA)$/i.test(key),
));
cliEnv.COMPOSE_DISABLE_ENV_FILE = '1';
const version = spawnSync('docker', ['compose', 'version', '--short'], {
  env: cliEnv, encoding: 'utf8', timeout: 10000,
});
const hasCompose = version.status === 0;
const withCompose = hasCompose ? describe : describe.skip;

describe('scheduling deployment flag source contract', () => {
  it('forwards exact opt-in flags only to the base API service', () => {
    const source = readFileSync(path.join(dockerRoot, 'docker-compose.yml'), 'utf8');
    const api = source.split(/\n {2}api:\s*\r?\n/)[1]?.split(/\n {2}[a-z][\w-]*:\s*\r?\n/)[0];
    expect(api).toBeDefined();
    for (const flag of flags) {
      const line = `      ${flag}: \${${flag}:-false}`;
      expect(api).toContain(line);
      expect(source.split(line)).toHaveLength(2);
    }
  });

  it('keeps both environment examples explicitly disabled', () => {
    for (const filename of ['.env.example', 'infrastructure/docker/.env.staging.example']) {
      const source = readFileSync(path.join(root, filename), 'utf8');
      for (const flag of flags) expect(source.split(/\r?\n/).filter(line => line.startsWith(`${flag}=`))).toEqual([`${flag}=false`]);
    }
  });

  it('keeps standard branch/env-file selection and deploy targets unchanged', () => {
    const helper = readFileSync(path.join(root, 'infrastructure/deploy/compose-application.sh'), 'utf8');
    expect(helper).toContain("[ \"$env_file\" = '.env' ]");
    expect(helper).toContain("[ \"$env_file\" = '.env.staging' ]");
    expect(helper).toContain('compose_args=(-p smk-staging -f docker-compose.yml -f docker-compose.staging.yml)');
    expect(helper).toContain('command_args=(up -d --no-deps api web)');
    const workflow = readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
    for (const flag of flags) {
      expect(workflow).not.toMatch(new RegExp(`set_env_var\\s+${flag}\\b`));
      expect(workflow).not.toMatch(new RegExp(`^\\s*${flag}:`, 'm'));
    }
  });

  it('requires actual Compose integration coverage in CI', () => {
    if (process.env.CI === 'true' || process.env.CI === '1') expect(hasCompose).toBe(true);
  });
});

withCompose('scheduling flags through real standard Compose models', () => {
  let scratch: string;
  const cache = new Map<string, ComposeModel>();
  beforeAll(() => { scratch = mkdtempSync(path.join(tmpdir(), 'diis-scheduling-flags-')); });
  afterAll(() => {
    const resolved = realpathSync(scratch);
    if (path.dirname(resolved) !== realpathSync(tmpdir()) || !path.basename(resolved).startsWith('diis-scheduling-flags-')) {
      throw new Error('Refuse cleanup outside owned temporary directory');
    }
    rmSync(resolved, { recursive: true, force: true });
  });

  function model(branch: 'main' | 'staging', values: Partial<Record<Flag, string>>) {
    const key = JSON.stringify([branch, values]);
    const saved = cache.get(key);
    if (saved) return saved;
    const envFile = path.join(scratch, branch === 'main' ? '.env' : '.env.staging');
    const synthetic = {
      PG_BACKUP_IMAGE: `registry.invalid/diis/unused@sha256:${'0'.repeat(64)}`,
      DATABASE_URL: 'postgresql://fixture:fixture@postgres:5432/diis_flags_lab',
      STAGING_DATABASE_URL: 'postgresql://fixture:fixture@postgres:5432/smk_staging_db',
      REDIS_URL: 'redis://redis:6379', REDIS_QUEUE_NAMESPACE: branch === 'staging' ? 'staging' : 'production',
      ...values,
    };
    writeFileSync(envFile, Object.entries(synthetic).map(([k, v]) => `${k}=${v}\n`).join(''));
    const args = ['compose', '--project-directory', dockerRoot, '-p', `diis-flags-${branch}`,
      '-f', path.join(dockerRoot, 'docker-compose.yml')];
    if (branch === 'staging') args.push('-f', path.join(dockerRoot, 'docker-compose.staging.yml'));
    args.push('--env-file', envFile, 'config', '--format', 'json');
    const result = spawnSync('docker', args, { env: cliEnv, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Daemonless ${branch} Compose config failed (exit ${result.status}); no runtime command executed`);
    const parsed = JSON.parse(result.stdout) as ComposeModel;
    expect(parsed.services.api).toBeDefined();
    cache.set(key, parsed);
    return parsed;
  }

  function policies(environment: Record<string, string | null>) {
    const before = flags.map(flag => process.env[flag]);
    try {
      for (const flag of flags) {
        const value = environment[flag];
        if (value === undefined || value === null) delete process.env[flag]; else process.env[flag] = value;
      }
      return {
        draft: (() => { try { schedulingPolicy(); return true; } catch { return false; } })(),
        imports: (() => { try { schedulingImportPolicy(); return true; } catch { return false; } })(),
      };
    } finally {
      flags.forEach((flag, i) => { if (before[i] === undefined) delete process.env[flag]; else process.env[flag] = before[i]; });
    }
  }

  const cases: { name: string; values: Partial<Record<Flag, string>>; draft: boolean; imports: boolean; forwarded: string[] }[] = [
    { name: 'absent', values: {}, draft: false, imports: false, forwarded: ['false', 'false'] },
    { name: 'empty', values: { SMART_SCHEDULER_ENABLED: '', SMART_SCHEDULER_IMPORT_ENABLED: '' }, draft: false, imports: false, forwarded: ['false', 'false'] },
    { name: 'disabled', values: { SMART_SCHEDULER_ENABLED: 'false', SMART_SCHEDULER_IMPORT_ENABLED: 'false' }, draft: false, imports: false, forwarded: ['false', 'false'] },
    { name: 'draft only', values: { SMART_SCHEDULER_ENABLED: 'true', SMART_SCHEDULER_IMPORT_ENABLED: 'false' }, draft: true, imports: false, forwarded: ['true', 'false'] },
    { name: 'import cannot enable foundation', values: { SMART_SCHEDULER_ENABLED: 'false', SMART_SCHEDULER_IMPORT_ENABLED: 'true' }, draft: false, imports: false, forwarded: ['false', 'true'] },
    { name: 'enabled', values: enabledValues, draft: true, imports: true, forwarded: ['true', 'true'] },
    { name: 'invalid literal', values: { SMART_SCHEDULER_ENABLED: 'TRUE', SMART_SCHEDULER_IMPORT_ENABLED: '1' }, draft: false, imports: false, forwarded: ['TRUE', '1'] },
  ];
  for (const branch of ['main', 'staging'] as const) {
    it.each(cases)(`${branch}: $name reaches the real API policy`, ({ values, draft, imports, forwarded }) => {
      const environment = model(branch, values).services.api.environment!;
      expect(flags.map(flag => environment[flag])).toEqual(forwarded);
      expect(policies(environment)).toEqual({ draft, imports });
    });

    it(`${branch}: enabling flags changes nothing except the two API environment values`, () => {
      const disabled = structuredClone(model(branch, {}));
      const enabled = structuredClone(model(branch, enabledValues));
      expect(disabled.services.api.environment?.DATABASE_URL).toBe(branch === 'staging'
        ? 'postgresql://fixture:fixture@postgres:5432/smk_staging_db'
        : 'postgresql://fixture:fixture@postgres:5432/diis_flags_lab');
      for (const flag of flags) delete disabled.services.api.environment![flag];
      for (const flag of flags) delete enabled.services.api.environment![flag];
      expect(enabled).toEqual(disabled);
      for (const [name, service] of Object.entries(enabled.services)) {
        if (name !== 'api') for (const flag of flags) expect(service.environment?.[flag]).toBeUndefined();
      }
    });
  }

  it('staging opt-in does not change a subsequent main config from its separate env file', () => {
    expect(policies(model('staging', enabledValues).services.api.environment!)).toEqual({ draft: true, imports: true });
    expect(policies(model('main', {}).services.api.environment!)).toEqual({ draft: false, imports: false });
  });
});
