import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '../../../..');
const policyPath = path.join(
  repositoryRoot,
  'infrastructure/systemd/diis-appointment-automation.sudoers',
);
const runbookPath = path.join(
  repositoryRoot,
  'docs/runbooks/appointment-due-activation-systemd.md',
);
const manifestPath = path.join(
  repositoryRoot,
  'infrastructure/systemd/diis-appointment-automation.sha256',
);
const timerPath = path.join(
  repositoryRoot,
  'infrastructure/systemd/diis-appointment-due-activation.timer',
);
const operationsPath = path.join(
  repositoryRoot,
  'infrastructure/systemd/diis-appointment-operations.sh',
);
const behavioralContractPath = path.join(
  repositoryRoot,
  'infrastructure/systemd/tests/appointment-automation-operations-contract.sh',
);

const expectedCommands = [
  '/usr/bin/systemctl start diis-appointment-due-activation.service',
  '/usr/bin/systemctl enable --now diis-appointment-due-activation.timer',
  '/usr/bin/systemctl disable --now diis-appointment-due-activation.timer',
];

const expectedPolicy = `# DIIS appointment automation: exact noninteractive operations for appuser.
Cmnd_Alias DIIS_APPOINTMENT_AUTOMATION = \\
    ${expectedCommands[0]}, \\
    ${expectedCommands[1]}, \\
    ${expectedCommands[2]}

appuser ALL=(root) NOPASSWD: DIIS_APPOINTMENT_AUTOMATION
`;

