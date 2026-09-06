# W10-D Gate 1 Source Follow-up Implementation

- Evidence timestamp: `2026-09-06T15:35:36+07:00`
- Worktree: `smart-ai-school-wave10d-gate1-source-followup-20260905`
- Branch: `fix/wave10d-gate1-source-followup-20260905`
- Base/HEAD: `6381862b211970c4f0958db7001c7f1204c3a701`
- Base/HEAD tree: `82b088f2344338d3ad1fb0bc3c2affa435d54923`
- Executor verdict: **`READY FOR INDEPENDENT SOURCE RE-REVIEW - ALL PRODUCTION MUTATIONS HOLD`**

## 1. Authority, input, and boundary

This is one consolidated source-only follow-up for residual P1-D1R31 and
P2-D1R34 from the latest independent review. The latest review remains an
immutable input and is bound as follows:

- report: `docs/audits/WAVE10-D-GATE1-SOURCE-FOLLOWUP-INDEPENDENT-REREVIEW-R31-R33-2026-09-06.md`;
- canonical SHA-256: `5dd9eb7b4733dcb1d82f0d7ea8f8933f3872ffcff1dee034fa1974cfe1a039a6`;
- full-file SHA-256: `cde5ddaf82f53067130cfba6911fb442ef2d9ab2de6385c53279a85a432175e1`.

All four earlier review inputs also remain byte-identical:

| Review input | Canonical SHA-256 | Full-file SHA-256 |
| --- | --- | --- |
| `WAVE10-D-GATE1-SOURCE-FOLLOWUP-INDEPENDENT-REREVIEW-2026-09-05.md` | `f86c1ccb97362b2c19874f3bba4e4a14e0b19f82238c8c4522b6da1b38d512c1` | `baf221f273225747b244e46baa27ecd906590a46498e0e76742ed5164990017b` |
| `WAVE10-D-GATE1-SOURCE-FOLLOWUP-INDEPENDENT-REREVIEW-FINAL-2026-09-05.md` | `ef937f389efbfa217271aaadb557a9a0bdc26bdeb9bfbfcf058204e6030f1f9c` | `f1ac7259cbc98510cc0237d3cb78d3e97ff0c7095bf0fd3624f10ded4a690e70` |
| `WAVE10-D-GATE1-SOURCE-FOLLOWUP-INDEPENDENT-REREVIEW-CLOSURE-2026-09-05.md` | `02b4f43938175507086d288c30d4b2cc5ba977958c23b547f39015e6dd1223fc` | `24fe8f29157d8bda5f9d252b36886a4ed7dea89bc3edeeefdcf84c3f64a002b7` |
| `WAVE10-D-GATE1-SOURCE-FOLLOWUP-INDEPENDENT-REREVIEW-R27-R30-2026-09-06.md` | `c7b7e3291b4a10ca5c5842d6919521fc5833a9325c646a1af4131b9a52d014a8` | `da4e5ec85ac230be89c879f7c2aac70b85c99fa6ce4017a5196a936e86fc08ca` |

Scope was limited to source, synthetic tests, runbooks, and this report. No
SSH/VPS, provider browser, credential, root production, staging, deployment,
backup, restore, BuildKit cleanup, scheduler activation, Git stage/commit/push/PR,
or other operational mutation was performed. Docker Compose was rendered by the
synthetic operator contract; no service, image, container, network, or volume was
created or changed.

## 2. Consolidated closure matrix

