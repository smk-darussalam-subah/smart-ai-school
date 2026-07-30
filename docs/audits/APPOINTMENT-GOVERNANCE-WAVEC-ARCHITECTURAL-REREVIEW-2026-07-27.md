# Appointment Governance Wave C - Architectural Re-review

Tanggal review: 2026-07-27

Status: **NOT APPROVED for commit, PR, or promotion. Prompt Architect remediation required.**

## Scope and Evidence

Review covers the uncommitted Wave C implementation on
`feat/appointment-governance-wave-c-activation-20260725`, based on the Wave B
model and the Wave C remediation report/prompt.

Independent local verification completed:

- Focused API suites: 3 suites, 73 tests passed.
- `git diff --check` and `git diff --cached --check`: passed.
- PostgreSQL migration dry-run, combined migration proof, and browser/staging QA:
  not performed.

The focused tests do not cover `AppointmentOutboxProcessor`, terminal retry
behaviour, cross-year successor selection, or a real PostgreSQL transaction.

## Corrected Architectural Invariant

1. Keycloak contains stable identity roles only:
   `SUPER_ADMIN`, `TATA_USAHA`, `GURU`, `SISWA`, `ORANG_TUA`, and `INDUSTRI`.
2. An active DIIS `Appointment` is the only source of a period-bound position
   code and position-derived permission.
3. `StaffPosition` is a legacy migration/compatibility projection. It must not
   create, update, or remove effective position permission overrides.
4. `UserPermissionOverride` remains for explicit, audited manual exceptions.
   It must not become a second path for appointing a person to a position.
5. An approved future appointment has no current appointment authority. The
   incumbent remains authorized through the incumbent's still-active current
   appointment until an explicit cutover.

## Root Cause

The Wave C prompt contains a contradiction:

- It correctly states that Appointment Governance replaces Keycloak position
  roles and that the resolver is appointment-aware.
- It also explicitly requires `PositionsService.assign()` to create ACTIVE
  `POSITION_ASSIGNMENT` overrides.

The latter requirement restores an independent authorization path:
`StaffPosition -> UserPermissionOverride -> effective permission`. A
SUPER_ADMIN can therefore grant position permissions without the appointment
draft, approval, effective date, successor/PLT, or appointment audit trail.
The executor implemented this written requirement; the remediation must correct
the prompt and the architecture rather than merely changing a test.

## Decision Review

| Decision | Review outcome | Final direction |
| --- | --- | --- |
| Stable identity roles in Keycloak only | Accept | Keep. Never recreate position realm roles. |
| Same person may continue as WAKA in a new academic year | Accept | Use a linked successor Appointment in the new year. It is approved ahead of time but does not grant new-year authority until activation. |
| Same-person reappointment inside one academic year | Accept as rejected | Amend the existing appointment where permitted; do not create a successor merely to restate the same term. |
| `StaffPosition` retained for migration compatibility | Accept with boundary | Read/projection/migration only. Remove it as a permission writer. |
| `POSITION_ASSIGNMENT` ACTIVE override on assign | Reject | This violates the single-source invariant. No position-derived effective override may be created from legacy assignment. |
| EventEmitter after academic-year commit for core lifecycle | Reject | In-process, non-awaited, fail-soft processing is unsuitable for authoritative cutover state. |
| Keycloak logout when a position changes | Reject for appointment changes | Position access is resolved from DIIS DB, not a Keycloak position role. Invalidate server cache and refresh client capability data; force logout only for disabled accounts or stable identity changes. |
| Outbox used as both retry queue and user-visible appointment history | Reject | Keep business/audit history separate from operational delivery state. Do not return retry payloads or technical identifiers in history. |
| One deputy BKK and one deputy Hubin only | Reject as default policy | This conflicts with the Director policy that deputies may exist as needed. Use configurable position capacity; default core holders to one. |

## Canonical Operational Flows

### A. Annual continuation of the same WAKA

1. During the current academic year, KS/SUPER_ADMIN selects **Perpanjang ke
   Tahun Berikutnya**.
2. The system creates a new-year appointment with the same staff member,
   position/scope, `replacesAppointmentId`, and status `DRAFT`.
3. The normal approval policy produces `APPROVED`. The current appointment
   remains `ACTIVE`; the future appointment contributes no position permission.
4. At academic-year cutover, one database transaction ends old-year active
   appointments, activates due approved appointments in the new active year,
   flips the active year, and commits all internal state together.
5. Permission caches are invalidated after commit. The same person experiences
   no access gap because the old authority ends exactly when the new authority
   begins.

Natural end of a term is `ENDED`; `SUPERSEDED` is reserved for an early
replacement by another definitive holder.

