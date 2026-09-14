# W10-D Integrated Blocker Closure - D0 Executor Report

Date: 2026-09-11

Status: **SOURCE COMPLETE - INDEPENDENT REVIEW REQUIRED - D1-D6 OPERATIONS HOLD**

This is an Executor readiness assessment, not an independent verdict, Director
approval, release artifact, or runtime commissioning claim.

Evidence: `W10-D-INTEGRATED-D0-EVIDENCE-2026-09-11.json`

Ledger: `W10-D-INTEGRATED-BLOCKER-CLOSURE-LEDGER-2026-09-11.md`

Runbook: `docs/runbooks/w10d-integrated-operations.md`

## Authorization and exact baseline

The Director authorized D0 source and feasibility closure only. No later stage
was executed.

| Binding | Value |
| --- | --- |
| Repository | `smk-darussalam-subah/smart-ai-school` |
| Baseline `develop` | `a8d72b8e2a6e78438e4cef46ad21913ff369d3f0` |
| Baseline tree | `75364250f2a5bbe875fc4bcf3da517c8f456adea` |
| Bound `staging` | `777314b12bcd168e2772603a31d657919aafa5bb` |
| Bound `main` | `418846959b90b38e10141cb8df995872802219fe` |
| Local branch | `fix/w10d-integrated-blocker-closure-20260911` |

The branch started from the exact baseline. Historical reports and evidence used
by predecessor validators remain byte-identical. The final successor validator
executes those historical validators from the approved baseline in an isolated
temporary tree; it does not reinterpret or overwrite historical evidence.

## Executive outcome

D0 closes the local source and feasibility gaps behind E01-E06 and prepares one
coherent operating sequence for B01-B14. The main changes are:

1. Support exact private publication for the backup, API and web images without
   inventing a package during first publication.
2. Bind build, scan, archive, registry round-trip, runtime image identity and
   public build configuration to the same bytes.
3. Preserve a clean old application checkout while installing new compatibility
   helpers in a private, content-addressed host location.
4. Capture the exact legacy `/backup.sh` through a bounded, read-only procedure
   before replacing its mount; no manual copy is accepted as authority.
5. Require one canonical lock and persistent quarantine around the frozen legacy
   producer, with failure and signal paths remaining retry-prohibited.
6. Bind the later staging application preflight to three exact read-only writer
   mounts and their runtime hashes.
7. Replace predecessor CI handoff calls with one strict successor that verifies
   the literal D0 scope while still running historical validators unchanged.
8. Pin every third-party action in the three affected workflows to an immutable
   commit and bind cross-run artifact download explicitly to this repository.

This does not mean recovery is commissioned. No registry image was published,
no provider credential was created, no backup was copied, and no host runtime was
modified.

## E01-E06 closure

### E01 - Capacity and preservation language

Capacity is derived from integer bytes. The fresh read-only observation was:

- total: `80,307,429,376` bytes;
- available to the operator: `14,459,756,544` bytes;
- free including reserved blocks: `17,782,370,304` bytes;
- operator-usable ratio: `18.005502923396%`, reported as `18.006%`.

The earlier `14,456,283,136` observation remains historical evidence rather than
being rewritten. Logical eligibility is not called guaranteed physical reclaim.
The 24 GiB/25% minimum and 30% recommendation remain unchanged. Legacy object
copy is labelled preservation only until independent encrypted copy-back and a
disposable restore succeed.

### E02 - Root cron and actual writer

A fresh root observation returned exit code `1` and the exact standard message
that no root crontab exists, so root crontab is recorded as `ABSENT`, not
`absent-or-unreadable`. This does not claim all schedulers are absent.

The live legacy backup container is the writer authority currently observed:

- entrypoint invokes its initialization and internal cron;
- cron invokes `sh /backup.sh` at `19:00 UTC`, equivalent to `02:00 WIB`;
- live script SHA-256 is
  `bc530d0a9110319684e7e4b60db56a3da1e1d979d9b1b6d8dc7887c209ff204e`;
- its bytes do not call the canonical backup lock;
- no exact `backup.sh` process was active at the bounded observation instant.

The source solution therefore wraps the unchanged legacy bytes. It does not
pretend that installing only `backup-lib.sh` fixes the active caller.

### E03 - GHCR first publication

Publication has two explicit modes:

- `existing`: exact package metadata must already be readable, private and bound
  to this repository;
- `first`: a 404 alone is insufficient. A short-lived, hash-bound attestation
  from the organization package administrator must state complete inventory and
  exact package absence. HTTP 401, 403, 429 and 5xx remain hard failures.

After either route, the workflow verifies actual private package linkage. The
workflow does not publish a placeholder image or grant repository-admin authority
to its token merely to make metadata checks pass. Cross-run artifact retrieval is
bound to the approved run and current repository, and every action used by the
three affected workflows is pinned to a full commit SHA.