| Finding | Implemented closure | Executable evidence | Status |
| --- | --- | --- | --- |
| P1-D1R31 effective source configuration was asserted rather than observed | A shared parser now implements one commissioning/lifecycle fingerprint semantic. The fingerprint includes the exact crypt backing remote and prefix in addition to encryption mode, backend, provider, origin, and Drive custody bindings. Prepare, restore, and cleanup each capture the active crypt and its backing configuration into separate private files, bounded to 64 KiB and 30 seconds, then enforce strict required/optional key cardinality and recompute the approved fingerprint before target observation or mutation. The authority calculation uses observed source provider/origin/fingerprint/backing hash, rejects target equality with either source remote name, and upgrades to authority v2 plus marker v3. | In all three entry points, valid target config, marker, and approved environment values are held constant while tests inject same-provider backing-prefix drift, backing observation failure, and duplicate crypt keys. Call logs prove the active source config was requested and prove no `mkdir`, object `copyto`, or `purge` was reached. No failure emits READY/REMOVED or publishes a proof. | Closed pending independent exact-manifest re-review |
| P2-D1R34 READY/REMOVED could precede final local evidence cleanup | Prepare and cleanup now set a pending-success state only after remote verification/absence proof. Their EXIT finalizer first removes every private capture/intermediate, verifies each absence, removes the observation directory, and verifies directory absence. Only then can it emit exactly one final READY/REMOVED marker. Any local `rm`, `rmdir`, absence, or success-marker publication failure returns status `74` with an explicit no-retry ambiguity and no final success marker. | Behavioral tests inject scoped `rm` and `rmdir` failures into both entry points, retain remote success otherwise, and assert status `74`, `phase=local-evidence`, `retry=prohibited`, and no READY/REMOVED. Post-create and post-purge observation failures also assert no false success. Clean paths assert exactly one marker. | Closed pending independent exact-manifest re-review |

P1-D1R32 and P2-D1R33 remain closed exactly as accepted by the latest
reviewer. R31 target-side isolation, strict marker/replay validation, proof-path
containment, and purge ambiguity controls remain intact. Earlier accepted
completion, retention, candidate, lock, cleanup, runtime, and evidence controls
are regression-covered. The completion sweep found no known remaining
P0/P1/P2/P3 issue in the affected slice, subject to independent review.

## 3. Runtime and state-machine properties

- Effective source validation is now `bounded crypt config -> strict crypt
  cardinality -> bounded backing config -> strict backing cardinality ->
  commissioned fingerprint recomputation`.
- The canonical source fingerprint input includes
  `remote=<exact-backing-remote-and-prefix>`. A redirect within the same provider
  and origin therefore changes the fingerprint and stops before mutation.
- Target authority v2 is calculated from observed source authority and observed
  target authority. Marker v3 stores only approved non-secret values and the
  SHA-256 of the source backing binding; it does not expose source config bytes.
- Create flow is `source authority -> target authority -> parent absence ->
  create -> strict marker verification -> local evidence cleanup -> one READY`.
- Restore flow is `input/provenance validation -> proof ownership registration ->
  source authority -> target authority/marker -> exact object copy and verify ->
  target inventory -> private evidence cleanup -> proof publication`.
- Cleanup flow is `source authority -> target authority/marker -> bounded purge ->
  canonical parent absence -> local evidence cleanup -> one REMOVED`.
- Source config unavailable, oversized, malformed, duplicated, or changed is a
  pre-mutation failure. Target/purge uncertainty after mutation remains status
  `74` and `retry=prohibited`; no automatic retry is introduced.
- READY/REMOVED are not printed by the main body. The EXIT finalizer is the only
  success publisher, after local cleanup and absence proof.
- The exact pg-backup Dockerfile and its three embedded Python payloads did not
  change in this follow-up, so the earlier exact-source image runtime exercise was
  not repeated. The affected shell paths are bind-mounted source and are covered
  by the behavioral contracts below.

## 4. Verification evidence

