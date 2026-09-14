# W10-D capacity lifecycle: consolidated host decision draft

**DRAFT - NOT AUTHORIZED.** Source acceptance, packaging, host observation,
bootstrap, manual cleanup and native GC activation are separate decisions.

## Exact artifact and target

Use the final evidence/manifest accompanying
`WAVE10-D-CAPACITY-LIFECYCLE-CLEANUP-FIRST-IMPLEMENTATION-2026-09-09.md`.
That evidence binds every source file, candidate bundle manifest and archive digest.
Do not use a historical or regenerated artifact with different bytes. Candidate
status is `UNRELEASED`; its source base is
`39f1db9ba49d8c89ceb8c3e13c6850744b9294e1`, tree
`23970b65a8e4551c37b6478bdc5da5b52445e60f`, plus the dirty manifest.
An operational release needs reviewed packaging/CI and a newly approved release
manifest digest; no such authorization is granted by this draft.

Last observed production main is
`418846959b90b38e10141cb8df995872802219fe`, tree
`82b088f2344338d3ad1fb0bc3c2affa435d54923`. Runtime hostname, machine fingerprint,
daemon ID, socket identity, builder metadata, filesystem identity, fresh free bytes,
current cache IDs, protected sets and schedule window are **UNKNOWN / REFRESH
REQUIRED**. No old IP or hostname may be substituted. Use only a Director-confirmed
existing appuser operator route, never a deploy workflow to obtain access.

## Minimum decisions, presented once

| Gate                     | Minimum request                                                                                                                                          | Owner                       | Stop condition                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| Source review            | Independent review exact manifest and synthetic evidence, including command/daemon failure paths                                                         | Independent Reviewer        | Any verified source blocker                                                            |
| Packaging                | Literal reviewed files, CI exact commit, operator artifact release                                                                                       | Director/release operator   | Hash/tree/CI drift; no implicit deploy                                                 |
| Read-only host preflight | One bounded appuser session; Docker identity, filesystem stats, preservation and writer attestation                                                      | Director/platform operator  | Unavailable privilege or ambiguous observation                                         |
| Root scheduler evidence  | Hash/count/status of root and system cron/timers; no command bodies                                                                                      | Root administrator          | Incomplete inventory or writers without canonical lock/quarantine participation        |
| n8n evidence             | Metadata count/active state and canonical hash, no credentials/workflow payload                                                                          | Automation owner            | Unknown or active uncoordinated backup writer                                          |
| Lock prerequisites       | Exact bootstrap script/rule hashes, appuser parent ownership `0750`; verify existing canonical host flock and persistent backup quarantine participation | Director/root administrator | Existing content conflict, symlink, wrong owner or baseline library mismatch           |
| Manual cleanup           | One approved operation ID, source/bundle/target/policy/candidate hashes and time window; exactly one anchored-ID prune                                   | Director/recovery operator  | Invalid/stale inputs, protected drift, concurrent writer, active GC, receipt ambiguity |
| Native GC                | Separate exact original/candidate config hashes and bounded Docker restart/read-back window                                                              | Director/platform operator  | Conflicting config, invalid native validation, no rollback baseline, health impact     |

Do not request tokens, passwords, private keys, connection strings or rclone secrets.
Root access is not general: request only the reviewed bootstrap invocation, the
specific count/hash scheduler observer, or validation/install of the exact approved
daemon config. No Docker-root bypass. If appuser cannot read the required backup
content, request a narrowly reviewed read-only content-set helper; do not bypass
the preservation gate or pretend metadata-only proves bytes.

## Proposed policy, not approval

Compare 168h, 72h and 48h from one bounded stable inventory with a frozen cutoff.
Choose one explicit policy only after reviewing protected ancestry and physical
headroom. Historical logical 23,726,916,538 bytes is not guaranteed reclaim.
Proposed manual target: 24 GiB **and 30% free**, retaining the previous stricter
default; release minimum remains 24 GiB and 25%. Manual logical reservation is
8 GiB plus 2 GiB margin. Actual post-cleanup free space is authoritative. No
automatic widening, second prune, backup deletion or storage purchase.

Protect every current container/image/volume/network, active production/staging
image and at least one rollback image per component, retained cache parents, all
legacy/protected recovery points and all school data. A valid legacy preservation
state is permitted with zero W10-D completion manifests; it is not recovery PASS.

## Bounded host sequence and literal executable entry

1. Verify externally approved launcher and bundle hashes, owner/mode/path closure;
   private helper root is separate from runtime checkout and evidence directory.
2. Install only separately approved prerequisites; verify actual writers use the
   exact reviewed library, canonical host lock and persistent quarantine. Observe
   scheduler quiet window rather than hardcoding daily times.
3. Run `observe` via `diis-build-cache-cleanup.sh --bundle ... --sha256 ...` with
   private profile/policy and a new output file; no mutation. Bind its stable
   candidate hash, ten-minute observation expiry and current target identities.
4. Director approves the exact `diis-capacity-approval-v1` private file digest and
   the `diis-writer-attestation-v2` extension in `capacity_runtime.py`, including
   `allHostMutatorsHonorBackupQuarantine=true`. An attestation is not inferred from
   a running scheduler container or from an unused copy of backup-lib.
5. Run one `apply` with literal bundle, profile, policy, candidate, approval,
   external approval hash and writer-evidence paths, as shown in the runbook.
   It rechecks under both locks and creates an exclusive operation journal before
   dispatch. No test-root environment selector or dynamic executable is accepted.
6. Read receipt and immutable daemon proof; compare free bytes, no-touch hashes,
   backup content-set, runtime SHA/tree and application health before the next gate.
   This draft adds no application health mutation or service restart to cleanup.
7. If target met, separately decide native GC config merge/activation, restart
   impact and subsequent GC-cycle observation. If target not met, evaluate remaining
   safe candidates and growth before a new cleanup policy or storage expansion.

Exit 74 or missing final receipt means no retry: keep journal and quarantine; first
reconcile daemon completion and writer/host exclusion with accountable operators.
Never delete a lock merely because its PID is gone or the host rebooted. Cache
cannot be rolled back. Config-only rollback restores exact original bytes only if
current config still matches the installed candidate hash, followed by approved
restart/read-back. No hotpatch of production checkout or legacy container tools.

## Cleanup and remaining HOLD

After a proven normal operation, remove only the operation-owned uploaded helper
artifact if separately authorized; retain approval, receipt and replay journal
according to audit policy. Failed/ambiguous artifacts stay for reconciliation.
No cleanup of unrelated worktrees, reports, host cache directories or backups.

Registry publisher/puller authority, final-image build/scan/residual decisions,
application-standard staging deployment, off-site credential/custody, backup/restore,
scheduler handoff, commissioning and production piloting remain separate HOLDs.
This draft does not accept any of the historical 157 image scanner matches.
