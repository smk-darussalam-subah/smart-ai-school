# W10-D source closure: publication and application staging

Source contract only. Dispatch, package creation/grants, host preparation, rescale,
publication and deployment each remain subject to their existing Director gate.
This document does not replace the existing DIIS protocol.

## Backup artifact continuity

`backup-image.yml` runs only on explicit workflow dispatch from the exact develop
commit. Ordinary push/PR does not publish or build an image through this workflow.
The build operation has contents-read permission only. It builds linux/amd64 once,
labels the source revision, runs network-disabled executable smoke, generates Syft
SBOM and Grype evidence, saves the image and creates a hash ledger. Scanner archives
are pinned to their official checksums. A completed scan does not accept findings.

The separate publication operation downloads that same run's immutable Actions
artifact. It does not rebuild. Required prerequisites:

- A pre-existing **private** `diis-pg-backup` package linked to this repository.
  A missing or inaccessible package blocks publication; this workflow does not
  create an initial package or change visibility.
- `backup-image-publication` environment with required reviewer(s) and admin bypass
  disabled. Its metadata must be readable by the workflow; missing visibility into
  the gate is a blocker, not permission to omit the check.
- Job-scoped `packages: write` for the repository workflow identity. Host puller
  credentials are separate and read-only; nothing installs them here.
- Director-approved `W10D_BACKUP_PUBLICATION_APPROVAL_JSON`, with exact schema
  `diis-backup-publication-v1`, sourceSha, buildRunId, bindingSha256, notBefore,
  expires (maximum one hour), riskDecisionSha256, fixed package and visibility.
  The dispatch supplies the SHA-256 of the exact JSON bytes. The risk decision must
  cover the actual scan; a hash is a binding, not a substitute for review.

Image ID, OCI config digest, manifest/index digest, archive hash and SBOM hash are
different identities. Grype/Syft imageID must match the config bytes in the saved
archive. `binding.json` binds all files. The publication tag contains source SHA
and build run ID. Publication must resolve exactly one repository-qualified digest,
verify the registry manifest or linux/amd64 index child, then pull that digest and
compare its config and uncompressed layer bytes with the reviewed archive. The
non-secret `diis-backup-publication-receipt` records root, platform, config and layer
digests. Empty, wrong-repository, ambiguous, unreadable or mismatched results stop
with retry prohibited; inspect the registry read-only before any new dispatch.

The build workflow uploads evidence to GitHub Actions only after explicit dispatch
approval. Its source existing in Git is not approval for that upload. Full synthetic
recovery integration and residual adjudication remain requirements for final artifact
review; the workflow's smoke result does not claim those broader checks.

## Baked backup tools

The Dockerfile uses BuildKit checksum-qualified ADD for the existing pinned mc and
rclone archive. `build-backup-tools.py` accepts only one expected regular member,
DEFLATE compression and bounded size, then streams bounded chunks. It rejects
BZIP2/LZMA and other compression methods before opening the member. Build failure
does not yield a usable image. Runtime uses `install-baked-backup-tools.py` with no
network or archive extraction.

The installer validates all image-baked files before writing, locks the tool-volume
directory inode, and accepts only an empty directory or all three exact existing
files. It never overwrites mismatched/legacy files. Partial installation is retained,
status 74 prohibits retry, and requires operator inspection. A complete identical
volume is a no-op. Files remain at `/opt/backup-bin/{mc,rclone,rclone.zip}` so the
existing archive-to-executable evidence contract remains applicable. Candidate
creation must continue using its separate, attempt-owned tool volume. Never attach
the legacy tool volume to initialize or repair a candidate.

Moving tools into the image expands scanner coverage. It does not patch the Go
libraries embedded in those pinned binaries. Review all newly visible matches;
neither the historical 13-match decision nor absence of runtime wget accepts them.

## Standard application staging transaction

The existing recovery-only implementation remains byte-identical and is the default.
Selecting `W10D_STAGING_RELEASE_MODE=application` routes the in-memory transport to
the separate application executor plus the exact reviewed core. Unknown modes fail.
Use `W10D_STAGING_APPLICATION_APPROVAL_SHA256` to bind the private host approval file
`/home/appuser/.local/state/diis-deploy/staging-application-approval.json`.

The application packet is `diis-staging-application-approval-v1` with exactly:

- `baseline`: the existing complete `diis-staging-approval-v1` packet, including
  current apps/container/runtime hashes, environment hash, source/base/tree,
  existing backup image/revision, legacy/shared hashes, model and media evidence.
- `targetApps`: exactly api/web, each with repository-qualified immutable reference,
  local image ID and source revision equal to sourceSha.
- `baselineReceipt`: the validated `diis-staging-application-receipt-v1` for the
  currently running base SHA, canonical model hash, api/web Compose config hashes,
  and the exact image references used by that model. The first application release
  needs a separately reviewed bootstrap receipt; later approvals reuse the retained
  successful receipt. A receipt from a different base/model is rejected.
- `targetModelSha256`: canonical app-only model with only api/web image references
  replaced; configuration remains bound to the live baseline.