| Check | Result | Boundary |
| --- | --- | --- |
| Gate 1 source follow-up contract | `19/19 PASS` | synthetic source/process fixtures only |
| Recovery operator contract | `36/36 PASS` | synthetic image-binding, lock, acceptance, Compose render, and cleanup fixtures only |
| Backup/restore contract | two consecutive final reruns, each `42/42 PASS` | synthetic backup, source/target authority, restore, proof, retention, success-order, and fault/signal matrix |
| Bash syntax | `21/21 PASS` | all affected shell files |
| Python AST syntax | `8/8 PASS` | all affected Python files; no bytecode output |
| ShellCheck | not run; executable unavailable | Bash parsing plus behavioral suites are recorded instead |
| Compose render and image binding | `PASS` | operator contract, config-only; no service start |
| Exact-source image runtime | not rerun | Dockerfile and all embedded image payload bytes unchanged in this follow-up |
| PostgreSQL database integration | not rerun | no database harness or database restore behavior changed in this follow-up |
| Full application suite | not rerun | no application, dependency, lockfile, or Prisma schema change |
| Working-tree and cached diff checks | `PASS` | both checks exit `0` after report finalization |
| High-confidence secret scan | `PASS`, zero matches | all 42 local changed files after report finalization |
| Hygiene | `PASS`, no conflict marker, CR byte, or trailing whitespace | all 42 local changed files after report finalization |
| Source manifest | `36/36 match` | hashes in section 5 |
| Review input integrity | `5/5 match` | canonical/full binding above; reviewer bytes untouched |
| Staged files | `0` | no packaging performed |

Expected negative diagnostics from malformed evidence, producer failure,
timeout, overflow, source drift, cleanup ambiguity, and signal cases are test
evidence, not operational incidents. Pre-final runs found one fault-shim scope
issue: the first `rm` shim also affected an intermediate canonicalization file.
The shim was narrowed to a finalizer-only source-config capture, then both final
`42/42` serial reruns completed. No partial run is presented as passing evidence.

## 5. Exact 36-file source manifest

Audit reports are intentionally excluded from this source payload.