### E04 - Clean-checkout writer compatibility

The old staging `backup-lib.sh` blob differs from the required canonical library.
It remains byte-identical. The solution uses two private content-addressed paths:

- a two-file artifact containing the reviewed canonical library and wrapper;
- a separate snapshot path containing the exact observed legacy script.

The new snapshot helper is fixed to `smk-pg-backup:/backup.sh`. It verifies live
hash and container identity before and after a 64 KiB, 30-second bounded capture,
checks shell syntax without execution, writes mode `0600` under owned mode `0700`
directories, rejects partial prior state, and makes exact replay a no-op. It does
not alter a mount, container or schedule.

The future runtime chain is exactly:

- content-addressed wrapper -> `/backup.sh` read-only;
- content-addressed canonical library -> `/backup-lib.sh` read-only;
- content-addressed frozen original -> `/legacy-backup.sh` read-only.

The wrapper acquires the canonical lock, publishes persistent quarantine before
the producer, suppresses raw producer output, bounds execution, and releases only
after exact success. Failure, signal or owner ambiguity keeps quarantine and
prohibits blind retry.

### E05 - Application image and staging identity

The reviewed publication path now supports exactly `backup`, `api` and `web`.
Backup builds only from exact `develop`; API/web build only from the actual exact
`staging` merge. API and web use fixed public build configurations. The web VAPID
value is public material but is still restricted to a valid uncompressed P-256
point; no arbitrary build argument is accepted.

The image archive config digest is the portable identity. A runner-local Docker
ID is retained separately as evidence because containerd may expose an OCI-index
ID. Scan/SBOM, smoke, saved archive, registry manifest, pulled image and receipt
must resolve to the same approved config/platform/root identity set. Staging
preflight also checks exact public configuration hashes from image labels.

### E06 - Main ordering, Drive authority and commissioning

The sequence remains fail-closed:

1. source review and Git delivery;
2. exact artifact build/security review and publication;
3. preservation and host/writer/capacity preparation;
4. staging deployment and review;
5. reviewed promotion to `main` if required by candidate/handoff source binding;
6. full off-site restore, scheduler handoff and n8n commissioning;
7. scheduled evidence.

The existing GCP Service Account remains the proposed Drive identity. No
domain-wide delegation or user impersonation is introduced. A future key is
limited to one active new key and only after custody is approved; secret values
must never enter Git, chat or reports.

## Verification performed

All commands below were run against the current D0 bytes. Expected negative-test
error lines in the backup suite were followed by PASS and are not runtime errors.

| Check | Result |
| --- | --- |
| Backup contract, WSL Ubuntu | `44/44 PASS` |
| Backup contract, Git Bash | `44/44 PASS` |
| Historical source-closure contract | `43/43 PASS` |
| Capacity lifecycle contract | `55/55 PASS` |
| Staging readiness contract | `49/49 PASS` |
| Integrated D0 contract | `21/21 PASS` |
| Real Docker/Linux proof | `9/9 PASS` |
| Docker owned residue | container/network/volume/temp `0/0/0/0` |
| Python syntax | 12 affected Python files compiled |
| Shell syntax | compatibility wrapper PASS |
| Workflow YAML | 3/3 parsed |
| UNRELEASED bundle | 18/18 files, verification PASS |
| Diff check | PASS |

The real Docker proof used cached immutable image ID
`sha256:91727198d4dba854dc43ea26c6fc41222a32b33ce4728bcef765864c16179104`
only as synthetic infrastructure. It proved bounded legacy capture, exact and
idempotent private snapshot installation, three read-only mounts, byte-tamper
rejection, portable/local image identity separation and zero owned residue. It
is not an accepted backup image or publication candidate.

Full API and web suites were not repeated because no application API, web,
database schema, dependency or business behavior changed. The applicable
infrastructure/source contracts and real Docker integration were run instead.

## Local feasibility bundle

A new WSL-local private bundle was built and independently re-read by the bundle
validator:

- status: `UNRELEASED`;
- file count: `18`;
- bundle SHA-256:
  `a3df041e9c3c5a7b671894d174133896fc1a51fc2863c661a3e3e6b64734d4ba`;
- storage: private local WSL state, outside the repository and both application
  checkouts.

It records the D0 baseline as its branch point but contains uncommitted reviewed
worktree bytes. Therefore it is deliberately not an exact Git-source release
candidate and cannot be relabelled or published. D1 must build a new bundle from
the exact reviewed Git head and tree.

## Literal handoff manifest

The successor source manifest contains exactly 18 changed paths:

1. `.github/workflows/backup-image.yml`
2. `.github/workflows/capacity-lifecycle.yml`
3. `.github/workflows/ci.yml`
4. `docs/audits/W10-D-INTEGRATED-BLOCKER-CLOSURE-LEDGER-2026-09-11.md`
5. `docs/runbooks/w10d-integrated-operations.md`
6. `infrastructure/deploy/backup-image-artifact.py`
7. `infrastructure/deploy/capacity_bundle.py`
8. `infrastructure/deploy/install-w10d-legacy-writer-snapshot.py`
9. `infrastructure/deploy/install-w10d-writer-compatibility.py`
10. `infrastructure/deploy/legacy-backup-compatibility.sh`
11. `infrastructure/deploy/staging-application-deploy.py`
12. `infrastructure/deploy/staging-image-config.py`
13. `infrastructure/deploy/verify-integrated-handoff.py`
14. `infrastructure/deploy/verify-publication-metadata.py`
15. `infrastructure/deploy/verify-published-backup-image.py`
16. `infrastructure/deploy/tests/integrated-closure-contract.py`
17. `infrastructure/deploy/tests/integrated-linux-proof.py`
18. `infrastructure/deploy/tests/source-closure-contract.py`

`scripts/bounded-command-capture.py` is an unchanged baseline dependency included
in the 18-file local capacity bundle; it is not falsely listed as a changed path.

The complete local review handoff is 20 paths: those 18 source/docs paths plus
this report and its evidence JSON. Neither report is staged.

## B01-B14 disposition

The detailed ledger is authoritative. At D0:

- B01 is `VERIFIED` for report/authority reconciliation only.
- B02, B05, B08, B09, B10 and B12 are `SOURCE_ONLY`.
- B03, B04, B06, B07, B11, B13 and B14 are `BLOCKED` on explicit future
  authority, runtime evidence, custody, elapsed time, or a combination.

`BLOCKED` does not discard those items. Each remains in this single batch with a
named dependency and minimum next action. No percentage is inferred from test
counts or document counts.

## Operator inputs and restore-target proposal

Confirmed:

- Google Workspace mailbox: `admin@smkdarussalamsubah.sch.id`;
- accountable owner: Director;
- proposed temporary notification: school email plus manual inspection;
- no disposable restore target has yet been approved.

One consolidated decision set remains for later stages:

1. Name the alternate operator, secure credential-transfer channel, and encrypted
   recovery-kit location outside both the VPS and ciphertext Drive.
2. Approve a WIB maintenance window only after D2 preservation and a fresh writer
   quiet-window packet exist.
3. Approve or reject the isolated restore target and cost ceiling.
4. Confirm mailbox access/SMTP metadata and name the operator/times for direct
   n8n and backup-evidence checks when email itself is unavailable.
5. Bind organization package administrator, publisher, puller and independent
   reviewers to their actual identities.

Recommended disposable restore target: a school-owned AWS Lightsail Jakarta VM,
separate from Hetzner and Google Drive, with an encrypted work disk. The minimum
provisional option is Linux 4 GiB/80 GB at USD 24/month if fresh D5 peak usage is
at most 60 GB; otherwise use 8 GiB/160 GB at USD 44/month. Lightsail is billed
hourly up to the monthly cap. The proposed Director ceiling is USD 5 and 48 hours,
excluding tax and transfer; the exact console quote and capacity calculation must
be accepted before purchase. Lightsail block storage is encrypted at rest, but
the drill still uses application-level crypt custody and plaintext cleanup.

Official current references used for the proposal:

- https://aws.amazon.com/lightsail/pricing/
- https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-block-storage.html
- https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-regions-and-availability-zones-in-amazon-lightsail.html

The local workstation has only about 9.66 GiB free and is not proposed as the
full D5 restore target. No cloud resource was created and no cost was incurred.

## Prepared D1-D6 packets

### D1 - Git, environments and credential metadata

Target after source approval: literal 20-path handoff, exact feature head/tree,
CI, PR to `develop`, and post-merge proof. Then separately bind build workflow
dispatches, private packages `diis-pg-backup`, `diis-api`, `diis-web`, publication
environments, publisher write identity, puller read identity, Shared Drive/folder,
existing Service Account principal/project, custody path and secret destination.

Stop on source/tree/manifest drift, unknown package state, wrong branch policy,
missing reviewer, admin bypass, excess key scope or secret exposure. No package,
environment or credential mutation is authorized by D0.

### D2 - Immutable artifact and preservation

Bind one build run and exact bytes per image; SBOM, scan, current vulnerability
database, smoke, archive and registry round-trip all use those bytes. Every
reachable HIGH/CRITICAL finding must be fixed or explicitly adjudicated by the
Director with a decision hash. First publication uses the independent absence
packet; ambiguous push prohibits automatic retry.

Preservation packet binds the exact seven-object inventory refreshed at execution,
source and destination identities, object hashes/bytes, isolated prefix, crypt
fingerprint, plaintext cap, copy-back proof and cleanup inventory. It never uses
`sync`, purge, retention deletion, or source overwrite.

