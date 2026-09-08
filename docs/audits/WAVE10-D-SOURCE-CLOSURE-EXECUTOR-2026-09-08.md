# W10-D source closure, read-only evidence, and capacity proposal

Source verdict: **READY FOR INDEPENDENT SOURCE RE-REVIEW**.
Delivery status: **SOURCE COMPLETE - STAGING HOLD**.
Operational verdict: **BLOCKED - STAGING PREREQUISITES INCOMPLETE - ALL OPERATIONAL MUTATIONS HOLD**.

This is an Executor handoff, not an independent approval. It does not authorize
packaging, publication, host preparation, rescale, staging or commissioning.

Follow-up closure on 2026-09-08 is bound to Independent Review SHA-256
`5a689fd92774694d25a85855711cd29a00d5b36cfc76bbc4ff3b63bd19a28965`.
SC01-SC03 were reproduced before change and are closed in source by one consolidated
patch. Completion sweep then reproduced and closed P1-SC04 in the same source
handoff. A subsequent independent review, SHA-256
`e0050dade0f5556845490f62aad920fd83e1b413b3baee4a7c8dc72851f64cc0`,
reproduced P1-SC05: an ambiguous live deployment child survived while the writer lock
was released. SC05 is now closed by a crash-durable, backward-compatible application
quarantine in the canonical lock directory. A third independent review, SHA-256
`db018e4b3ef9e0bc76491be389874c1b777f6fa932d486bd45f59bf19de82403`,
then reproduced P1-SC06: SIGKILL during owner publication exposed a partial canonical
directory that the frozen writer could reclaim. SC06 is closed by complete staged
publication, a non-reclaimable application namespace, and guardian-owned atomic
retirement. The SC06 re-review, SHA-256
`1d0bf5013c4d41a71efde0cd35256fd864853525ccd162c4cbed9afb83e593fb`,
verified those same-boot fixes and reproduced P1-SC07: both writer generations could
still reclaim the quarantine after reboot. It also found P2-SC08, a stale test total
in the evidence JSON. SC07 is closed by a boot-independent sentinel check in the
writer plus an exact v2 active-writer attestation that blocks application deployment
until the compatible library is installed. SC08 is reconciled below. The final
independent review, SHA-256
`303a78a9d8c13264c37eeda68d81201c0fe3e53cbab0dddb6e9e3dab87a0295b`,
confirmed SC07 and SC08, then found P2-SC09: the report/evidence count agreement
was not automatically enforced. SC09 is now closed by a fail-closed validator bound
to the literal source manifest and run by CI. The next independent review, SHA-256
`7e0e076dac9b147dd99694a09abc4d39ff4e82f222e944ac253a5d032d63c5c0`,
reproduced P2-SC10: report and evidence could share the same stale count. SC10 is
closed by discovering the direct `unittest.TestCase` methods in the bound contract
source and requiring both handoff values to equal that discovered count. All six
reviewer reports remain separate, unmodified local evidence files. Final affected
verification and manifest reconciliation timestamp is recorded in the companion
evidence JSON.

## Authority and exact baseline

Director attachment: `837de00d-192b-4a3b-b887-b745a1527881/pasted-text.txt`.
The accepted independent report's actual SHA-256 is
`3c572145f9fbcde3e09d5a3b380ee80a174e14642c061c9c1c7084215d002c1f`.
The attachment has the correct 64-character hash; the chat summary omitted its final
`f`. The file was hashed and matched the attachment before implementation.

- Base/HEAD: `c9dba5e1f79994071bbc28422a7f628971f02772`.
- Base tree: `a9fa9592cdb0cf4aa040ac4278bd4ab641e00962`.
- Branch: `fix/w10d-source-closure-20260908`.
- Worktree: `C:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school-w10d-source-closure-20260908`.
- Remote develop was checked before work and again after SC07 closure at
  `2026-09-08T10:59:33Z`;
  it remained the approved SHA. This report binds the dirty source manifest, not
  HEAD alone. There is no new commit or resulting committed tree.
- Historical worktree, reviewer reports and existing untracked artifacts were not
  copied into this worktree or edited. The rejected draft protocol was not used.

## Consolidated findings and boundaries

No P0 was verified. The following operational blockers are all retained together.
Source closure does not imply that any of them has been accepted.

