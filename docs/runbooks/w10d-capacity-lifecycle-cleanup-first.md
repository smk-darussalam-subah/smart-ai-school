# W10-D capacity lifecycle: operator runbook

Status: **UNRELEASED — independent review required. No host action authorized.**

## 1. Scope and release boundary

This bundle handles manual BuildKit cache cleanup, offline GC configuration planning,
read-only capacity status, and offline off-site reference analysis. It does not deploy
applications, install credentials, bootstrap privileges, rotate backups, prune images,
touch school data, publish images, or commission recovery. Historical reports and the
old observation fixtures remain immutable. The previous cleanup implementation is
retained byte-for-byte only as a historical test fixture; it is not in the operator bundle.

Source base is `39f1db9ba49d8c89ceb8c3e13c6850744b9294e1`, tree
`23970b65a8e4551c37b6478bdc5da5b52445e60f`. A candidate bundle binds the dirty
source bytes through its literal manifest; its base SHA is not a claim that those
new bytes were committed. Packaging, CI and release require separate approval.

Production remains a separate target checkout: the last authorized observation was
main `418846959b90b38e10141cb8df995872802219fe`, tree
`82b088f2344338d3ad1fb0bc3c2affa435d54923`. Refresh these values at the host
gate; this source task does not connect to that host. Never copy the full application
delta to solve the helper delivery problem.

## 2. Build and verify the small bundle

Use the literal closure in `infrastructure/deploy/capacity_bundle.py`. It includes
the reviewed process runner and SC06/SC07 guardian unchanged, the current capacity
modules, the backup library, completion validator and bootstrap dependencies. It
contains no application dependencies, credentials, images or historical reports.

On an authorized Linux packaging workstation, outside the application checkout:

```bash
python3 -B infrastructure/deploy/capacity_bundle.py build \
  --source "$REVIEWED_SOURCE_ROOT" --output "$NEW_PRIVATE_BUNDLE_ROOT" \
  --source-sha "$REVIEWED_SOURCE_SHA" --source-tree "$REVIEWED_SOURCE_TREE"
python3 -I -B "$NEW_PRIVATE_BUNDLE_ROOT/infrastructure/deploy/capacity_bundle.py" verify \
  --root "$NEW_PRIVATE_BUNDLE_ROOT" --sha256 "$APPROVED_BUNDLE_MANIFEST_SHA256"
```

All bundle directories must be caller-owned `0700`, regular files caller-owned
`0600`, without symlinks/hardlinks or extra files. Verification snapshots exact
helper bytes before executing them. Independently verify the launcher hash before
invocation: a manifest cannot authenticate its own verifier. The bundle builder
currently emits `UNRELEASED` only; this is deliberately rejected for production.
After source review and separately authorized packaging/CI, a release custodian
must issue a new `RELEASED` manifest for the exact reviewed helper bytes and bind
its new digest in the host approval. Changing that metadata is an artifact-release
action, not a way to bypass the review gate.

Deliver only this verified artifact through an approved existing channel to a private
directory outside the runtime checkout, for example an operation-owned directory
below `/home/appuser/.local/share/diis-capacity`. Do not edit production source or
container mounts. Evidence belongs in a separate `0700` directory. Keep receipts
and operation-ID journals; they prevent replay. Never remove an unresolved journal.

## 3. Minimum host decision packet — all currently NOT AUTHORIZED

The Director must bind source/manifest/launcher hashes, target host/daemon/builder/
filesystem identity, target main SHA/tree, one policy/cutoff/candidate digest, one
operation ID, and an execution window. Policy choices 7 days, 72 hours, and 48 hours
must be compared from the same snapshot; no automatic age fallback is permitted.
An older fixed cutoff remains fixed during locked recheck. Invalid, null or future
last-use metadata never becomes eligible. Retained-record parents are protected.

One consolidated host packet must also settle:

- Appuser Docker/read-only filesystem access and exact checksum of the installed
  Buildx executable. Production guard remains Engine 29.5.2/Buildx 0.34.0/BuildKit
  0.30.0. The Director explicitly accepted Buildx 0.34.1 for the disposable lab;
  the version comparison changes only Bake and Kubernetes paths, not this driver.
- Canonical host lock `/home/appuser/.local/state/diis-deploy/deploy.lock`, owned by
  appuser and not writable by others, and the existing backup lock bootstrap under
  `/var/lock/diis-backup` (`/run/lock/diis-backup`). No broad sudo is needed or granted
  by this runbook. Bootstrap installation is a separately approved invocation of
  `install-w10d-backup-lock-bootstrap.sh` plus its exact rule hash; its isolated
  install/failure/rollback contracts are part of the recovery regression suite.
