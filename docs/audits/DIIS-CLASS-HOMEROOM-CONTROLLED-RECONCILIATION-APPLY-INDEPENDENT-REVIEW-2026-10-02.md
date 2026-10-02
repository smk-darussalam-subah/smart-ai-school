# DIIS Controlled Class/Homeroom Reconciliation Apply Independent Review

Date: 2026-10-02

Role: Independent Reviewer

Checkout: `smart-ai-school-class-homeroom-fix-20261001`

Base SHA: `cea45c9e0e4e6585b0c2980aa6216bda9d6331cd`

Verdict: **`APPROVED FOR EXPLICIT GIT PACKAGING - APPLY AND RUNTIME HOLD`**

## Scope and exact binding

This review is limited to the six source paths recorded in:

`docs/audits/DIIS-CLASS-HOMEROOM-CONTROLLED-RECONCILIATION-APPLY-SOURCE-MANIFEST-2026-10-02.txt`

Independent reproduction:

- Executor report SHA-256: `dd24839b5c50fe59614aec901732750966e9415bd59bedb9c381f6e4c07a0f70`
- Source records: `6/6`
- Individual source hashes: `6/6 MATCH`
- Canonical source aggregate: `c3318bff78b4e0ca94fd476abea1bb47ae66f8f341a7ce4e9b47e066ab6f17e9`
- Staged paths: `0`

The aggregate was independently reconstructed from lexically sorted repository-relative paths using the documented `<sha256><two spaces><path><LF>` format.

## Findings

No P0, P1, P2, or P3 source finding was verified in the reviewed six-path package.

This conclusion approves only source packaging. It does not approve preparing an apply manifest, applying to staging, accessing runtime credentials, promoting to `main`, or mutating production.

## Semantic review

### Admission and binding

- The CLI requires an explicit `--apply` flag before reading a manifest or opening a database connection.
- Schema v2 is strict and rejects schema v1, unknown fields, malformed digests, empty manifests, count mismatches, and duplicate student or homeroom-class identities.
- Exact `studentId -> classId` and `teacherId -> classId` pairs are approval-bound by the raw manifest SHA-256.
- Manifest, reviewed dry-run, and target digests are checked independently.
- The configured target, manifest target, and live PostgreSQL `current_database()` / `current_schema()` identities must agree.

### Transaction, lock, and drift safety

- All mutations and the success audit run in one Prisma interactive transaction using PostgreSQL `SERIALIZABLE` isolation.
- A global transaction advisory lock makes reconciliation operators mutually exclusive.
- Existing per-user advisory locks are reused for student, teacher, archive, restore, role, and status interoperability.
- Class, student, teacher, and user rows are locked in deterministic order with bounded lock and statement timeouts.
- Identity bindings, lifecycle eligibility, exact relation pairs, and counts are reread after locks are held and before the first mutation.
- Existing student lifecycle operations acquire the same per-user lock before their student/class checks. Existing homeroom mutations serialize on the affected class row. A concurrent direct database write remains subject to row locking, serializable conflict handling, and the post-lock drift checks.

### Mutation, rollback, and duplicate handling

- Every student and homeroom change uses an exact old-relation predicate and requires exactly one affected row.
- Teacher flag normalization is limited to the exact manifest teacher set and requires the exact unique-teacher count.
- Postconditions verify that selected relations and flags are absent before commit.
- Any mismatch or later failure throws inside the transaction, rolling back earlier changes and the audit row.
- A deterministic operation digest plus the committed audit row rejects a repeated successful operation.
- The returned receipt is emitted by the CLI only after the transaction promise has committed.

### Receipt privacy

- The durable audit and CLI receipt contain operation/audit identifiers, digests, counts, and state hashes.
- They do not contain raw student, teacher, class, user, email, username, or credential values.
- Identifier-bearing error messages are suppressed; PostgreSQL concurrency errors are normalized to a fail-closed operator instruction.

## Independent verification

### Focused unit and CLI

Fresh reviewer run:

- Suites: `3/3 PASS`
- Tests: `19/19 PASS`
- Covered planner binding, strict schema v2, explicit apply admission, digest checks, no-op/duplicate rejection, and error redaction.

### PostgreSQL disposable integration

Fresh reviewer database:

- Image: `pgvector/pgvector:pg16`
- Database: synthetic disposable only
- Migrations: `49/49 APPLIED`
- PostgreSQL proof: `5/5 PASS`
- Exactly one concurrent operator committed.
- Relation drift and reviewed-dry-run mismatch failed before mutation.
- A forced later failure rolled back an earlier successful update.
- The exact CLI committed the approved synthetic relation and emitted a PII-safe receipt.
- Remaining disposable test containers: `0`

The reviewer's first disposable attempt used an incorrectly constructed temporary connection URL and never applied migrations. That container was removed. It is not source evidence. The corrected fresh run above is the authoritative PostgreSQL result.

### Static and hygiene checks

- API type-check: `PASS`
- API lint: `PASS`
- API production build: `PASS`
- `git diff --check`: `PASS`
- Cached diff check: `PASS`
- Staged files: `0`

## Evidence reuse and limitations

- The independently approved dry-run review remains applicable only as historical input because its report and reviewed bytes are unchanged.
- No staging apply manifest v2 was created or reviewed in this task.
- No staging or production database was accessed by this review.
- No runtime apply, Git commit, push, PR, deployment, or data mutation was performed.
- A fresh private schema-v2 manifest must be generated from current staging state, independently reviewed, and bound to a separate apply authorization. Any drift requires a new dry-run and new approval rather than rebinding.

## Next gate

The most efficient next task is literal Git packaging of the six reviewed source paths plus the Executor report, source manifest, and this Independent Review: exactly nine paths. CI must bind the exact head and must not execute the operator. Apply and runtime remain HOLD after packaging.

## Model recommendation

Task berikutnya: exact nine-path Git packaging and CI binding, with no runtime action.

Model / effort: GPT-5.6 Terra (`gpt-5.6-terra`) / medium.

Alasan: the semantic data-mutation review is complete; the next gate is mechanical path/blob/tree/CI verification.

Syarat kualitas: exact `9/9` path set, source aggregate unchanged, clean cached diff, exact-head CI green, and deployment count `0`.

Eskalasi bila: source bytes, manifest aggregate, target branch, or CI binding changes -> GPT-5.6 Sol (`gpt-5.6-sol`) / high for source re-review.