| Review finding                                                          | Source disposition                                                                                                                                                                      | Executable proof                                                                                                                                                                      |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-SC01 repeated cancellation can interrupt rollback and hide ambiguity | Closed: application handlers latch cancellation; the canonical runner defers it only during bounded rollback; cleanup/rollback ambiguity wins before cancellation is reported           | Real child-process runner receives repeated HUP, INT and TERM at rollback observation, apply and final verification; simultaneous producer cleanup failure remains typed ambiguity    |
| P2-SC02 the next release rejects the prior successful model hash        | Closed: approval binds a prior receipt containing base SHA, canonical model hash, exact image references and per-service Compose hashes; success commits the next receipt after cleanup | Docker Compose hashes three real generated models; A-to-B, fresh B-to-C, and retained B after failed C are checked without using tracked image references as the live baseline        |
| P2-SC03 publication can pass with no digest or wrong registry artifact  | Closed: one intended repository digest is mandatory; root/index and linux/amd64 manifests are read by digest; config/layers and pulled archive bytes must match; receipt upload is last | Empty, wrong-repository, duplicate, malformed/mismatched manifest, index ambiguity and pulled-image drift fail; valid single-manifest and index-child paths produce the bound receipt |
| P1-SC04 application executor cannot acquire the canonical writer lock   | Closed: it atomically creates the canonical lock directory with an application marker; existing lock is active/ambiguous, never reclaimed; release drift is typed ambiguity             | Bidirectional real shell/Python contention proves mutual exclusion; unsafe parent and marker drift fail closed; exact release proves directory absence                                |
| P1-SC05 ambiguous child survives after application executor exits       | Closed: acquisition starts a detached live guardian and publishes its baseline-compatible owner plus a private marker; ambiguity retains all three across executor/child exit           | Actual `main()` returns 74 with a live child; same-boot current and frozen baseline contenders are denied before fast-forward and after child/executor exit; normal paths release     |
| P1-SC06 SIGKILL can expose ownerless canonical lock during publication  | Closed: the guardian publishes one fully populated private directory by atomic no-replace rename; owner namespace is a permanent application quarantine; release atomically retires it  | Seven publication boundaries, marker loss, reaped guardian, retirement collision, current writer and frozen baseline writer are exercised; no partial canonical state is admitted     |
| P1-SC07 prior-boot quarantine is treated as an ordinary stale lock      | Closed: compatible writers reject the application namespace before boot/PID recovery; v2 attestation and direct checkout/runtime hashes reject old writer bytes before lock creation    | Prior-boot complete quarantine with and without its JSON marker rejects current and frozen-compatible writers without byte drift; exact old library digest fails attestation          |
| P2-SC08 evidence JSON retained the old source-test total                | Closed: JSON and report carry the final 43/43 source-contract count                                                                                                                     | The report/evidence/manifest validator reads the corrected ledger before CI can pass                                                                                                  |
| P2-SC09 report/evidence agreement had no executable enforcement         | Closed: one bounded validator reads the fixed report and JSON, rejects duplicate JSON keys, and hashes every literal source entry including its own bytes                               | Positive synthetic handoff passes; an evidence count mismatch raises a typed failure; CI runs the same validator on the reviewed handoff                                              |
| P2-SC10 report and evidence could retain the same stale count           | Closed: validator statically discovers direct `unittest.TestCase` methods from the bound source-contract bytes and requires both handoff totals to equal the discovered total           | Both one-sided mismatch and paired 42/42 stale fixtures fail closed; dynamic `load_tests` and duplicate method names are prohibited                                                   |

| Priority | Finding                                                                                                              | Disposition / owner                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Baked tools expand actual image scan coverage: 157 matches / 112 unique IDs, including 13 Critical and 64 High       | Security reviewer/Director: adjudicate all tool matches or approve a separately scoped version remediation. No suppression, VEX or risk acceptance performed.                            |
| P1       | VPS capacity remains below both thresholds; canonical writer lock absent                                             | Director/VPS owner: capacity execution and writer preparation remain separate approvals. No prune justified by old zero-record action eligibility.                                       |
| P1       | GHCR private package/linkage, publisher capability and host puller remain unproven                                   | Organization admin: metadata and setup evidence required. Source workflow does not create package or grant access.                                                                       |
| P1       | Root cron, n8n workflow authority and MinIO preservation evidence incomplete                                         | VPS/recovery/n8n owners: provide minimal read-only summaries. Container presence is not scheduler or recovery proof.                                                                     |
| P1       | No approved final artifact or standard staging runtime baseline packet                                               | Release owner: final artifact build/review and current private approval packet must precede staging. Local test image is not a release candidate.                                        |
| P2       | Current Grype public DB update failed over network                                                                   | Scan used an existing valid DB built `2026-09-07T06:38:20Z`; final release scan must use appropriately fresh evidence.                                                                   |
| P2       | Full publisher dispatch, upload, private registry round-trip and live application staging transaction are unexecuted | Deliberately gated. Synthetic source contracts and image integration are evidence of local behavior, not proof of provider permission or a live release.                                 |
| P2       | Rescale price needs final billing reconciliation and a recovery plan backed by usable application-consistent data    | Current overview showed an older $9.49/month value while rescale lists current plan offers at different prices. Do not infer a billing delta or accept a purchase from this discrepancy. |