- Root cron, appuser/system schedules, n8n metadata, and every writer/host mutator:
  authority hashes, the actual participating backup-library bytes, a quiet window,
  and confirmation that host mutators honor persistent backup quarantine as well
  as the host flock. A host-flock-only writer is **not** an eligible participant.
  The guardian persists if the executor disappears; no arbitrary force unlock.
- Native GC must be disabled during manual cleanup. Its daemon reference safety
  does not provide DIIS scheduling/I/O exclusion. A conflicting active GC policy
  blocks manual apply until a separately approved config action is completed.
- Readable preservation root and a content-set digest for every existing point,
  including the eight historical legacy points. A legacy-only state with zero
  completion manifests can prove preservation, never recovery readiness. Unknown
  privilege, unreadable content, drift or unknown writers block before mutation.

The root/scheduler evidence is an explicit accountable-owner attestation; this
local tool does not invent or obtain it through Docker privilege escalation. No
cron bodies, environment values, object names, secrets or PII go into public reports.

## 4. Inspect, approve, apply once

Profile schema and literal fields are in `capacity_runtime.PROFILE_KEYS`; approval
schema is `APPROVAL_KEYS`. Create private JSON through the approved operator channel,
not by pasting credentials into chat. Bind the approval's full-file SHA-256 out of
band. Every file must be private and regular. Supply the policy JSON, target profile,
candidate JSON, writer attestation and approval; unknown fields are rejected.

```bash
bash "$BUNDLE_ROOT/infrastructure/deploy/diis-build-cache-cleanup.sh" \
  --bundle "$BUNDLE_ROOT" --sha256 "$APPROVED_BUNDLE_MANIFEST_SHA256" observe \
  --profile "$STATE_ROOT/profile.json" --policy "$STATE_ROOT/policy.json" \
  --output "$STATE_ROOT/candidate.json"
```

Inspection never authorizes cleanup. The effective target is computed once:
`max(25,769,803,776 bytes, ceil(total filesystem bytes × approved percent / 100))`.
Release minimum is 25%; the proposed/default cleanup policy preserves 30%.
These are not interchangeable silently. The observer reports logical eligible
bytes separately from physical free bytes; guaranteed physical reclaim is zero.
The 8 GiB logical reservation plus 2 GiB margin becomes a 10 GiB manual prune
reservation. BuildKit operates in indivisible records; none of these thresholds is
a hard disk quota or proof that an exact quantity will be reclaimed.

After explicit host approval only:

```bash
bash "$BUNDLE_ROOT/infrastructure/deploy/diis-build-cache-cleanup.sh" \
  --bundle "$BUNDLE_ROOT" --sha256 "$APPROVED_BUNDLE_MANIFEST_SHA256" apply \
  --profile "$STATE_ROOT/profile.json" --policy "$STATE_ROOT/policy.json" \
  --candidate "$STATE_ROOT/candidate.json" --approval "$STATE_ROOT/approval.json" \
  --approval-sha256 "$DIRECTOR_APPROVED_FULL_FILE_SHA256" \
  --writer-evidence "$STATE_ROOT/writer.json" --output "$STATE_ROOT/result.json"
```

The transaction validates approval, acquires the canonical host flock and unchanged
guardian, reserves the operation ID exclusively, re-observes the stable candidate,
then issues exactly one anchored ID-filtered prune. No `--all`, image/system/volume
prune, automatic widening or retry exists. The initial low-free condition is not a
reason to block useful cleanup. Output path must be a new direct child of private
state; target checkout remains read-only.

## 5. Receipts and incident handling

| Outcome                            | Exit | Meaning and next action                                                                            |
| ---------------------------------- | ---- | -------------------------------------------------------------------------------------------------- |
| `NOOP_TARGET_MET`                  | 0    | No prune; target already met under lock.                                                           |
| `BLOCKED_BEFORE_MUTATION`          | 65   | No prune; fix evidence with a new approval/operation ID.                                           |
| `CLEANUP_COMPLETED_TARGET_MET`     | 0    | Daemon terminal receipt, postchecks and measured physical target pass. Still not staging approval. |
| `CLEANUP_COMPLETED_TARGET_NOT_MET` | 73   | Cleanup completed safely but capacity is still insufficient. No automatic second prune.            |
| `PARTIAL_OR_AMBIGUOUS_NO_RETRY`    | 74   | Preserve journals/quarantine and obtain operator reconciliation. No automatic retry or unlock.     |

