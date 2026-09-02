import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const repositoryRoot = path.resolve(__dirname, '../../../..');
const workflowPath = path.join(repositoryRoot, '.github/workflows/deploy.yml');
const ingressScriptPath = path.join(repositoryRoot, 'infrastructure/deploy/diis-shared-ingress.sh');
const behavioralContractPath = path.join(
  repositoryRoot,
  'infrastructure/deploy/tests/shared-ingress-contract.sh',
);
const lockContractPath = path.join(
  repositoryRoot,
  'infrastructure/deploy/tests/deploy-lock-contract.sh',
);
const deployContextPath = path.join(
  repositoryRoot,
  'infrastructure/deploy/validate-deploy-context.sh',
);
const candidateRoutingDockerContractPath = path.join(
  repositoryRoot,
  'infrastructure/deploy/tests/candidate-routing-docker-contract.sh',
);
const nginxConfigPath = path.join(repositoryRoot, 'infrastructure/nginx/nginx.conf');

describe('deployment workflow safety contract', () => {
  const workflow = readFileSync(workflowPath, 'utf8');
  const ingressScript = readFileSync(ingressScriptPath, 'utf8');

  it('rejects host drift and binds checkout to the workflow SHA', () => {
    const actionUses = [...workflow.matchAll(/^\s*uses:\s+([^#\s]+)(?:\s+#.*)?$/gm)].map(
      (match) => match[1],
    );
    expect(actionUses).toHaveLength(3);
    for (const actionUse of actionUses) {
      expect(actionUse).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
    }
    expect(actionUses).toEqual([
      'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
      'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
      'appleboy/ssh-action@029f5b4aeeeb58fdfe1410a5d17f967dacf36262',
    ]);
    expect(workflow).toContain('group: diis-shared-host-deployment');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('flock --wait "$DEPLOY_LOCK_TIMEOUT_SECONDS" 9');
    expect(workflow).toContain('DEPLOY_HOST_LOCK_TIMEOUT');
    expect(workflow).toContain('INGRESS_ROLLOUT_HANDOFF=1');
    expect(workflow).toContain('preserve_unconsumed_rollback');
    expect(workflow).toContain('rollback-${RUN_ID}-${RUN_ATTEMPT}-${EXPECTED_SHA}.conf');
    expect(workflow).toContain('DIIS_EXPECTED_SHA: ${{ github.sha }}');
    expect(workflow).toContain('EXPECTED_SHA="$DIIS_EXPECTED_SHA"');
    expect(workflow).toContain('git status --porcelain=v1 --untracked-files=all');
    expect(workflow).toContain('DEPLOY_HOST_DRIFT_DETECTED');
    expect(workflow).toContain(
      'git fetch --no-tags origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"',
    );
    expect(workflow).toContain('REMOTE_SHA=$(git rev-parse "origin/$BRANCH")');
    expect(workflow).toContain('[[ "$REMOTE_SHA" == "$EXPECTED_SHA" ]]');
    expect(workflow).toContain('git merge --ff-only "$EXPECTED_SHA"');
    expect(workflow).toContain('[[ "$(git rev-parse HEAD)" == "$EXPECTED_SHA" ]]');
    expect(workflow).not.toContain('git stash');
    expect(workflow).not.toContain('git pull origin');
  });

  it('rejects forbidden dispatch refs without interpolating GitHub context into the remote shell', () => {
    expect(workflow).toContain(
      "if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/staging'",
    );
    expect(workflow).toContain(
      'envs: DIIS_GITHUB_REF,DIIS_DEPLOY_BRANCH,DIIS_EXPECTED_SHA,DIIS_RUN_ID,DIIS_RUN_ATTEMPT',
    );
    const remoteScript = workflow.match(
      / {10}script: \|\r?\n([\s\S]*?)\r?\n {6}- name: Notify deployment success/,
    )?.[1];
    expect(remoteScript).toBeDefined();
    expect(remoteScript).not.toContain('${{ github.');
    expect(existsSync(deployContextPath)).toBe(true);

    if (process.platform !== 'linux') return;

    const validSha = 'a'.repeat(40);
    for (const branch of ['main', 'staging']) {
      const result = spawnSync(
        '/usr/bin/env',
        ['bash', deployContextPath, `refs/heads/${branch}`, branch, validSha, '123', '1'],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`DEPLOY_CONTEXT_VALID branch=${branch}`);
    }

    const scratch = mkdtempSync(path.join(tmpdir(), 'diis-deploy-context-'));
    try {
      const sentinel = path.join(scratch, 'injected');
      const maliciousRef = `refs/heads/x$(touch\${IFS}${sentinel})`;
      const gitRefCheck = spawnSync('git', ['check-ref-format', maliciousRef], {
        encoding: 'utf8',
      });
      expect(gitRefCheck.status).toBe(0);
      const rejected = spawnSync(
        '/usr/bin/env',
        ['bash', deployContextPath, maliciousRef, 'x', validSha, '123', '1'],
        { encoding: 'utf8' },
      );
      expect(rejected.status).toBe(64);
      expect(rejected.stderr).toContain('reason=forbidden-ref');
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('keeps staging deploy read-only toward the shared production ingress', () => {
    expect(workflow).toContain('bash "$INGRESS_SCRIPT" preflight-staging');
    expect(workflow).toContain('bash "$INGRESS_SCRIPT" post-staging');
    expect(workflow).not.toContain(
      'cp "$WORK_DIR/infrastructure/nginx/nginx.conf" "$PROD_NGINX_DIR/nginx.conf"',
    );
    expect(workflow).not.toContain('docker rm -f smk-nginx');
    expect(workflow).not.toContain('docker network create smk-staging-net');
    expect(workflow).toContain(
      'git show "${AUTHORITATIVE_MAIN_SHA}:infrastructure/nginx/nginx.conf"',
    );
    expect(ingressScript).toContain('verify_main_authority');
    expect(ingressScript).toContain('status=validated-not-activated');
    expect(ingressScript).toContain('--publish 127.0.0.1::443');
    expect(ingressScript).toContain('--resolve "${host}:${port}:127.0.0.1"');
    expect(ingressScript).toContain('SHARED_INGRESS_CANDIDATE_ROUTING status=pass routes=4');
    expect(ingressScript).toContain('SHARED_INGRESS_ROUTE_CONTRACT status=pass routes=4');
    expect(ingressScript).toContain('SHARED_INGRESS_CANDIDATE_ROUTE_IDENTITY_MISMATCH');
    expect(ingressScript).toContain('SHARED_INGRESS_CANDIDATE_RECOVERY_REQUIRED container=');
    expect(ingressScript).toContain('candidate-observability-unavailable');
    expect(ingressScript).toContain('candidate_container_cleanup');
    expect(ingressScript).toContain('verify-route-contract)');
    expect(ingressScript).not.toContain('staging-config-differs-from-production');
    expect(existsSync(candidateRoutingDockerContractPath)).toBe(true);
    const dockerContract = readFileSync(candidateRoutingDockerContractPath, 'utf8');
    expect(dockerContract).toContain(
      'nginx@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10',
    );
    expect(dockerContract).not.toMatch(/nginx:\d[^@\s}]*/);
    expect(dockerContract).toContain('CANDIDATE_TEST_IMAGE digest=$IMAGE_ID');
    if (process.platform === 'linux') {
      const mutableImage = spawnSync('/usr/bin/env', ['bash', candidateRoutingDockerContractPath], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DIIS_CANDIDATE_TEST_NGINX_IMAGE: 'nginx:latest',
        },
      });
      expect(mutableImage.status).toBe(64);
      expect(mutableImage.stderr).toContain(
        'CANDIDATE_TEST_IMAGE_REJECTED reason=mutable-or-invalid-reference',
      );

      const routeContract = spawnSync(
        '/usr/bin/env',
        ['bash', ingressScriptPath, 'verify-route-contract', nginxConfigPath],
        { encoding: 'utf8' },
      );
      expect(routeContract.status).toBe(0);
      expect(routeContract.stdout).toContain('SHARED_INGRESS_ROUTE_CONTRACT status=pass routes=4');
    }
    for (const marker of [
      'REAL_CANDIDATE_ROUTING_HEALTHY_OK',
      'REAL_CANDIDATE_CROSS_ENV_SWAP_REJECTED_OK',
      'REAL_CANDIDATE_WEB_API_SWAP_REJECTED_OK',
      'REAL_CANDIDATE_ROUTING_FAILURE_CLEANUP_OK',
      'REAL_CANDIDATE_ROUTING_CLEANUP_ZERO_OK',
    ]) {
      expect(dockerContract).toContain(marker);
    }

    const preflight = workflow.indexOf('bash "$INGRESS_SCRIPT" preflight-staging');
    const imageBuild = workflow.indexOf('build --no-cache $BUILD_ARG_API');
    const appDeploy = workflow.indexOf('up -d --no-deps api web');
    const postcheck = workflow.indexOf('bash "$INGRESS_SCRIPT" post-staging');
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(imageBuild);
    expect(postcheck).toBeGreaterThan(appDeploy);
  });

  it('routes production ingress changes through the transactional helper', () => {
    expect(workflow).toContain(
      'bash "$INGRESS_SCRIPT" preflight-production "$NGINX_CONFIG_SHA" "$NGINX_ROLLBACK_CONFIG"',
    );
    expect(workflow).toContain(
      'bash "$INGRESS_SCRIPT" rollout-production "$NGINX_CONFIG_SHA" "$NGINX_ROLLBACK_CONFIG"',
    );
    expect(ingressScript).toContain('candidate-nginx-config-invalid');
    expect(ingressScript).toContain('nginx-recreate-exhausted');
    expect(ingressScript).toContain('staging-network-connect-failed');
    expect(ingressScript).toContain('staging-network-membership-not-confirmed');
    expect(ingressScript).toContain('public-health-failed');
    expect(ingressScript).toContain('SHARED_INGRESS_ROLLBACK status=pass');
    expect(ingressScript).toContain('SHARED_INGRESS_RECOVERY_REQUIRED');
    expect(ingressScript).toContain('MUTATION_STARTED=1');
  });

  it('proves failure and rollback paths behaviorally on Linux', () => {
    expect(existsSync(behavioralContractPath)).toBe(true);
    const contract = readFileSync(behavioralContractPath, 'utf8');
    const expectedMarkers = [
      'STAGING_NO_MUTATION_OK',
      'LEGITIMATE_STAGING_CANDIDATE_VALIDATION_OK',
      'CROSS_ENV_ROUTE_SWAP_FAIL_CLOSED_OK',
      'WEB_API_ROUTE_SWAP_FAIL_CLOSED_OK',
      'INVALID_CANDIDATE_ROUTING_FAIL_CLOSED_OK',
      'CANDIDATE_SIGNAL_CLEANUP_OK',
      'CANDIDATE_CLEANUP_FAILURE_FAIL_CLOSED_OK',
      'CANDIDATE_INSPECT_FAILURE_FAIL_CLOSED_OK',
      'PRODUCTION_CHECKOUT_DRIFT_FAIL_CLOSED_OK',
      'MAIN_SHA_MISMATCH_FAIL_CLOSED_OK',
      'RUNTIME_DIGEST_FAIL_CLOSED_OK',
      'INVALID_CONFIG_FAIL_CLOSED_OK',
      'THREE_RECREATE_FAILURES_ROLLBACK_OK',
      'RECONNECT_FAILURE_ROLLBACK_OK',
      'POST_HEALTH_FAILURE_ROLLBACK_OK',
      'SIGNAL_ROLLBACK_OK',
      'ROLLBACK_FAILURE_FAIL_CLOSED_OK',
      'COPY_FAILURE_RECOVERY_PRESERVED_OK',
      'MOVE_FAILURE_RECOVERY_PRESERVED_OK',
      'PRODUCTION_NOOP_OK',
      'PRODUCTION_ROLLOUT_OK',
    ];

    for (const marker of expectedMarkers) {
      expect(contract).toContain(marker);
    }

    if (process.platform !== 'linux') return;

    const result = spawnSync('/usr/bin/env', ['bash', behavioralContractPath], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    for (const marker of expectedMarkers) {
      expect(result.stdout).toContain(marker);
    }
  });

  it('serializes parallel host deployments with a bounded lock', () => {
    expect(existsSync(lockContractPath)).toBe(true);
    const contract = readFileSync(lockContractPath, 'utf8');
    const expectedMarkers = [
      'PARALLEL_DEPLOY_SERIALIZED_OK',
      'BOUNDED_LOCK_TIMEOUT_NO_MUTATION_OK',
    ];

    for (const marker of expectedMarkers) {
      expect(contract).toContain(marker);
    }
    expect(contract).toContain('bash "$0" worker');
    expect(contract).toContain('wait_for_event');
    expect(contract).toContain('reason=event-timeout');

    if (process.platform !== 'linux') return;

    const result = spawnSync('/usr/bin/env', ['bash', lockContractPath], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    for (const marker of expectedMarkers) {
      expect(result.stdout).toContain(marker);
    }
  });
});
