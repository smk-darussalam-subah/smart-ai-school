# W10-D Integrated Operations Packet

Status: DRAFT, NOT AN EXECUTION APPROVAL. Owner: Director. Executor prepares and
verifies; Independent Reviewer reviews; neither signs for the Director.
All B01-B14 stay in this batch. Source readiness is not host/recovery readiness.

## Authority and Evidence

Baseline develop `a8d72b8e2a6e78438e4cef46ad21913ff369d3f0`, tree
`75364250f2a5bbe875fc4bcf3da517c8f456adea`; staging
`777314b12bcd168e2772603a31d657919aafa5bb`; main
`418846959b90b38e10141cb8df995872802219fe`.

New D0 helpers remain local and UNRELEASED. Review the literal successor manifest
and current test evidence. Historical source-closure and capacity reports remain
byte-identical. The new CI handoff executes both historical validators against
their exact reviewed Git baseline, then binds every current changed byte through
the explicit successor. It does not re-label historical tests as a new run.

Every action below needs an exact packet containing: stage/operation ID, operator,
source SHA/tree, helper/launcher/manifest hashes, target host and daemon identity,
full argv and environment-key inventory, source/destination path or prefix,
credential fingerprints only, not-before/expiry in UTC and WIB, maximum duration,
expected writes, no-touch set, result receipt, cleanup/absence proof, stop condition,
and rollback or explicit irreversibility. Unfilled bindings mean NOT EXECUTABLE.
Never substitute a future merge SHA or the current checkout automatically.

## D1: Delivery, Identity and Custody

Dependencies: independent source approval, literal Git authorization, named
publisher/puller, owner custody answers. No key or package is created by D0.

1. Package only the final literal manifest into a feature PR. Required CI,
   independent exact-PR review and normal develop merge are distinct gates.
2. After exact approval, configure `backup-image-publication` for branch develop
   and `staging-image-publication` for branch staging. Each requires Director
   review and `can_admins_bypass=false`. Single-operator `prevent_self_review=false`
   is documented, not represented as two-person control. Strengthen the existing
   staging deployment environment before any staging promotion can start a run.
3. Publisher permissions: contents read, actions read, packages write through
   the workflow token. Puller: supported GHCR package-read credential only, no
   package-delete/repo-write. Do not put an organization-admin token in the job.
4. Exact metadata reads are performed by `verify-publication-metadata.py collect`:
   build run, environment, exact branch policy, and selected package. HTTP
   401/403/429/5xx or unknown response stops. A 404 is NOT proof of absence.
5. For a genuinely absent package, an organization-package administrator must
   inspect a complete authorized inventory and supply a reviewed evidence file.
   `diis-first-publication-owner-evidence-v1` binds owner, authority, repository,
   package, source SHA, build run, inventory hash, complete/absent disposition,
   not-before and expiry (at most 3600 seconds). Director hashes those exact bytes
   into the publication packet. The executor must not fabricate this attestation.
6. School Shared Drive `DIIS Recovery/BACKUP_DIIS`, existing dedicated SA. Bind
   principal/project/Drive/folder by identity and hashes, scope to that destination;
   no OAuth shared user, impersonation or domain-wide delegation. Maximum one
   new key after separate exact approval. Runtime remains service-account-file.
   Host `/etc/diis/google-service-account.json`, owner/mode approved root/0600;
   candidate mount `/run/diis-secrets/google-service-account.json` read-only.
7. Crypt standard filename encryption + directory encryption true; independently
   stored encrypted recovery kit, accountable owner, named alternate if available,
   review date and revocation plan. Do not keep the only decryption secret in the
   same Drive as ciphertext. No password/private key is sent through chat/Git.

Rollback: revoke only the newly inventoried key/token if provisioning fails;
retain pre-existing identities. Do not revoke an existing working credential or
alter provider configuration without that exact rollback in Director approval.
Metadata uncertainty is not permission to create a replacement account.