| Source path | SHA-256 |
| --- | --- |
| `docs/runbooks/backup-restore.md` | `45de05fcc45806b9aaebb5e2cc484041e89f468f9228a34e19faf90c8015b776` |
| `docs/runbooks/offsite-backup-recovery.md` | `309910b73d24de67a0e34971a16c74ebdf5a6f3a21777d0711603350912daad9` |
| `docs/runbooks/restore-database.md` | `e916b39c53252787ddb5d9c5d4168f952a7d2cbd89e0043fb5898fe4353d1518` |
| `infrastructure/deploy/create-w10d-backup-candidate.sh` | `022e72919f80def7d435c123e7b6746aa7367d81629c77ce4c89648797e0db1c` |
| `infrastructure/deploy/diis-build-cache-cleanup.sh` | `b3d0b92dac024471abafef7e6248df48bd8075f5fd6b2701797878bb0d161892` |
| `infrastructure/deploy/install-w10d-backup-lock-bootstrap.sh` | `dccb36bbf568c4868ae3051dfc51de3d6c16d1e82e0f822f6bc33e81d0e38bb5` |
| `infrastructure/deploy/run-with-diis-host-lock.sh` | `b09af3fb966959f154f8381b44ffb6eee04db7576a3830be589bf60680f6dc45` |
| `infrastructure/deploy/w10d-backup-scheduler-handoff.sh` | `c88fb33b1345132e8209dd6655fbffa5e3e8952bee75c3ece29a9e9a890bce07` |
| `infrastructure/docker/docker-compose.backup-candidate.yml` | `952df5c04ea5e0409e8c5b6315b61f33c00a09ee9d6b72dda2b7be379a0b1532` |
| `infrastructure/docker/docker-compose.yml` | `7beb4fe08d736caf3db6d0267a3197a904231ab435968a507dd79f8c82c38617` |
| `infrastructure/docker/pg-backup.Dockerfile` | `d3da9a98f2fc875839c9eeeadf208b79b89ee46c08c7070efbf49dd2339b7505` |
| `infrastructure/docker/scripts/backup-lib.sh` | `3fa32d928fa034ce1f91f82f68573e9d97a09926033a96bec17784812e3fbc1b` |
| `infrastructure/docker/scripts/backup.sh` | `04dc7ca9240f79d41f4a5309751b4a8b41302a51528103a28e5cd052ad3b9f9c` |
| `infrastructure/docker/scripts/offsite-replication.sh` | `11e19b4a42e90a3ed52377d7887fbe7b3f7f45b2b39de96e8981e1c1e74726a5` |
| `infrastructure/docker/scripts/release-prechange-backup.sh` | `366855061a43154107e964e342ba4a5c9638d676c4bee3fbdc80a93244302de5` |
| `infrastructure/docker/scripts/restore-objects.sh` | `dd1a38f9bf23a30d3d929253844b19cd514683c4406eab80ce11acdad3bb7a13` |
| `infrastructure/docker/tests/backup-contract.sh` | `af452297765f88b937ec6c07a40dc55317a2b6bce3afc14ade2e03afe4c4ac6e` |
| `infrastructure/docker/tests/recovery-operator-contract.sh` | `35bbf4941d2cabfa01c3ca615858012d39977d8bad4a63b8d3b5e36bf50f166a` |
| `infrastructure/docker/tests/w10d-gate1-source-followup-contract.sh` | `e63aee8283156dcca0d7fb078aa9ebf6a0cdf8b6bcbf0be1463611d75147916e` |
| `infrastructure/docker/tests/wave10-postgres-integration.sh` | `241ff36c9385c3c332deed62656b8ff2e3612ce8bcd189c41fc03f5cba03b225` |
| `infrastructure/systemd/diis-backup-lock.conf` | `61c13e1228ad7ad9e48edfab63483ce0be2f8af908584f5e4fd69d3ea9533ac9` |
| `scripts/bounded-command-capture.py` | `6c4c8a69f8ddce7c1185b29a47fe702481bbd04ad7512e8138d9d3a24b734b4b` |
| `scripts/cleanup-object-restore-target.sh` | `cb736a3e3ca4f9e13b09a306dc893daf9096e01345064a5e95f0b17e69cfe456` |
| `scripts/docker-container-redacted-manifest.py` | `db47f407e9b0d44321d2406871d54e458ddbc48ec9ba428646996b868db26d93` |
| `scripts/google-service-account-binding.py` | `cefa371993c719382357d1711048db649e092c44a5ed05e5adf798d095185c56` |
| `scripts/parse-buildkit-eligibility.py` | `6ecc9e19d2ad8812bc7ca5026b0bbacdca98185cd230a8a3c7b6d40904900b36` |
| `scripts/parse-minio-du-observation.py` | `35bdd6cabcd5b187597410cf289430b3da78476a4353d0b9617f1bb0e5d0433c` |
| `scripts/prepare-object-restore-target.sh` | `e6762f1ca5cb4a752d307dc0f3a7b9a2c3b4ba168b655ad58956d1095677f96e` |
| `scripts/prepare-offsite-restore.sh` | `c41ae20ef77244af10ed50ba28a113d5e82b895b0fe88cf5013443b96f024ff5` |
| `scripts/production-recovery-readonly-summary.sh` | `faf7193aefa7efc389630f7fa4146ec4df3c71409de742ae3215e0b0068464f8` |
| `scripts/publish-restore-proof.sh` | `45043582affd01e9973798da1c5aac67126f59bffe09b48e3e941ec7ba91eedc` |
| `scripts/restore-drill.sh` | `fc038ebf022f0bae5a1393cdb4bd2827fffe421443dc15d90f1e401b9ead59f7` |
| `scripts/validate-production-completion-observation.py` | `01943d23793d88746293b9c0a5c4041db7f97e350ff6c378200400dc6ba1512b` |
| `scripts/validate-w10d-candidate-acceptance.py` | `6c2746933015c35a2c8052e49e54bb3ec678dffbeeb060187990917da3e85758` |
| `scripts/w10d-test-boundary.sh` | `24e72cf87042fd58dd62f39d5451e5f1f3f4df11d3305866a1ffac07743ca2fd` |
| `scripts/w10d_completion_validation.py` | `e6260806f44230905e3cb4d00a23114f1386f332ce95ba2b7b459bb33a2a421a` |

## 6. Literal local changed-file manifest

The worktree remains intentionally unstaged. This is the complete local
changed-file listing at the evidence timestamp. The five reviewer reports are
separate immutable inputs and are not part of the source payload.