Client termination alone does not prove daemon completion. The reviewed runner
requires EOF, successful exit and process-group absence. A terminal `Total:` record
is emitted by the pinned Buildx only after the daemon stream succeeds; returned IDs
must match the before/after cache deletion set and remain within the approved IDs.
No-touch hashes cover all containers/images/volumes/networks, plus backup content.
Any unproven producer, missing terminal receipt, postcheck failure or failed release
retains the persistent backup quarantine. The host flock may end with the executor;
therefore **all host mutators must also reject quarantine**, as the attestation requires.

Cache deletion has no rollback. Do not reconstruct backups or edit runtime markers
to make a cleanup receipt pass. If below target, use actual remaining eligible
records and measured growth to choose a new reviewed cleanup policy or a bounded
storage expansion/resource split. Never delete backups to meet the floor.

## 6. Native GC candidate and configuration rollback

`capacity-gc.candidate.json` is opt-in, not an installed daemon configuration.
Proposed private-cache policy: age 168h, reservation 8 GiB, maximum-used trigger
12 GiB, minimum-free trigger 24 GiB, no `all`. Final budget remains subject to
representative production workload inventory; the small lab is not production sizing.
`capacity_gc.py` merges `builder.gc` structurally, preserves unrelated keys, and
rejects conflicting existing GC policy. Docker-driver configuration belongs in
`daemon.json`, not `buildkitd.toml`.

At a separately approved maintenance gate: capture exact original bytes/hash/mode/
owner, generate merged candidate, run `dockerd --validate --config-file` on that file,
approve both hashes and a restart window, install atomically, restart the target
daemon once, then read back actual policy and identities. This task does not execute
that host action. `capacity_gc.restore` refuses drift and restores exact original
bytes; rollback needs the same bounded install/restart/read-back approval. There is
no claim of live reload support for this change. A file that validates is not proof
that GC is active; observe subsequent real build/GC cycles and physical free bytes.

## 7. Lifecycle inventory and next gates

| Class                    | Location/filesystem            | Owner; growth                                   | Policy/protection                                                                                             | Source/runtime status; next gate                                                                  |
| ------------------------ | ------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Build cache              | Docker data filesystem         | Platform operator; no-cache app builds          | This manual transaction and opt-in GC; active/shared/retained parents excluded                                | Source candidate only; host activation/read-back separate                                         |
| Application images       | Docker data filesystem         | Release operator; each release                  | Active production/staging and at least one known-good rollback image per component                            | All image identities no-touch; image cleanup is a separate approval                               |
| Container logs           | Docker data filesystem         | Platform operator; request/error volume         | Inventory log drivers and bound size/rotation before changing                                                 | Live config UNKNOWN; this task adds no logging mutation                                           |
| Prometheus               | Metrics volume                 | Platform operator; sample/cardinality growth    | Source already has 30-day retention; assess size cap from inventory                                           | Runtime UNKNOWN; no service/config activation                                                     |
| n8n history              | n8n database/volume            | Automation owner; execution history             | Review successful/failed history retention; preserve school audit records                                     | Runtime UNKNOWN; metadata/schedule authority still required                                       |
| Local backup             | Existing backup mount          | Recovery owner; DB+object growth                | 3 daily + protected pre-change; absolute budget 4,015,794,422 bytes; legacy preserved until valid replacement | Offline preservation is not a backup/restore test; temporary amplification needs host measurement |
| Off-site manifests/blobs | Approved crypt destination     | Recovery custodian; points/shared objects       | 14 daily/8 weekly/12 monthly + protected; reference-aware dry-run planner                                     | No remote calls/deletions; reference-GC apply is a separate future gate                           |
| Database/uploads/audit   | Persistent school-data volumes | Data/privacy owners; usage and retained records | No deletion by capacity tools; consent and audit controls unchanged                                           | At least 3 samples spanning 7 days before growth projection; otherwise `INSUFFICIENT_HISTORY`     |

`offsite_reference_plan.py --input ABSOLUTE_LOCAL_JSON` validates real completion
schema, checksum sidecar and `diis-object-manifest-v1` header/rows, hashes and object
counts. All provided points remain referenced, including protected/retained points;
in-progress, protected and grace-period blobs remain unknown/protected. Missing
references, incomplete inventory and out-of-prefix records reject the plan. Results
contain only counts/bytes/set hashes and are never deletion approval. Raw scanner
matches, registry publisher/puller readiness and final image publication remain
separate gates; they are not rerun or accepted by this cache task.

Use `status` mode for existing operator/monitor read-only telemetry. No service,
dashboard, cron, timer or workflow is installed. Collect repeated filesystem and
component totals; `capacity_policy.growth_projection` reports insufficient history
instead of fabricating zero growth. Application builds moving to CI and off-site
blob GC are separately scoped projects triggered by recurring pressure after the
bounded cache policy is measured, not reasons to broaden this prune.