### B. Definitive replacement in the middle of a year

1. Create and approve a successor Appointment in the current academic year
   with a clear effective date.
2. Before the date, the incumbent remains active and the successor has no
   position authority.
3. At the effective date, atomically set incumbent to `SUPERSEDED` and
   successor to `ACTIVE`, then invalidate both users' permission caches.
4. Default policy forbids silent backdating. A correction/backdate requires an
   explicit audited amendment or a separately approved exceptional process.

### C. Temporary absence and PLT

1. Suspend the definitive holder with a mandatory reason and expected return
   date. A suspended holder keeps their stable identity access but loses
   appointment-derived authority.
2. Create, approve, and activate one bounded PLT Appointment for the same
   position/scope.
3. On return, atomically end the PLT and resume the definitive holder. Resume
   is rejected while a PLT still consumes the active capacity.
4. If the temporary absence becomes permanent, end/supersede the definitive
   appointment and use the definitive-successor flow.

### D. Future effective dates in an already active year

Academic-year activation alone is insufficient. A due-activation job must run
idempotently at least daily, with a database lease/lock, to activate approved
appointments whose effective date has arrived. It must use the same transition
rules as annual cutover.

## Required Remediation Design

### P0 - Restore one authority path

- Replace legacy `positions/assign` and `positions/unassign` mutations with an
  appointment-aware adapter, or make the legacy mutation endpoints read-only
  during migration.
- The Struktur Organisasi UI may retain its familiar **Tetapkan** action, but
  it must open/create an Appointment Draft and show its lifecycle state.
- Do not create ACTIVE `POSITION_ASSIGNMENT` overrides. Preserve existing
  manual grants/revokes and historical quarantine; do not bulk-delete data.
- Inventory high-risk position authority routes. A manual permission override
  must not be sufficient where an active appointment code is required.

### P1 - Make appointment transitions deterministic

- Implement annual cutover as one database transaction with a preflight
  summary. A failed appointment transition rolls back the academic-year flip.
- Restrict any successor activation to the intended active academic year and
  use deterministic ordering.
- Add an idempotent due-appointment activator for future dates in an active
  year, protected against concurrent workers.
- Show a controlled warning/confirmation if required appointments are missing;
  SUPER_ADMIN remains the recovery authority rather than silently inventing a
  holder.

### P1 - Simplify session and audit behaviour

- Remove appointment-driven Keycloak session logout and its outbox dependency
  from this wave unless a separate, proven external side effect requires it.
- Invalidate permission cache after a committed lifecycle transition; web
  clients refetch current capabilities and handle a subsequent 403 cleanly.
- Keep appointment history in appointment/approval/audit records. Do not expose
  Keycloak IDs, internal user IDs, retry payloads, or infrastructure errors to
  the history API.

### P2 - Capacity policy

- Keep one active holder for KS/WAKA/core coordinator positions.
- Model deputy capacity explicitly. `WAKIL_KOOR_BKK` and
  `WAKIL_KOOR_HUBIN` must not be silently constrained to one if the school
  requires more; use configured `maxActiveHolders` or a future slot model.

## Required Tests and Runtime Gates

1. Assigning through the Struktur Organisasi UI/API creates an appointment
   draft and cannot grant a position permission before approval/activation.
2. A future reappointment of the same WAKA leaves the incumbent authorized
   until cutover, then changes authority without a gap.
3. Mid-year definitive replacement is atomic; temporary PLT/suspend/resume is
   atomic and rejects conflicting capacity.
4. Due activation for a mid-year effective date works and is safe under two
   concurrent trigger attempts.
5. Position-derived permission disappears on `SUSPENDED`, `ENDED`, and
   `SUPERSEDED`; an explicit manual revoke still wins.
6. PostgreSQL staging-copy/disposable proof covers the combined TF2, Wave B,
   and final Wave C migration set: pre-counts, apply, post-reconciliation,
   unique-index proofs, rollback rehearsal, and no PII in evidence.
7. Browser staging QA covers annual continuation, new WAKA cutover, permanent
   mid-year replacement, PLT return, missing-holder warning, and mobile UI.

## Handoff Recommendation

**Go to Prompt Architect first; do not send this directly to the executor.**

Reason: the original Wave C prompt explicitly caused the `StaffPosition` /
permission contradiction. A new bounded remediation prompt must replace that
acceptance criterion, decide whether the currently uncommitted outbox migration
is removed or redesigned, declare any schema change before execution, and
separate code, PostgreSQL proof, and browser QA gates.

The executor should receive only that corrected prompt. Until then: no commit,
no PR, no staging promotion, no direct data migration, and no broad staging.