function extractAliasCommands(policy: string): string[] {
  const alias = policy.match(
    /Cmnd_Alias DIIS_APPOINTMENT_AUTOMATION = ([\s\S]*?)\n\nappuser /,
  );
  const aliasBody = alias?.[1];
  if (!aliasBody) return [];

  return aliasBody
    .replace(/\\\r?\n/g, '')
    .split(',')
    .map((command) => command.trim())
    .filter(Boolean);
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

describe('appointment automation sudoers contract', () => {
  const policy = readFileSync(policyPath, 'utf8');
  const runbook = readFileSync(runbookPath, 'utf8');
  const manifest = readFileSync(manifestPath, 'utf8');
  const timer = readFileSync(timerPath, 'utf8');
  const operations = readFileSync(operationsPath, 'utf8');

  it('grants appuser exactly the three reviewed root commands', () => {
    expect(policy.replace(/\r\n/g, '\n')).toBe(expectedPolicy);
    expect(extractAliasCommands(policy)).toEqual(expectedCommands);
    expect(policy).toMatch(
      /^appuser ALL=\(root\) NOPASSWD: DIIS_APPOINTMENT_AUTOMATION$/m,
    );
    expect(policy.match(/NOPASSWD:/g)).toHaveLength(1);
  });

  it('contains no wildcard, arbitrary unit, shell, editor, or broad systemctl capability', () => {
    const commands = extractAliasCommands(policy).join('\n');

    for (const wildcard of ['*', '?', '[', ']']) {
      expect(commands).not.toContain(wildcard);
    }
    expect(commands).not.toMatch(/\b(restart|reload|daemon-reload|stop|edit)\b/);
    expect(commands).not.toMatch(/\/(?:ba|z|fi)?sh\b|\b(?:vim|vi|nano|sudoedit)\b/);
    expect(policy).not.toMatch(/NOPASSWD:\s*ALL/);
    expect(policy).not.toMatch(/\(ALL(?::ALL)?\)/);
  });

  it('uses one proven absolute systemctl path consistently', () => {
    expect(extractAliasCommands(policy)).toHaveLength(3);
    for (const command of extractAliasCommands(policy)) {
      expect(command.startsWith('/usr/bin/systemctl ')).toBe(true);
    }
    expect(policy).not.toMatch(/(^|\s)\/bin\/systemctl\b/);
  });

  it('documents noninteractive operator commands and prohibits host-namespace helpers', () => {
    for (const command of expectedCommands) {
      expect(runbook).toContain(`sudo -n ${command}`);
    }
    expect(runbook).not.toMatch(/sudo\s+systemctl/);
    expect(runbook).toContain('Dilarang memakai helper container host-namespace');
    expect(runbook).toContain('sudo -n -l');
    expect(runbook).toContain('/usr/sbin/visudo -cf');
    expect(runbook).toContain('0440');
    expect(runbook).toContain('/usr/bin/systemctl daemon-reload >/dev/null 2>&1');
    expect(runbook).toContain('/usr/bin/vim /etc/sudoers >/dev/null 2>&1');
  });

  it('pins every root-owned artifact to the reviewed manifest before installation', () => {
    const expectedArtifacts = new Map([
      ['diis-appointment-automation.sudoers', policyPath],
      [
        'diis-appointment-due-activation.sh',
        path.join(repositoryRoot, 'infrastructure/systemd/diis-appointment-due-activation.sh'),
      ],
      ['diis-appointment-operations.sh', operationsPath],
      [
        'diis-appointment-due-activation.service',
        path.join(
          repositoryRoot,
          'infrastructure/systemd/diis-appointment-due-activation.service',
        ),
      ],
      ['diis-appointment-due-activation.timer', timerPath],
      ['appointment-due-activation-systemd.md', runbookPath],
    ]);
    const entries = manifest
      .trim()
      .split(/\r?\n/)
      .map((line) => line.match(/^([a-f0-9]{64}) {2}([^/]+)$/))
      .map((match) => {
        const digest = match?.[1];
        const name = match?.[2];
        expect(digest).toBeDefined();
        expect(name).toBeDefined();
        return [name!, digest!] as const;
      });

    expect(entries.map(([name]) => name)).toEqual([...expectedArtifacts.keys()]);
    for (const [name, digest] of entries) {
      const artifactPath = expectedArtifacts.get(name);
      expect(artifactPath).toBeDefined();
      expect(sha256(artifactPath!)).toBe(digest);
    }

    expect(runbook).toContain('EXPECTED_SOURCE_SHA');
    expect(runbook).toContain('EXPECTED_SOURCE_TREE');
    expect(runbook).toContain('EXPECTED_MANIFEST_SHA256');
    expect(runbook).toContain('/root/diis-appointment-automation.XXXXXX');
    expect(runbook).toContain('/usr/bin/sha256sum -c manifest.sha256');
    expect(runbook).toContain('$REVIEWED_DIR/manifest.sha256');
    expect(runbook).toContain('trap cleanup_snapshot EXIT');
    expect(runbook).toContain('snapshot_target policy "$POLICY_TARGET"');
    expect(runbook).toContain('snapshot_target timer "$TIMER_TARGET"');
    expect(runbook).toContain('. "$REVIEWED_DIR/diis-appointment-operations.sh"');
    expect(runbook).toContain('diis_arm_install_traps');
    expect(runbook).toContain('DIIS_INSTALL_COMMITTED=true');
    expect(operations).toContain('trap diis_install_exit EXIT');
    expect(operations).toContain("trap 'diis_install_signal 129' HUP");
    expect(operations).toContain("trap 'diis_install_signal 130' INT");
    expect(operations).toContain("trap 'diis_install_signal 143' TERM");
    expect(operations).toContain('diis_restore_target script');
    expect(operations).toContain('diis_restore_target timer');
    expect(operations).toContain('"$DIIS_SYSTEMCTL_PATH" daemon-reload');
    expect(operations).toContain('diis_verify_restored_target timer');

    const verifiedInstall = runbook.slice(
      runbook.indexOf('/usr/bin/sha256sum -c manifest.sha256'),
      runbook.indexOf('## Preflight Appuser dan Negative Controls'),
    );
    expect(verifiedInstall).toContain('$REVIEWED_DIR/diis-appointment-automation.sudoers');
    expect(verifiedInstall).toContain('$REVIEWED_DIR/diis-appointment-due-activation.sh');
    expect(verifiedInstall).not.toContain('$SOURCE_DIR/infrastructure/');
    expect(verifiedInstall).not.toContain('$SOURCE_DIR/docs/');
  });

  it('treats Persistent timer catch-up as a reconciled activation branch', () => {
    expect(timer).toContain('Persistent=true');
    expect(runbook).toContain('Immediate persistent catch-up occurred');
    expect(runbook).toContain('SERVICE_START_BEFORE');
    expect(runbook).toContain('SERVICE_START_AFTER');
    expect(runbook).toContain('JOURNAL_CURSOR');
    expect(runbook).toContain('baseline aggregate database');
    expect(runbook).toContain('RESULT_COUNT');
    expect(runbook).toContain('DIIS_QUIET_SAMPLES_REQUIRED=5');
    expect(runbook).toContain('diis_wait_for_quiet_window');
    expect(operations).toContain('diis_related_jobs_present');
    expect(operations).toContain('list-jobs --no-legend --plain');
    expect(operations).toContain('*) return 4');
    expect(runbook).toContain('LAST_TRIGGER_FINAL');
    expect(runbook).toContain('NEXT_TRIGGER_EPOCH');
    expect(runbook).toContain('fail_closed_activation');
    expect(runbook).toContain('ACTIVATION_GATE_PASSED=false');
    expect(runbook).toContain('ACTIVATION_GATE_PASSED=true');
    expect(runbook).toContain('trap activation_exit EXIT');
    expect(runbook).toContain('reconcile this run before continuing');
    expect(runbook).toContain('Tidak boleh mengulang');
  });

  it('states the remaining Docker host privilege without claiming full least privilege', () => {
    expect(runbook).toContain('host-root-equivalent melalui Docker');
    expect(runbook).toContain('kontrol governance yang diaudit, bukan sandbox teknis');
    expect(runbook).toContain('security incident');
    expect(runbook).toContain('Pengurangan privilege Docker adalah');
    expect(runbook).not.toContain('full host least privilege');
  });

  it('proves transactional rollback and delayed catch-up behavior on Linux', () => {
    expect(existsSync(behavioralContractPath)).toBe(true);
    const contract = readFileSync(behavioralContractPath, 'utf8');
    expect(contract).toContain('CANONICAL_TRANSACTIONAL_ROLLBACK_OK=14/14');
    expect(contract).toContain('CANONICAL_DELAYED_CATCHUP_OK');
    expect(contract).toContain('CANONICAL_LIST_JOBS_FAILURE_FAIL_CLOSED_OK');
    expect(contract).toContain('CANONICAL_UNSTABLE_SEQUENCE_FAIL_CLOSED_OK');

    if (process.platform !== 'linux') return;

    const result = spawnSync('/usr/bin/env', ['bash', behavioralContractPath], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CANONICAL_TRANSACTIONAL_ROLLBACK_OK=14/14');
    expect(result.stdout).toContain('CANONICAL_DELAYED_CATCHUP_OK');
    expect(result.stdout).toContain('CANONICAL_LIST_JOBS_FAILURE_FAIL_CLOSED_OK');
    expect(result.stdout).toContain('CANONICAL_UNSTABLE_SEQUENCE_FAIL_CLOSED_OK');
  });

  it('passes visudo syntax validation on Linux', () => {
    if (process.platform !== 'linux') return;

    const visudoPath = ['/usr/sbin/visudo', '/usr/bin/visudo'].find(existsSync);
    expect(visudoPath).toBeDefined();

    const result = spawnSync(visudoPath!, ['-cf', policyPath], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('parsed OK');
  });
});