- `writerEvidenceSha256`: private `staging-writer-evidence.json` bytes. Its schema
  is `diis-writer-attestation-v2`, with sourceSha, expires, rootCronSha256,
  n8nSha256, preservationSha256, writerInventorySha256, the exact compatible
  backupLibrarySha256, allWritersUseCanonicalLock=true and
  allWritersRejectPersistentApplicationQuarantine=true. The executor independently
  hashes both the base checkout library and the live `/backup-lib.sh` mount and
  requires the reviewed compatible digest before it creates any writer lock.

No code in this packet or executor provisions missing prerequisites. Source objects
and target images must already be present; environment file must remain private and
unchanged. Relevant Prisma source/migration delta is rejected; migration inventory
must already agree. This standard release supports the approved dependency delta
without relaxing recovery-only checks. A future schema migration needs another lane.

Forward sequence: read-only preflight; acquire the existing canonical host deploy
file lock; start a detached lock guardian; build a complete private `0700` staged
directory beside `/var/lock/diis-backup/backup.lock`; write and verify its canonical
five-line shell `owner` plus private `application-owner.json`; then have the guardian
publish the whole directory with one no-replace `renameat2` operation. The canonical
path is therefore either absent or complete—never an ownerless or partial lock. An
existing writer wins the no-replace race and blocks application deployment. After
publication, recheck approval and preflight; consume approval; create private
ownership journal and snapshots; recheck; fast-forward exact source; compare the app
model; apply only api/web with no-deps/no-build/pull-never; wait for TLS health; and
verify image IDs, networks, Compose config hashes and legacy/shared invariants.

The owner namespace is an explicit application-quarantine sentinel derived from the
guardian's actual namespace, while the private marker retains both values and their
binding. The compatible writer library rejects that sentinel before boot/PID stale
recovery, so the quarantine remains non-reclaimable after guardian death or host
reboot. The exact older staging/main writer does not implement this rule and is
therefore an invalid application-deployment baseline: a separately reviewed host/
writer preparation gate must install and attest the compatible library before the
application executor may run. The v2 attestation plus direct checkout/runtime hashes
make that ordering executable rather than documentary. The guardian ignores handled
deployment signals, closes inherited executor descriptors, remembers publication as
an in-memory committed state, and treats parent EOF after commit as retention.
Deleting or corrupting the marker cannot downgrade that committed state.

Normal release requires proven producer absence plus the original directory, owner
and marker identities and exact bytes. Only the guardian may release a committed
lock: it atomically renames the still-complete canonical directory to its private
retired path and then removes that retired evidence. Forward success and verified
rollback release normally. Any producer ambiguity, retained owned producer, executor
crash, identity drift, retirement collision or failure before atomic retirement
retains the complete canonical quarantine and returns status 74. Failure after the
canonical path is retired cannot admit an application producer and may leave only
the private retired evidence for inspection. Ordinary writer stale recovery must not
remove either form. Reconciliation is a separate, explicitly authorized operation
that must first prove process and daemon operation absence, determine the
application/source/runtime disposition, and verify the exact quarantine identity; no
reconciliation command is authorized by this runbook.
Capacity must satisfy both 24 GiB and 25% on all required filesystems.

The target receipt is derived from the actual generated Compose model and committed
only after target verification and private snapshot cleanup. Its image references
preserve the exact model for a later B-to-C release even when tracked Compose still
contains build-time references. Rollback retains the prior receipt, so a fresh
preflight can validate the restored baseline without a configuration workaround.

On failure, producer absence must be proven before rollback. Ambiguity retains
snapshots and prohibits further mutation/retry. Verified rollback uses only the
private baseline app model, verifies configuration/images/health and source drift,
then resets the clean staging checkout with `git reset --keep` to the approved base.
Handled signals are latched and deferred only while bounded rollback is active;
repeated cancellation cannot stop its observations/apply/final verification, and
rollback or producer-cleanup ambiguity has priority over the cancellation result.
It does not restore any database, object, scheduler or shared ingress. Environment
drift blocks automatic rollback instead of overwriting another writer's configuration.
Failed attempts retain private snapshots/journal for review; successful attempts
remove secret snapshots and retain non-secret ownership/consumption records.

Operational approval must explicitly cover app container replacement and the
bounded checkout rollback. It must not be inferred from source review. Staging has
no assumed reviewer gate: do not promote its branch until prerequisites and approval
are complete. Production workflow body is unchanged.

## Verification and stop conditions

Run the source-closure contract, existing staging/lock/ingress and backup/operator
contracts. Run real local Linux synthetic image integration with the exact test
image ID. No fixture uses real credentials, published ports or host data mounts.
Temporary tool filesystem must permit executable files; a noexec fixture correctly
fails the installer and is not equivalent to the candidate's named tool volume.

Run `python3 infrastructure/deploy/verify-source-closure-handoff.py` after the
source contract. It reads the fixed Executor report and companion evidence JSON,
rejects duplicate JSON keys, discovers the direct `unittest.TestCase` test methods
in the bound source contract, requires report and evidence to match that discovered
total, and hashes every literal manifest entry including its own validator and
contract bytes. CI runs the same command. Any source-closure handoff drift is
therefore a failure, not a report-only warning.

Stop on source/tree drift, unknown metadata, missing privilege, missing image,
unaccepted vulnerability matches, insufficient capacity, writer/preservation gaps,
config drift, producer ambiguity, failed absence proof or expired approval. No gate
is waived to make deployment proceed.