No P3 source finding remains from whitespace/conflict checks. Compiler/test environment
failures encountered during verification are recorded below rather than labelled PASS.

## Source closure by lane

### Publisher / artifact lane

New `backup-image.yml` supports explicit build and publish operations only. It has
no push/PR trigger. Both require develop and source input equal to workflow SHA.
Build has contents-read permission; only the publication job requests packages-write.
Actions and scanner downloads are pinned to commits/checksums verified from their
official GitHub repositories in this session.

Build saves one image, executable smoke, SBOM, raw Grype output, DB metadata,
scanner/DB hashes and a binding ledger. Publication downloads the same build run's
artifact and verifies source/run, file hashes, config digest, scanner/SBOM identities,
approval expiry, a risk-decision hash and existing private package linkage. It checks
the publication environment has reviewers and disables admin bypass. Missing API
capability fails closed. No initial package creation or visibility change exists.

Publication performs a load/save identity check over config and actual layer bytes,
so Docker index IDs are not confused with config digests. After push it now requires
exactly one intended repository digest, reads the root and linux/amd64 registry
manifest by digest, verifies config and layer descriptors, removes local tags, pulls
the digest, and compares the pulled config and uncompressed layer bytes with the
reviewed archive. Only then is a non-secret publication receipt uploaded. Empty,
wrong-repository, ambiguous, unreadable and mismatched observations fail with retry
prohibited. There is no rebuild in the publication job. Artifact upload, push and
workflow dispatch were not performed; registry capability remains separately gated.

### Application staging lane

The shared `staging-readiness-deploy.py` changes only to give its bounded command
runner an explicit application-rollback cancellation deferral hook. Recovery-only
behavior and its gate remain intact. A separate application executor is bundled with
the exact core and sent in memory through the existing SSH transport. `recovery-only`
remains default; `application` is explicit; unknown modes fail. Production remote
script content is unchanged.

The application transaction binds source/base/tree, baseline environment and runtime,
target api/web digest references and revisions, old/new app model hashes, the prior
validated application receipt with model image references and config hashes, media,
legacy/shared invariants, migrations already applied, and writer/preservation evidence.
It requires both capacity thresholds and the existing canonical host/writer locks;
it never installs missing locks or credentials. All forward commands use the existing
bounded process runner with cancellation preservation.

The writer lock is not an advisory regular file. The executor validates the
pre-bootstrapped `0750` appuser-owned canonical parent and starts a detached lock
guardian. It then creates a private `0700` sibling directory, writes and verifies the
five-line shell owner and JSON marker there, and asks the guardian to atomically
publish the complete directory with no-replace `renameat2`. The canonical path is
therefore absent or complete; an existing writer wins the no-replace race and is
reported as active/ambiguous. The owner uses an application-quarantine namespace
sentinel derived from the actual guardian namespace. Both exact staging/main baseline
stale recovery and current `backup-lib.sh` refuse to reclaim it after same-boot
guardian death or reap. The marker binds both namespaces, source,
approval/run identity, executor and guardian boot/PID/start, token and directory
identity. The guardian ignores handled deployment signals, closes inherited executor
descriptors, remembers a committed publish independently of marker bytes, and treats
parent EOF after commit as retention. The application does not reclaim any existing
directory.

Persistent safety is also enforced at the writer entrypoint. The compatible
`backup-lib.sh` rejects the `diis-application-quarantine:*` namespace before applying
ordinary boot/PID stale recovery. Application preflight requires the exact reviewed
library hash in the clean base checkout, the live `smk-pg-backup` mount and a strict
`diis-writer-attestation-v2`; the attestation additionally binds the complete active
writer inventory and confirms that every writer rejects persistent application
quarantine. The former staging/main library digest is rejected before lock creation.
Consequently, Git/release planning must deliver and attest the byte-identical writer
compatibility change as an earlier staging prerequisite, then perform the standard
application release. Combining both into one first-time staging transaction is not
permitted and recovery-only guards are not weakened.