## D2: Images and Legacy Preservation

### Exact image sequence

Workflow remains `.github/workflows/backup-image.yml`. Its three literal profiles
are backup -> `diis-pg-backup`, api -> `diis-api`, web -> `diis-web` in school GHCR.
Backup builds only on exact develop; API/web builds only on the actual staging
merge while application deployment waits behind the real environment gate.
No differing build/deploy revision is accepted for API/web. No rebuild at publish.

The approved CLI dispatch form is:

```bash
gh workflow run backup-image.yml --repo smk-darussalam-subah/smart-ai-school \
  --ref "$APPROVED_BRANCH" -f operation=build -f source_sha="$EXACT_SHA" \
  -f profile="$APPROVED_PROFILE" -f publication_mode=existing
```

The source workflow pins scanner tools/actions, builds once, inspects the image,
runs a network-none/read-only smoke, produces SBOM and full Grype report, then
archives that exact image. Binding includes hashes of every evidence file.
API/web config labels and artifact binding are checked before publish and after
registry roundtrip. Web rewrites must point to `http://smk-staging-api:3001` and
VAPID must be a valid public key. Arbitrary/private build arguments are not accepted.
Source/build/revision/config changes require a new candidate, not a relabel.

After scan review and explicit residual-risk decision:

```bash
gh workflow run backup-image.yml --repo smk-darussalam-subah/smart-ai-school \
  --ref "$APPROVED_BRANCH" -f operation=publish -f source_sha="$EXACT_SHA" \
  -f profile="$APPROVED_PROFILE" -f publication_mode="$APPROVED_MODE" \
  -f build_run_id="$APPROVED_BUILD_RUN" -f approval_sha256="$DIRECTOR_PACKET_SHA256" \
  -f absence_sha256="$APPROVED_ABSENCE_SHA256_OR_EMPTY"
```

Use v2 publication approval for first publication or API/web; it binds profile,
mode and absence evidence in addition to the existing artifact/risk/time binding.
First mode refuses an existing package; existing mode refuses absent/inaccessible.
Post-push verifies private visibility AND repository linkage. Ambiguous push has
no retry; preserve run evidence, inspect registry read-only and ask for new review.
Runtime uses digest-qualified platform reference, not tag/latest. Archive, loaded
config/layers and registry copy-back must agree byte-for-byte. Historical image
917271... used in D0 synthetic tests is NOT the final publication candidate.

HIGH/CRITICAL reachable/exploitable vulnerabilities must be fixed. Every other
residual has version, exposure rationale, mitigation, owner, expiry and Director
decision hash. No old CVE count is a ceiling or acceptance. Retain build artifacts
beyond the seven-day Actions expiry through a separately approved private,
hash-identical archive when necessary; missing artifacts block publication.

### Preservation-only operation

Bind the exact legacy object set from a fresh read-only inventory. Seven objects
and 8,709,353 bytes are historical inventory, not a claim of current content/hash.
Read/hash all legacy points through the approved identity, encrypted immutable
copy to a new isolated school prefix, copy back/decrypt/hash all selected bytes.
No writes to the source bucket, no sync, purge, retention apply or point overwrite.
Receipt is `LEGACY_PRESERVATION_ONLY`, not W10-D recovery acceptance. Zero completion
markers in the legacy format is not by itself a reason to reject preservation.

Before a Docker restart, select a protected legacy point for disposable restore
and safe reconciliation, or ratify a separate consistent-backup prerequisite.
No restoration to any production cluster. Preserve the original legacy tool/image
and scheduler/config hashes. Plaintext exists only in the private bounded owned
work area, followed by inventory-based cleanup. File deletion is not a claim of
physical SSD erasure; encrypted disposable volumes and key disposal are preferred.

## D3: Host Compatibility, One Cleanup and Lifecycle

