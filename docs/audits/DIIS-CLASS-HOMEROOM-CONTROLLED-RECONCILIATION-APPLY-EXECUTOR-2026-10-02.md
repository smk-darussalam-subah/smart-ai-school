# DIIS Controlled Class/Homeroom Reconciliation Apply Executor

Date: 2026-10-02
Checkout: `smart-ai-school-class-homeroom-fix-20261001`
Local branch: `fix/class-homeroom-operational-20261001`
Local base SHA: `cea45c9e0e4e6585b0c2980aa6216bda9d6331cd`
Verdict: **`SOURCE COMPLETE - INDEPENDENT REVIEW, APPLY, AND RUNTIME HOLD`**

## Authorization and boundary

This change implements the separately requested controlled reconciliation apply operator after the independently approved staging dry-run.

Input review:

- Independent dry-run review SHA-256: `b60326b95f00f9998baa42cb87553d72c2d37330db4b5ab650aff2e67d896b98`
- Reviewed dry-run result SHA-256: `9c2c6f6a5b0244301296446398f82bac8a3db60ed5e358be4bb02c14855739db`
- Reviewed staging target SHA-256: `d21972cade0d05012fb74cf5800956aa5a55ce2767df60ee553693082d7bc751`

No apply command was executed against staging. No staging, production, Git, GitHub, deployment, or real-data mutation was performed.

## Implementation

### Exact apply contract

- Adds a dedicated `schemaVersion: 2` apply manifest.
- Requires exact `studentId -> classId` and `teacherId -> classId` relation pairs.
- Requires the reviewed dry-run digest, apply-manifest digest, and database-target digest.
- Rejects schema-v1 dry-run manifests, unknown fields, duplicate identities/classes, count mismatches, and empty/no-op manifests.
- Requires an explicit `--apply` CLI flag; omission fails before reading the manifest or opening a database connection.

The schema-v2 requirement intentionally prevents the approved dry-run manifest from being reused directly for mutation. A new exact-relation manifest must be prepared and reviewed separately.

### Transaction and locking

- Runs in one Prisma interactive transaction with PostgreSQL `SERIALIZABLE` isolation.
- Acquires one global transaction advisory lock for the reconciliation operation.
- Uses the existing per-user mutation advisory locks to coordinate with archive, restore, role, status, and student lifecycle changes.
- Locks classes, students, teachers, and users in deterministic sorted order.
- Re-reads and validates database identity, exact IDs, exact relation pairs, lifecycle state, counts, and user bindings while locks are held.
- Rejects concurrent operators, stale manifests, moved relations, active records, missing rows, and repeat application.

### Exact mutation and rollback

- Clears each approved student-class relation with an exact two-column predicate and requires one changed row.
- Clears each approved homeroom relation with an exact two-column predicate and requires one changed row.
- Normalizes `Teacher.isWaliKelas` only for exact manifest teachers and requires an exact row count.
- Re-reads all selected rows before commit and verifies no selected relation or homeroom flag remains.
- Any mismatch, query failure, concurrency conflict, or postcondition failure throws inside the transaction, causing complete rollback.

### PII-safe receipt

- Writes the successful receipt atomically to `audit.audit_log` in the same transaction.
- Emits only operation/audit IDs, binding digests, exact counts, relation-set digests, and before/after state digests.
- Does not emit student, teacher, class, user, email, username, or credential values.
- Detects an already-successful operation using the deterministic operation digest.
- Redacts UUID-bearing CLI failures and normalizes PostgreSQL concurrency errors into a fail-closed operator message.

## Verification

### Focused unit and CLI

- Final focused planner/apply/CLI run: **3 suites, 19 tests passed**.
- Apply-specific unit and CLI run during implementation: **10/10 passed** before final completion additions.
- Covered explicit apply flag, all three required digests, schema separation, strict fields, duplicate/count/no-op rejection, identifier redaction, and concurrency error normalization.

### PostgreSQL disposable proof

- PostgreSQL image: `pgvector/pgvector:pg16`.
- Migrations: **49 completed**.
- Final apply proof: **5/5 passed**.
- Demonstrated:
  - exactly one of two concurrent operators succeeds;
  - relation drift aborts before mutation;
  - mismatched reviewed dry-run digest aborts before mutation;
  - a forced failure after an earlier update rolls the entire transaction back;
  - the real CLI applies the exact manifest and emits a PII-safe committed receipt.
- The existing class/homeroom PostgreSQL proof also passed in the combined source-exact run.
- Disposable database and container were removed; remaining test container count: `0`.

### Static and build checks

- API type-check: pass.
- API lint: pass.
- API production build: pass.
- Prettier: pass.
- `git diff --check`: pass.
- Focused secret/credential scan: no match.
- Staged files: `0`.

A first disposable setup using plain PostgreSQL was discarded before proof because it lacked the required `pgvector` extension. The successful evidence above comes from a fresh compatible database with all 49 migrations.

## Source manifest

Manifest: `docs/audits/DIIS-CLASS-HOMEROOM-CONTROLLED-RECONCILIATION-APPLY-SOURCE-MANIFEST-2026-10-02.txt`

Canonical algorithm: sort the six repository-relative paths lexically; for each file emit `<lowercase SHA-256><two spaces><path><LF>`; hash the concatenated UTF-8 bytes including the final LF.

- Source paths: `6/6`
- Aggregate SHA-256: `c3318bff78b4e0ca94fd476abea1bb47ae66f8f341a7ce4e9b47e066ab6f17e9`

## Residual risk and next gate

- The operator source is implemented but has not been independently reviewed.
- The old schema-v1 dry-run manifest cannot authorize apply. A separate private schema-v2 exact-relation manifest and fresh digest are required.
- Staging data may drift after review; the operator fails closed, and drift requires a new dry-run/manifest/review rather than rebinding.
- Apply execution, staging mutation, main promotion, and production remain HOLD.

## Independent reviewer handoff

Review exactly the six source paths in the manifest. Reproduce the aggregate, inspect transaction/lock ordering and receipt privacy, rerun focused unit/CLI tests, and run the PostgreSQL proof against a fresh 49-migration disposable database. Do not prepare an apply manifest and do not execute the operator against staging.

Rekomendasi model untuk tindak lanjut
Task berikutnya: Independent Reviewer melakukan semantic source review atas exact enam path dan proof PostgreSQL; apply, runtime, dan main tetap HOLD.
Model / effort: GPT-5.6 Sol (`gpt-5.6-sol`) / high.
Alasan: gate ini menilai transaksi data, lock lintas lifecycle, rollback, dan privasi receipt meski scope source sudah sempit.
Syarat kualitas: reproduksi manifest `6/6`, 49 migration proof, concurrent one-winner behavior, forced rollback, dan absence of raw record IDs pada receipt.
Eskalasi bila: ditemukan deadlock/order conflict, partial commit, atau receipt tidak dapat direkonsiliasi -> GPT-6 Astra (`gpt-6-astra`) / high.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