Release is accepted only when no producer ambiguity escaped, the owned-producer
registry is empty, and the directory, owner and marker identities and exact bytes
still match. Forward success and verified rollback ask the guardian to atomically
rename the complete canonical directory to a private retired path and clean it there.
The parent never creates an ownerless release window. Ambiguity, a retained child,
SIGKILL, failed observation, retirement collision or pre-retirement failure retains
the complete canonical quarantine, returns status 74 and keeps every shell writer out
even after executor or guardian death. Marker deletion after commit cannot make the
guardian exit on parent EOF because commit state is held in memory. Reconciliation
requires a separately authorized process/daemon absence and runtime-disposition
procedure; normal stale recovery is not allowed to remove this quarantine. Deferred
cancellation is reported only after normal release is proven.

The first SC05 candidate used only an application marker and no shell owner. The
mandatory post-patch bypass review reproduced that exact staging/main baseline
`backup-lib.sh` can stale-reclaim such a directory after its one-second owner wait.
That candidate was discarded before handoff. The final contract preserves the exact
old stale-recovery decision as a same-boot compatibility test and proves it rejects
before fast-forward, after ambiguous executor exit, after the child exits, after
executor SIGKILL, and after a directly reaped guardian. Prior-boot coverage uses the
current library and a frozen byte-identical compatible copy; the old digest is instead
proven ineligible by preflight. Owner and marker bytes remain unchanged across each
rejected contention attempt. Seven crash barriers cover guardian creation through
atomic canonical publication. Marker disappearance and atomic-retirement collision
retain exclusion. The guardian also closes inherited output and lock descriptors,
proven by EOF after the executor is killed.

Only application image references change. No provisioning, migration, backup,
scheduler, shared ingress or production container mutation is in the new executor.
On failure it requires producer absence before bounded rollback to baseline app images
and unchanged config, then restores the clean checkout with `git reset --keep` to
the exact base. HUP/INT/TERM are latched while bounded rollback owns the runner, so
repeated signals cannot interrupt observations, apply or final verification; producer
or rollback ambiguity retains priority. A successful target receipt is committed only
after private cleanup. Its exact image references make the next B-to-C preflight use
the same model B rather than the tracked build reference. Rollback retains the prior
receipt. Ambiguity retains private recovery snapshots and prohibits retry. Schema/
Prisma deltas remain rejected; recovery-only exceptions were not widened.

### Tool preparation / two CVE paths

mc and rclone bytes are fetched through checksum-bound BuildKit ADD at image build.
The rclone extractor verifies the archive hash, exact unique regular member,
compression method and compressed/uncompressed bounds. Only DEFLATE is accepted;
BZIP2/LZMA paths associated with `CVE-2026-15310` are rejected before extraction.
Output is streamed and exclusive. The runtime no longer downloads tools with wget
or extracts the archive. This removes the reviewed bootstrap path through
`CVE-2025-60876`; it does not remove BusyBox from the image or claim package-level
scanner findings are fixed.

The runtime installer checks all baked files before writes, locks the target
directory inode and permits only empty or completely byte-identical contents. It
does not overwrite legacy/mismatched tools. A partial copy fails with retained state;
repeat invocation does not silently repair it. It keeps the expected three paths,
including the archive, for existing candidate evidence and handoff compatibility.
Compose startup now uses fail-fast shell behavior and invokes the installer.

## Actual local verification