Dependencies: D2 preservation, exact native-GC/daemon/writer inventory, valid
quiet window, root/appuser ownership, source-reviewed RELEASED helper bundle.

Important discovery: actual legacy `/backup.sh` hash
`bc530d0a9110319684e7e4b60db56a3da1e1d979d9b1b6d8dc7887c209ff204e`
does not call the canonical lock. Installing only `backup-lib.sh` is insufficient.

1. Install the existing hash-bound `install-w10d-backup-lock-bootstrap.sh` and
   tmpfiles rule only through separately approved authority. The production
   canonical lock resolves `/var/lock/diis-backup` -> `/run/lock/diis-backup`.
   Host lock is `/home/appuser/.local/state/diis-deploy/deploy.lock`.
2. Verify launcher and RELEASED bundle hashes out of band. As appuser, run:

```bash
python3 -B "$BUNDLE/infrastructure/deploy/install-w10d-writer-compatibility.py" \
  --bundle "$BUNDLE" --bundle-sha256 "$RELEASED_BUNDLE_HASH" \
  --source-sha "$REVIEWED_HELPER_SOURCE_SHA"
```

This installs one immutable two-file artifact outside the checkouts: the canonical
library and its exact legacy compatibility wrapper. The content address is
`4fe7e47998efb832ddc55d115f92b1ee5d7e73a4d9cb11baf7fdfe8f6388b8ac`.
It refuses UNRELEASED source, wrong digest, writable/symlink paths and partial
prior files; exact repeat is a no-op. No container is changed by the installer.

3. Before changing a mount, capture the observed original script with the reviewed
   bounded helper from the same RELEASED bundle:

```bash
python3 -B "$BUNDLE/infrastructure/deploy/install-w10d-legacy-writer-snapshot.py" \
  --bundle "$BUNDLE" --bundle-sha256 "$RELEASED_BUNDLE_HASH" \
  --source-sha "$REVIEWED_HELPER_SOURCE_SHA"
```

   The helper is fixed to container `smk-pg-backup` and `/backup.sh`; it verifies
   the container identity and exact hash before and after a 64 KiB/30 second
   bounded read, validates shell syntax without execution, and stores the bytes
   at `writer-compatibility/legacy/bc530d0a.../legacy-backup.sh` with private,
   exclusive metadata. Existing partial or different content stops the stage.
   It does not alter the container, mount, schedule, or application.
4. Ratify a separate legacy container compatibility packet: retain exact original
   image/entrypoint/env/cron/config; use the captured content-addressed custody
   path as the source for mounting the original
   at `/legacy-backup.sh`, the installed wrapper as `/backup.sh`, and the installed
   library as `/backup-lib.sh`, all read-only. The application preflight verifies
   the three exact host paths and three runtime hashes, not just the library.
   Bind actual config/mount hashes before one
   bounded recreate of only `smk-pg-backup`. Do not use an edited application
   checkout as the mount source. No scheduler executes during this preparation.
   Test mode variables are prohibited in runtime. Unknown legacy bytes stop.
5. The wrapper uses the canonical directory lock, publishes persistent quarantine
   before invoking the frozen legacy script, suppresses raw legacy output, bounds
   the child to 1800 seconds plus 30-second termination allowance, and releases
   only after success. Failure/signal retains quarantine; no automatic retry or
   stale reclaim. Reconcile actual processes before any manual quarantine release.
   It is compatibility containment, not a new backup scheduler or recovery proof.
6. Verify actual caller/hash/mount, root/system/appuser/container/n8n schedules,
   all host writers and quarantine participation. A typed owner attestation is
   signed only after these observations; a true boolean is not substitute evidence.
   Pause legacy scheduling only in the approved window after no active run.