### D3 - Writer compatibility and one capacity operation

Bind the RELEASED helper bundle, exact host/container/current daemon/native-GC
state, lock bootstrap, snapshot helper, wrapper artifact, original legacy bytes,
three mounts, all writer identities and a real quiet window. The snapshot and
artifact installers run as `appuser`; any bootstrap or container recreate uses
the separately authorized minimum privilege.

Only after preservation and quiet-window review: bind one fresh <=600-second
candidate, exact cache IDs, fixed cutoff, no-touch set, one irreversible cleanup,
physical before/after bytes and retained journal. One forward daemon restart and
one exact original-config rollback require a named WIB outage window. No global
prune, retry loop, reboot, backup deletion or automatic volume purchase.

### D4 - Exact staging

Bind actual staging merge SHA/tree, three published image digests/config hashes,
environment hash, `PG_BACKUP_IMAGE`, baseline receipt, writer evidence and model
approval. Staging API/web images must come from that exact merge. Deploy through
the reviewed environment gate; validate auth/OIDC, health, release mode,
quarantine, rollback and no-secret output. No production or scheduler activation
is implied.

### D5 - Independent restore, scheduler and n8n

Bind exact main source if candidate/handoff requires it, candidate volumes/config,
Drive crypt remote, approved independent restore target, component coverage,
plaintext limits and cleanup. Produce a real custom dump, checksum, object
manifest, completion record, encrypted copy, copy-back and disposable DB/object
restore. Reconcile migrations, safe counts and exact object hashes. Do not restore
to production.

Only after independent acceptance: perform one scheduler handoff, retaining the
legacy scheduler as identified inactive rollback. Backup schedule is 02:00 WIB;
n8n monitoring is 02:45 WIB. The reviewed n8n workflow starts inactive and gets
only dedicated telemetry-read and school SMTP credentials. One synthetic email
to the confirmed school mailbox requires D5 approval and mailbox receipt.

### D6 - Scheduled evidence and handover

Bind start date, owners and observation times. Require first run plus three
consecutive real daily scheduled backups and corresponding monitoring, not manual
replays. Record three capacity samples spanning seven days; report
`INSUFFICIENT_HISTORY` until the span is valid. Retention dry-run precedes any
delete approval. Final handover records custody, alternate operator, access review,
rotation/revocation, monthly restore and component recovery limits.

Appointment automation remains a separate go-live gate and is not silently
activated by this recovery batch.

## Stop conditions and no-touch proof

Stop at the first SHA/tree/hash drift, missing authority, ambiguous package or
writer state, expired packet, insufficient capacity, unpreserved source, unsafe
quiet window, secret exposure, unhealthy runtime, failed cleanup proof or attempt
to promote a later stage without its exact approval.

This D0 run performed no Git staging, commit, push, PR, protection relaxation,
workflow dispatch, image build/publish/pull, provider credential operation, remote
write, backup, restore, cleanup/GC, scheduler change, n8n change, email send,
container recreate, service restart, staging or production mutation.

## Independent Reviewer handoff

Review all 20 handoff paths in one pass against the exact baseline. Verify:

1. literal scope, hashes, rebindings and predecessor-evidence immutability;
2. first/existing publication authority and private linkage;
3. backup/API/web build/config/archive/scan/registry identity;
4. old-checkout preservation, bounded legacy capture, content-addressed install,
   three read-only mounts, canonical lock, quarantine and no-retry paths;
5. real Docker proof and zero owned residue;
6. B01-B14 statuses, non-claims, owner decisions and D1-D6 stop conditions;
7. absence of secrets, PII, hidden runtime mutation and unsupported PASS claims.

Run only the checks needed to establish independent confidence. Do not implement
fixes in the reviewer session. If no P0/P1/P2/P3 remains, the next verdict may be
`APPROVED FOR EXPLICIT GIT PACKAGING - D1-D6 OPERATIONS HOLD`.

## Rekomendasi model untuk tindak lanjut

Task berikutnya: Independent Reviewer memeriksa seluruh D0 source/feasibility
closure dan paket D1-D6 pada exact manifest 20 path; semua operasi tetap HOLD.

Model / effort: GPT-6 Astra (`gpt-6-astra`) / xhigh.

Alasan: review berikutnya menggabungkan supply chain, credential authority,
recovery, writer concurrency, irreversible capacity controls, dan release gates.

Syarat kualitas: validasi seluruh rebindings/negative controls dan pastikan tidak
ada source readiness yang keliru dinyatakan sebagai runtime acceptance.

Eskalasi bila: tidak diperlukan; ini sudah memakai rute tertinggi yang sesuai
untuk review recovery kritis tanpa meminta parallel-agent mode.

Sesi laporan ini: model/effort aktual tidak terverifikasi.