| Verification                     | Result and coverage                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source closure contract          | 43/43 on WSL/Linux; adds both one-sided and paired stale 42/42 report/evidence regressions to the prior-boot current/frozen-compatible exclusion, exact old-library attestation rejection and unchanged-byte proof, seven SIGKILL boundaries, post-publish validation, marker loss, guardian death, retirement failure, normal release, and earlier signal/receipt/registry coverage |
| Source-closure handoff validator | PASS on WSL/Linux; fixed report and JSON match 43 direct discovered tests, strict JSON parsing, 20/20 source-manifest hashes, and self-binding validator/contract bytes; stale values exit fail-closed                                                                                                                                                                               |
| Existing staging contract        | 49/49 on WSL/Linux; original cancellation and producer cleanup semantics preserved                                                                                                                                                                                                                                                                                                   |
| Recovery operator contract       | 36/36 on WSL/Linux                                                                                                                                                                                                                                                                                                                                                                   |
| Backup/restore contract          | 44/44 on WSL/Linux, including direct prior-boot quarantine rejection and updated build-time checksum location                                                                                                                                                                                                                                                                        |
| Gate 1 source contract           | 19/19 on WSL/Linux                                                                                                                                                                                                                                                                                                                                                                   |
| Host deployment lock             | 2/2 on WSL/Linux                                                                                                                                                                                                                                                                                                                                                                     |
| Shared ingress contract          | 21/21 on WSL/Linux                                                                                                                                                                                                                                                                                                                                                                   |
| Focused Jest deployment contract | 1 suite / 6 tests PASS, `--runInBand --detectOpenHandles`; Windows branch skips Linux-specific execution, which was run separately above                                                                                                                                                                                                                                             |
| Real image integration           | PASS on WSL/Linux against local Docker Desktop: helper 5/5, tool install and second no-op, versions, actual baked mc object transport, 2-row PostgreSQL dump/restore, object hash/corruption negative, database/dump/container/network cleanup                                                                                                                                       |
| Compose                          | Base + staging config parse succeeds locally with synthetic image binding. Missing-secret warnings are expected from an uncredentialed config-only render; no runtime readiness claim.                                                                                                                                                                                               |
| Syntax / hygiene                 | Python AST, touched shell syntax, workflow/runbook Prettier, whitespace, conflict and scoped secret checks; literal inventory verified before handoff                                                                                                                                                                                                                                |
| CI remote                        | Not run; commit/push/PR/dispatch are outside this authorization. New contract is wired into CI source.                                                                                                                                                                                                                                                                               |

Initial local npm dependency reuse failed TypeScript resolution because this new
worktree lacked its own node_modules. `npm ci --ignore-scripts --no-audit --no-fund`
installed 1,294 locked packages without source/lockfile changes; focused Jest then
passed. No application/auth/schema code changed, so unrelated full app tests/build
were not repeated. No blanket full-workspace type-check/lint claim is made.

The final optional Node YAML parse probe could not load an uninstalled `yaml` module;
it made no file change. Prettier validation passed and the available WSL PyYAML parser
then parsed all three affected/current workflows (3/3). Python source was compiled
in memory (12/12), avoiding generated cache files. A mistakenly broad root Jest
invocation did not load the API TypeScript transform and is not counted; the correct
API-workspace invocation passed the 6/6 focused contract above.

The first image build failed on an official download TLS timeout. The same pinned
recipe succeeded on the second attempt. A Windows invocation of the Linux image
harness failed at SIGHUP import before any resource creation. The first Linux run
correctly rejected executable tools on a noexec tmpfs; the fixture was corrected to
explicit exec, then the canonical run passed. This did not weaken installer checks.

## Image and scan evidence

Test image tag: `diis-w10d-source-test:20260908`.
Task label: `com.diis.task=w10d-source-closure-20260908`.
Its revision label is the approved base and `com.diis.dirty-source=true` explicitly
marks uncommitted recipe inputs. Do not use it as a final release image.

| Identity                              | Value                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Docker image/index ID                 | `sha256:91727198d4dba854dc43ea26c6fc41222a32b33ce4728bcef765864c16179104` |
| OCI image manifest from build         | `sha256:ae865b345b4a60b58b3406ed4280c28bf933971e8967eade2a5547a5dac05d0e` |
| OCI config digest, also Grype imageID | `sha256:690d0524fed7e08bc7ed1e87f8786214b0474900e41040bc79d3ce12cc548951` |
| Grype converted manifestDigest        | `sha256:b1d8f1c726765c8d28ecc9fcfcd71f459d3c74331a25f465509cd346e8c781db` |
| Platform / Docker size                | linux/amd64 / 207,196,020 bytes                                           |
| Untagged Docker archive SHA-256       | `feb0a29030d247db65d01a17eb6d8f2cef2438063188c15546e3ac3b7af32e3f`        |
| Grype raw JSON SHA-256                | `e14a334a5c58dd4acbdcfad90a72be6f43e1ecb0b14f0b44e440f05e852ebfce`        |
| Scout SPDX SBOM SHA-256               | `0137b858601d333db54ef4870bad3e0a52c100310c8fffa08f84ac84279b0200`        |
| Grype executable SHA-256              | `565446b4bc9fd7cc4a72d1066468650eab6941b19ba804ca4649e504c2c2a024`        |
| Existing Grype DB SHA-256             | `b1cc176fba1944294f1c609d9fc878215587b2dca38c372843bc079dd9dbdc89`        |