```text
 M docs/runbooks/backup-restore.md
 M docs/runbooks/offsite-backup-recovery.md
 M docs/runbooks/restore-database.md
 M infrastructure/deploy/create-w10d-backup-candidate.sh
 M infrastructure/deploy/diis-build-cache-cleanup.sh
 M infrastructure/deploy/run-with-diis-host-lock.sh
 M infrastructure/deploy/w10d-backup-scheduler-handoff.sh
 M infrastructure/docker/docker-compose.backup-candidate.yml
 M infrastructure/docker/docker-compose.yml
 M infrastructure/docker/scripts/backup-lib.sh
 M infrastructure/docker/scripts/backup.sh
 M infrastructure/docker/scripts/offsite-replication.sh
 M infrastructure/docker/scripts/release-prechange-backup.sh
 M infrastructure/docker/scripts/restore-objects.sh
 M infrastructure/docker/tests/backup-contract.sh
 M infrastructure/docker/tests/recovery-operator-contract.sh
 M infrastructure/docker/tests/wave10-postgres-integration.sh
 M scripts/cleanup-object-restore-target.sh
 M scripts/docker-container-redacted-manifest.py
 M scripts/prepare-object-restore-target.sh
 M scripts/prepare-offsite-restore.sh
 M scripts/production-recovery-readonly-summary.sh
 M scripts/publish-restore-proof.sh
 M scripts/restore-drill.sh
 M scripts/validate-w10d-candidate-acceptance.py
?? docs/audits/WAVE10-D-GATE1-SOURCE-FOLLOWUP-IMPLEMENTATION-2026-09-05.md
?? docs/audits/WAVE10-D-GATE1-SOURCE-FOLLOWUP-INDEPENDENT-REREVIEW-2026-09-05.md
?? docs/audits/WAVE10-D-GATE1-SOURCE-FOLLOWUP-INDEPENDENT-REREVIEW-CLOSURE-2026-09-05.md
?? docs/audits/WAVE10-D-GATE1-SOURCE-FOLLOWUP-INDEPENDENT-REREVIEW-FINAL-2026-09-05.md
?? docs/audits/WAVE10-D-GATE1-SOURCE-FOLLOWUP-INDEPENDENT-REREVIEW-R27-R30-2026-09-06.md
?? docs/audits/WAVE10-D-GATE1-SOURCE-FOLLOWUP-INDEPENDENT-REREVIEW-R31-R33-2026-09-06.md
?? infrastructure/deploy/install-w10d-backup-lock-bootstrap.sh
?? infrastructure/docker/pg-backup.Dockerfile
?? infrastructure/docker/tests/w10d-gate1-source-followup-contract.sh
?? infrastructure/systemd/diis-backup-lock.conf
?? scripts/bounded-command-capture.py
?? scripts/google-service-account-binding.py
?? scripts/parse-buildkit-eligibility.py
?? scripts/parse-minio-du-observation.py
?? scripts/validate-production-completion-observation.py
?? scripts/w10d-test-boundary.sh
?? scripts/w10d_completion_validation.py
```

The handoff payload is exactly 36 source files plus this Executor report. The
five independent review reports remain separate immutable inputs. There are 42
local changed files in total and zero staged files.

## 7. Remaining gates and decisions

The next permitted gate is one independent exact-manifest source re-review.
Only a new approval bound to this 36-file manifest and this report's canonical
hash can open later Git packaging. Image publication and registry digest review,
staging re-QA, exact-SHA promotion, root inspection, capacity cleanup, Shared
Drive or `rclone` setup, Hetzner/provider setup, backup, restore, commissioning,
scheduler activation, production mutation, Prompt 7, and piloting remain
**HOLD**. No production restore is authorized.

## 8. Report integrity

Canonicalization rule: preserve report bytes and LF line endings, replace the
value after the single `canonicalReportSha256=` token with 64 ASCII zeroes, and
hash the resulting full byte stream with SHA-256. The full-file digest is
detached evidence reported with the handoff.

`canonicalReportSha256=d56219a94a573999a37e050ac561afb734f75065c6a95b1636d4aa91808c9767`

## Verdict

**`READY FOR INDEPENDENT SOURCE RE-REVIEW - ALL PRODUCTION MUTATIONS HOLD`**