7. Native GC must be inactive for manual cleanup. Preserve original daemon bytes,
   candidate bytes and metadata. `capacity_gc.py` plans the merge; `dockerd
   --validate --config-file <candidate>` is required before exact atomic install.
   Docker restart may interrupt every app/DB container: approve a concrete WIB
   outage slot, one forward restart and one verified original-config rollback.
   No loop, reboot, global delete, or blanket container stop is authorized.
7. Compare 168h/72h/48h from one inventory; recommend >=72h, fixed cutoff, exact
   eligible ID set, excluding active/shared/retained parents. Native GC cannot
   participate concurrently. Keep the original policy thresholds.

```bash
bash "$BUNDLE/infrastructure/deploy/diis-build-cache-cleanup.sh" \
  --bundle "$BUNDLE" --sha256 "$RELEASED_BUNDLE_HASH" observe \
  --profile "$STATE/profile.json" --policy "$STATE/policy.json" \
  --output "$STATE/candidate.json"
bash "$BUNDLE/infrastructure/deploy/diis-build-cache-cleanup.sh" \
  --bundle "$BUNDLE" --sha256 "$RELEASED_BUNDLE_HASH" apply \
  --profile "$STATE/profile.json" --policy "$STATE/policy.json" \
  --candidate "$STATE/candidate.json" --approval "$STATE/approval.json" \
  --approval-sha256 "$DIRECTOR_PACKET_SHA256" \
  --writer-evidence "$STATE/writer.json" --output "$STATE/result.json"
```

Observe does not authorize apply. Candidate <=600 seconds; missed expiry means
new observation and approval, not TTL extension. Simulated prune budget 90 seconds,
lab timeout 180 seconds and actual approved maintenance window are different.
Physical reclaim guaranteed before execution is zero. Target is max(24 GiB, 30%
of filesystem), with release minimum 24 GiB AND 25%. One pass only, no `--all`,
system/image/volume prune, backup deletion or relaxed cutoff. Deletion has no
rollback. Below target => `CLEANUP_COMPLETED_TARGET_NOT_MET`, no automatic retry.
Ambiguous daemon completion retains journal/quarantine for reconciliation.

After safe manual completion, enable/read back separately approved bounded
native-GC policy (proposed 168h/8 GiB reserved/12 GiB max-used/24 GiB min-free).
These are triggers/reservations, not a hard filesystem quota. Native GC does not
take the DIIS application lock. Future manual cleanup must first disable it in
an approved maintenance transaction; no concurrency attestation may pretend it
participates. Deployment peak I/O/capacity still needs a measured window.

Rollback of compatibility: restore exact former container config/schedule only
after producer absence and quarantine reconciliation; compare original hashes.
Never delete retained original image/tool volumes. Resume legacy only after the
window is safely closed or after an explicitly approved restoration.

## D4: Exact Staging, Then Source Main if Required

Before promotion: staging deployment environment gate is active and holds jobs.
Review PR base/head/tree and source objects. Merge only with exact approval.
Build API/web on the actual resulting staging merge SHA; publish after separate
artifact review, then preload the digest-qualified images through exact host-pull
approval. Backup image can use an ancestor revision only when the existing core
verifies all relevant unchanged backup inputs; API/web revision must equal deploy.

Bind `PG_BACKUP_IMAGE`, env full hash, media attestation, actual backup-library
mount, root/n8n/writer/preservation evidence, baseline Compose receipt, old app
image IDs/config hashes, target app IDs/revisions/public-config hashes and target
Compose hash. Packet schema is `diis-staging-application-approval-v2`.
Web public key in environment and build must match. No env change after freeze.
Release mode `application` is explicit, not silently substituted for recovery-only.

The official deploy workflow transports the exact helpers from Actions. It may
not build/pull/migrate/provision ingress or start a scheduler in this transaction.
Verify source SHA/tree, health, OIDC, app identity, no shared drift, rollback images,
quarantine semantics, receipts and owned cleanup. Negative destructive faults run
only in explicitly authorized disposable/staging fixtures, never shared production.