Raw artifacts are local under
`C:/Users/USER/.codex/tools/diis/w10d-source-closure-20260908/`:
`image.tar`, `tagged-image.tar`, `grype.json`, `sbom.spdx.json`.
They were not uploaded or included in the Git manifest. The archive config was
parsed and its SHA/platform/revision verified against the scan and source binding.
Scout indexed 355 packages. Grype 0.118.0 used DB v6.1.9 built at
`2026-09-07T06:38:20Z`; local cached scan exited 0. Its earlier auto-update attempt
exited 1 on network interruption and produced no valid scan.

| Severity   | Match count |
| ---------- | ----------: |
| Critical   |          13 |
| High       |          64 |
| Medium     |          69 |
| Low        |           9 |
| Negligible |           1 |
| Unknown    |           1 |
| Total      |         157 |

There are 112 unique vulnerability IDs. These are scanner matches, not 157 proven
exploitable CVEs. The full per-match package/version/severity/fix metadata is preserved
in the companion evidence JSON. Embedded Go stdlib accounts for 76 matches and the
rclone module for 17. The scan now includes the previously external tool bytes; it
is not comparable to the former image's 13 residuals by subtraction alone. No residual
has been accepted. Upgrade decisions for tool versions and their supply-chain bindings
must be reviewed separately; the requested two bootstrap-path mitigations do not
constitute that larger vulnerability remediation.

## Read-only external evidence

VPS observation timestamp: `2026-09-08T00:56:21Z`, existing strict-known-host SSH as
appuser, x86_64. No new route or privilege was created. Root cron and appuser cron
commands both exited 1 and are recorded UNKNOWN; an empty stdout is not an empty
schedule. Root crontab requires an administrator summary. Docker observation found
one backup container and one n8n container; workflow count/status is still UNKNOWN.
Canonical writer lock and appuser Docker puller config were absent. No Docker exec
was used to bypass unreadable host files.

GHCR returned 404; fresh GitHub identity observation showed scopes
`gist, read:org, repo, workflow`, without `read:packages`. Package absence cannot be
concluded. The repository default Actions permission remains read-only and cannot
approve PR reviews. Proposed publisher is repository CI with job-scoped package write;
proposed puller is the deployment host with package read. These are designs, not
verified installed authorities. One metadata request timed out; a later identity
read succeeded. No token was printed or installed.

MinIO aggregate/freshness/content-set evidence and n8n workflow metadata were not
available through the observed channels. A single consolidated administrator request
was sent to the Director in this task. No response supplying those summaries had
arrived at evidence assembly. Missing evidence stays BLOCKED; source work continued.

Expected observation side effects were ordinary provider page access and SSH login
audit records. No grant, service, data, registry, DNS or provider setting was changed.

## Capacity proposal: rescale main disk, not prune

Fresh observed filesystem total: 80,307,429,376 bytes. Available: 14,612,901,888 bytes
on both root and `/var/lib/docker`, or **13.609325 GiB / 18.196202%**. Shortfall to
24 GiB: **10.390675 GiB**. Both thresholds remain mandatory. Prior reviewed cleanup
action filters selected zero records; there is no new eligibility evidence here
and no prune plan is authorized by these numbers.

Authenticated Hetzner Console bound the same server/origin to CPX22, Helsinki,
x86, 2 vCPU, 4 GB RAM, 80 GB disk. Server ID SHA-256:
`eb1c83915199b85c8a2bbcbb0bae224861bf2ecaf753d5ca08a53baf4c36ec69`.
The project ID stayed the same; its visible name changed from Default in the earlier
observation to DIIS in the later observation. No project rename was performed by
this Executor. The rescale form was inspected, including changing its unsaved
CPU/RAM-only option to display disk expansion; no rescale action was submitted.

| Proposal                             | Console quote excluding VAT | Implication                                                   |
| ------------------------------------ | --------------------------- | ------------------------------------------------------------- |
| CPX32, 4 vCPU, 8 GB RAM, 160 GB SSD  | $0.067/hour, $41.99/month   | Preferred capacity option; expands main disk.                 |
| CPX42, 8 vCPU, 16 GB RAM, 320 GB SSD | $0.131/hour, $81.99/month   | Larger alternative; no evidence this extra compute is needed. |
| CPU/RAM-only rescale                 | Disk remains 80 GB          | Does not solve this disk gate.                                |