Only after independent staging approval: separately reviewed staging -> main PR,
normal exact environment approval, source promotion and read-only health proof.
Candidate creation still requires real clean main SHA/tree; EXPECTED_MAIN_SHA may
never point to develop to bypass this order. Source promotion does not commission.

## D5: Recovery, Scheduler and Notification

Restore proposal requiring Director selection: temporary isolated Linux VM with
encrypted work disk and exact pinned PostgreSQL/MinIO tooling; no production
network membership; school credential read limited to the approved off-site
prefix. Use existing local Linux for synthetic D0 only. Its measured free space
was about 9.66 GiB, so it is not accepted for the real restore.

Recommended target is a temporary AWS Lightsail OS-only Linux instance in Jakarta
(`ap-southeast-3`), a different provider/account failure domain from the Hetzner
VPS and Google Shared Drive. Start with the 4 GiB RAM / 80 GB instance only if the
fresh D5 peak calculation fits within 60 GiB, preserving at least 25% free. Attach
a dedicated encrypted block disk for the plaintext work area; size it from current
database bytes + object bytes + encrypted download + decrypted copy + restore
workspace + 25% free. AWS currently lists the instance at USD 24/month, billed
hourly up to that cap, and block storage at USD 0.10/GB-month. A proposed Director
ceiling is USD 5 for a maximum 48-hour drill, excluding tax and unexpected transfer;
actual console quote and currency conversion must be captured before purchase.
If the formula exceeds the 80 GB boundary, stop and propose the 8 GiB / 160 GB
instance or a larger attached disk rather than shrinking the safety margin.

Required access: school-owned AWS account with billing owner approval, Jakarta
region enabled, a least-privilege temporary operator identity, a new drill-only SSH
key delivered outside chat, outbound HTTPS to Shared Drive/GHCR, and no inbound
path except bounded operator SSH. Do not copy the production SSH key. The encrypted
work disk, VM, key, firewall rule and temporary credentials are inventoried before
use and deleted after hash reconciliation; deletion is verified but not described
as physical SSD erasure. Lightsail states that attached disks are encrypted at rest
by default. Pricing and encryption references: [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/)
and [Lightsail block storage](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-block-storage.html).

This is a proposal, not a purchase. Real sizing still derives from fresh current
DB/object bytes and archive/copy-back/restore peak. Account owner, exact region/AZ,
disk bytes, final price cap, billing expiry, key custody and crypto-cleanup receipt
remain mandatory fields in the D5 approval packet.

After target/custody approval and main promotion, use exact existing entrypoints:

- `infrastructure/deploy/create-w10d-backup-candidate.sh`, root Gate, exact
  `EXPECTED_MAIN_SHA/TREE`, attempt ID, image ref/ID, MinIO volume, env hash,
  SA principal/project/key/artifact hashes, Drive/folder hashes and off-site
  fingerprint; confirmation `CREATE_ONE_ISOLATED_W10D_BACKUP_CANDIDATE`.
- Candidate own tool volume, canonical lock mount, SA read-only mount, scheduler
  disabled. Preserve original legacy image/tool volume/config as rollback.
- `scripts/prepare-offsite-restore.sh <backupId> <new-private-attempt>` using
  only the approved crypt remote and exact provider/custody fingerprints.
- Restore through existing isolated database/object validators; reconcile all
  migrations/safe counts, exact object sets/hashes and read-only application smoke.
  No production restore or fallback to local MinIO is acceptance.
- `infrastructure/deploy/w10d-backup-scheduler-handoff.sh`, only after the exact
  acceptance bundle passes independent review. Bind candidate/source/image,
  tool/data/lock volumes, credential fingerprints and actual legacy identity.

Full-system coverage is not yet proven: DB DIIS/object chain does not automatically
cover Keycloak DB, n8n DB/encryption key, MinIO identity/config and private runtime
configuration. Before B11/B14 final closure, inventory each component as encrypted
and restored, or reconstructable with actual proof. Missing state remains BLOCKED
inside this batch; do not claim complete VPS recovery from DIIS-only dumps.