Console states backup service costs 20% of server plan. Arithmetic for CPX32 is
approximately $50.39/month including that backup surcharge, **excluding VAT, IP and
other charges**; this is a derived planning estimate, not an accepted billing quote.
Reconcile the current-plan discrepancy and final checkout quote before purchase.
Observed offers do not reserve capacity or guarantee availability at execution time.

The UI says the server must be powered off and rescale usually takes a few minutes.
Plan a separately approved maintenance window that includes shutdown, rescale, boot,
filesystem validation and health/recovery checks; do not promise only a few minutes
of total downtime. Root disk growth must be verified at block, partition and
filesystem layers. Docker data stays on the main disk; no Docker data-root migration
or Volume attachment is proposed. A 160 GB offer suggests ample space, but usable
filesystem size/reservation/growth must be measured after rescale before PASS.

Existing provider backups: 7/7 Available, displayed aggregate **217.72 GB** (rounded
UI units, not exact bytes), newest `2026-09-07T10:38:13Z` / 27.95 GB; oldest
`2026-09-01T10:39:06Z` / 30.93 GB. Provider UI warns that seven slots rotate and
recommends powering off for disk consistency. Available image backups do not prove
application-consistent PostgreSQL/MinIO recovery. Enable-protection actions were
visible; no protection was enabled. Earlier project inventory had zero Volumes.
No new snapshot or backup was taken, and no restore was tested against these images.

Recovery plan before an authorized rescale: bind exact existing recovery point,
prove its suitability and ownership, agree fallback capacity/cost, preserve current
config/image/source identities, then approve the maintenance sequence. If rescale
fails, stop and use a separately approved replacement-server recovery path. Disk
expansion cannot generally be rolled back by downgrading to a smaller disk; do not
present downgrade as rollback. Do not rebuild/restore the existing server in place
under this source authorization.