One backup scheduler: 02:00 Asia/Jakarta. One n8n monitor: 02:45 Asia/Jakarta;
monitor does not schedule backup. Install exact workflow inactive first, dedicated
S3-compatible read-only credential restricted to telemetry, SMTP school credential
in n8n encrypted storage. Sender/recipient `admin@smkdarussalamsubah.sch.id`.
Test success/no alarm; stale/malformed/S3 failure/redacted alarm; SMTP failure
failed execution. Synthetic email only after D5 approval; mailbox receipt required.
Do not revoke live credentials or corrupt real telemetry to create failures.

Director owns mailbox. Temporary manual fallback must include direct inspection
of n8n execution and off-site completion, not only reading the same possibly-broken
mailbox. Proposed operator checks at 03:00 WIB during first three days; actual
owner/slot needs ratification. An independently verified existing external monitor
can replace this, but no new channel/provider is enabled by D0.

Failure: preserve candidate/proof/legacy identities, stop handoff, no blind retry;
if already handed off and rollback is authorized, return to exactly one verified
legacy scheduler. No deletion of original tool volume or restore points.

## D6: Scheduled Proof and Handover

At commissioning approval time bind a real start date and owner for:

- first scheduled backup 02:00 and monitor 02:45, follow-up 03:00 WIB;
- three consecutive daily scheduled backups, not three manual runs;
- capacity samples spanning seven days; use compatible authenticated history
  if sufficient, otherwise day 0/3/7. Cleanup is an event, not negative growth.
- retention dry-run: local 3 daily + protected pre-change, absolute budget
  4,015,794,422 bytes; off-site 14 daily/8 weekly/12 monthly + protected.
  Normal retention never deletes shared content-addressed blobs.

Until valid history exists, use INSUFFICIENT_HISTORY, not zero growth. Scheduled
follow-up is part of this batch but no automation/timer is installed in D0.
Record actual safe counts, log scan, identity and temporary plaintext cleanup for
each run, then independent final review of B01-B14 and component coverage.

Operator handover includes encrypted kit location, recovery delegate, break-glass,
access review date, key rotation/revocation, restore procedure, alarm response and
monthly disposable restore. Appointment activation, real-data pilot and identity
mutation remain separate known go-live gates; they are not silently included.

## Ratification Templates

These are draft requests, never signed approvals. Fill dynamic values after the
preceding stage and independent review, then request ONE complete stage decision.

| Stage | Director must bind | Stop / rollback boundary |
| --- | --- | --- |
| D1 | source manifest, PR/head/tree, exact envs and principals, key count/custody | wrong identity/permissions; revoke only new inventoried key if authorized |
| D2 | build run/archive/SBOM/scan/risk hashes, first/existing mode, preservation prefix/object set | ambiguous publish no retry; preservation no source overwrite/delete |
| D3 | helper bundle/host/daemon/native-GC originals/candidates, outage window, one cache ID set/TTL | no blind unlock/retry; cache deletion irreversible; exact config rollback only |
| D4 | PR/merge/tree, image/config/env/receipt/attestation hashes and run attempt | wrong SHA/tree or shared drift; existing verified transaction rollback/quarantine |
| D5 | candidate/acceptance/main/custody/restore target/n8n/SMTP bindings | exactly one scheduler; retain legacy and reconcile before bounded rollback |
| D6 | start date, three daily runs, sample schedule, owner and retention dry-run | no assumed history; no hidden ongoing mutation; final review required |

Official references checked for this source choice: [GHCR publication and auth](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
and [environment metadata permissions](https://docs.github.com/en/rest/deployments/environments#get-an-environment).
Metadata GET needs Actions read; environment mutation requires separate admin
authority. These documents do not constitute DIIS execution approval.