Sources: [Hetzner server FAQ](https://docs.hetzner.com/cloud/servers/faq/),
[backup FAQ](https://docs.hetzner.com/cloud/servers/backups-snapshots/faq/), and the
authenticated Console observations above. These support platform behavior; actual
prices came from the authenticated form. [GitHub Packages permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages)
supports the separation of package capabilities from repository access.

## Minimum remaining decisions and evidence

1. Independent source review of this literal dirty manifest, new semantics and
   local proof; unchanged historical source needs no blanket re-audit.
2. Git/release planner: preserve the exact reviewed bytes while sequencing the
   compatible writer/library as a staging prerequisite before the application delta;
   prove the v2 inventory/runtime attestation before authorizing application mode.
3. Organization admin: read-only private package/linkage and publisher/puller metadata.
   Existing token lacks package scope. Use a safe existing session or administrator
   attestation; no token/password through chat. Grant changes remain separately gated.
4. VPS owner: root-cron ordered count/hash plus backup-scheduler classification;
   recovery owner: MinIO count/bytes/freshness/content-set hashes; n8n owner:
   workflow count/status/hash. Minimum scope is aggregate read-only evidence for
   this one inspection. No persistent new access is needed if owners supply results.
5. Director/security reviewer: adjudicate the expanded 157-match inventory and decide
   whether a bounded tool-version remediation is needed. Historical 13-match risk
   acceptance cannot be reused for the new inventory or a future artifact.
6. Director: approve a concrete rescale execution packet only after billing and
   recovery prerequisites are reconciled. No cleanup alternative is silently substituted.
7. Release owner: after source delivery gates, obtain separate exact artifact build,
   risk/publication, credential/pull, host preparation and standard staging approvals.

## Literal changed-file manifest and cleanup

The companion `WAVE10-D-SOURCE-CLOSURE-EVIDENCE-2026-09-08.json` carries the literal
source paths and SHA-256 hashes, split by the following review scope:

- Publisher: `.github/workflows/backup-image.yml`,
  `infrastructure/deploy/backup-image-artifact.py`,
  `infrastructure/deploy/verify-publication-metadata.py`,
  `infrastructure/deploy/verify-loaded-backup-image.py`,
  `infrastructure/deploy/verify-published-backup-image.py`.
- Staging: `.github/workflows/deploy.yml`,
  `infrastructure/deploy/package-staging-executor.py`,
  `infrastructure/deploy/staging-application-deploy.py`,
  `infrastructure/deploy/staging-readiness-deploy.py`.
- Tools/image: `infrastructure/docker/docker-compose.yml`,
  `infrastructure/docker/pg-backup.Dockerfile`,
  `infrastructure/docker/scripts/backup-lib.sh`, `scripts/build-backup-tools.py`,
  `scripts/install-baked-backup-tools.py`.
- Tests/runbook: `.github/workflows/ci.yml`,
  `infrastructure/deploy/tests/source-closure-contract.py`,
  `infrastructure/deploy/verify-source-closure-handoff.py`,
  `infrastructure/docker/tests/backup-contract.sh`,
  `infrastructure/docker/tests/w10d-remediated-image-integration.py`,
  `docs/runbooks/w10d-source-closure-release.md`.
- Handoff: this report and `docs/audits/WAVE10-D-SOURCE-CLOSURE-EVIDENCE-2026-09-08.json`.

Executor manifest: **20 source/runbook files + 2 handoff files = 22 files**.
The six incoming independent reports are additional untracked local evidence files
with SHA-256 values
`5a689fd92774694d25a85855711cd29a00d5b36cfc76bbc4ff3b63bd19a28965` and
`e0050dade0f5556845490f62aad920fd83e1b413b3baee4a7c8dc72851f64cc0`, and
`db018e4b3ef9e0bc76491be389874c1b777f6fa932d486bd45f59bf19de82403`, and
`1d0bf5013c4d41a71efde0cd35256fd864853525ccd162c4cbed9afb83e593fb`, and
`303a78a9d8c13264c37eeda68d81201c0fe3e53cbab0dddb6e9e3dab87a0295b`, and
`7e0e076dac9b147dd99694a09abc4d39ff4e82f222e944ac253a5d032d63c5c0`.
They are not part of the Executor manifest and were not modified. Literal local
status is therefore 28 paths, staged 0 after generated cache cleanup.
No broad staging, commit, push, PR or remote CI was performed. Test image/archive,
scan and SBOM remain outside Git for review, explicitly marked non-release. Synthetic
containers/networks are absent. Generated Python caches were removed. Scout reported
a temporary archive cleanup failure; the exact task-generated archive was later
removed successfully. Automatic review rejected a recursive cache cleanup command;
the bounded fallback removed only inventoried pyc files and their empty directories.
No historical artifact or shared cache was removed.

The report's full-file SHA-256 is computed after formatting and supplied in the final
handoff; it is intentionally not embedded recursively in its own bytes.

## Independent review acceptance

Verify all 20 source hashes and baseline, then examine application schema/receipt/
rollback, real-runner repeated-signal boundaries, the canonical directory writer-lock
protocol, crash-durable guardian-backed application quarantine, actual-main ambiguous-child
retention, every atomic publication boundary, guardian-owned retirement and normal-release
behavior, prior-boot persistence, v2 writer/library/inventory attestation and required
two-stage delivery ordering, approval expiry, no production/legacy mutation,
archive extraction limits, no-overwrite tool lifecycle and digest-qualified
publication receipt/config/layer continuity. Run the source-closure handoff validator
against the final report/evidence and reproduce both its one-sided and paired stale
report/evidence count failures. Reproduce focused contracts and reuse
the byte-identical local image proof;
check all known scan and external gaps remain explicit. Do not approve operational
use solely from source/test PASS. No source packaging is authorized by this handoff.

## Rekomendasi model untuk tindak lanjut

Task berikutnya: Independent Reviewer memeriksa delta SC10 pada exact manifest 20/20,
termasuk discovery 43 test dan dua regresi stale-count; semua operasi tetap HOLD.
Model / effort: GPT-5.6 Terra (`gpt-5.6-terra`) / high.
Alasan: perubahan hanya validator dan kontrak terikat dengan jalur gagal yang dapat
direproduksi; protocol lock, image, dan staging tetap byte-identik.
Syarat kualitas: report dan evidence harus sama-sama cocok dengan 43 test yang
ditemukan dari source terikat; mismatch satu sisi dan pasangan stale 42/42 wajib gagal.
Eskalasi bila: discovery dinamis atau hasil runner tidak lagi dapat dibuktikan setara
dengan count statis -> GPT-5.6 Sol (`gpt-5.6-sol`) / high.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
