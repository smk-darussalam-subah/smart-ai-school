# Appointment Governance Wave B - Gate 0 Proposal

Date: 2026-07-24
Role: Codex Executor
Branch: `feat/appointment-governance-wave-b-gate0-20260724`
Base: `origin/develop` at `f81c764` after Appointment Governance Wave A.
Status: **GATE 0 ONLY - implementation held until Director/reviewer approval.**

## Executive Recommendation

Proceed with **Option A: additive appointment model + quarantine fail-closed + PostgreSQL staging-copy dry-run**.

Do not implement the Prisma migration or activate the resolver yet until these Gate 0 items are explicitly approved:

1. Appointment schema proposal.
2. Migration classification from existing `StaffPosition`.
3. Stable identity-role mapping for existing `User.role = KEPALA_SEKOLAH` and any other position-only roles.
4. Compatibility rule with TF2 `UserPermissionOverride` scoping.
5. PostgreSQL dry-run plan on disposable/staging copy.

Reason: Wave A correctly made Struktur Organisasi read-only and removed Keycloak position roles from authorization, but the current schema still contains historical role and permission surfaces that can create silent access drift if Wave B is rushed.

## Current Code Evidence

- `packages/auth/src/index.ts`
  - `PRIMARY_ROLES` are six stable identity roles.
  - `POSITION_CODES` still include `KEPALA_SEKOLAH`, WAKA, KAPROG, BKK/Hubin, and tendik codes as DIIS catalog values.
- `packages/database/prisma/schema.prisma`
  - `UserRole` enum still includes `KEPALA_SEKOLAH` and other position codes for historical DB compatibility.
  - `StaffPosition` stores current legacy assignments with `isActive`, `academicYearId`, and optional `majorId`.
  - `UserPermissionOverride` remains global: unique only by `[userId, permissionId]`, no year/source/status.
- `packages/database/prisma/seed-permissions.ts`
  - Still seeds `KEPALA_SEKOLAH` role permissions.
- `apps/api/src/auth/guards/roles.guard.ts`
  - Checks only `request.user.roles` from JWT. Since Wave A filters position roles out, existing `@Roles('KEPALA_SEKOLAH'|'WAKA_*')` routes fail closed until appointment resolver exists.
- `apps/api/src/positions/positions.service.ts`
  - `assign()` and `unassign()` are fail-closed before DB/Keycloak.
- `docs/audits/TF2-P1-1-ZOMBIE-PERMISSIONS-ESCALATION-2026-07-21.md`
  - Documents the root issue: position-derived `UserPermissionOverride` rows can survive year rollover forever.

## Proposed Appointment Schema

Additive only. Do not remove `StaffPosition` or `UserRole` enum values in the first migration.

```prisma
enum AppointmentStatus {
  DRAFT
  PENDING_APPROVAL
  APPROVED
  ACTIVE
  ENDED
  REJECTED
  CANCELLED
  SUPERSEDED

  @@schema("school")
}

enum AppointmentKind {
  DEFINITIVE
  PLT

  @@schema("school")
}

enum AppointmentSource {
  MANUAL
  STAFF_POSITION_MIGRATION

  @@schema("school")
}

enum AppointmentApprovalDecision {
  APPROVED
  REJECTED

  @@schema("school")
}

enum AppointmentMigrationStatus {
  MIGRATED
  QUARANTINED
  SKIPPED

  @@schema("school")
}

model Appointment {
  id                    String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  staffId               String            @map("staff_id") @db.Uuid
  positionId            String            @map("position_id") @db.Uuid
  academicYearId        String            @map("academic_year_id") @db.Uuid
  majorId               String?           @map("major_id") @db.Uuid
  kind                  AppointmentKind   @default(DEFINITIVE)
  status                AppointmentStatus @default(DRAFT)
  effectiveFrom         DateTime          @map("effective_from") @db.Date
  effectiveUntil        DateTime?         @map("effective_until") @db.Date
  reason                String?           @db.Text
  requestedByUserId     String?           @map("requested_by_user_id") @db.Uuid
  approvedAt            DateTime?         @map("approved_at")
  activatedAt           DateTime?         @map("activated_at")
  endedAt               DateTime?         @map("ended_at")
  supersededById        String?           @map("superseded_by_id") @db.Uuid
  replacesAppointmentId String?           @map("replaces_appointment_id") @db.Uuid
  source                AppointmentSource @default(MANUAL)
  sourceStaffPositionId String?           @map("source_staff_position_id") @db.Uuid
  createdAt             DateTime          @default(now()) @map("created_at")
  updatedAt             DateTime          @updatedAt @map("updated_at")

  staff        Staff        @relation(fields: [staffId], references: [id])
  position     Position     @relation(fields: [positionId], references: [id])
  academicYear AcademicYear @relation(fields: [academicYearId], references: [id])
  major        Major?       @relation(fields: [majorId], references: [id])
  approvals    AppointmentApproval[]

  @@index([staffId])
  @@index([positionId, academicYearId])
  @@index([academicYearId, status])
  @@index([sourceStaffPositionId])
  @@map("appointments")
  @@schema("school")
}

model AppointmentApproval {
  id            String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  appointmentId String                      @map("appointment_id") @db.Uuid
  approverUserId String                     @map("approver_user_id") @db.Uuid
  decision      AppointmentApprovalDecision
  note          String?                     @db.Text
  createdAt     DateTime                    @default(now()) @map("created_at")

  appointment Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)

  @@index([appointmentId])
  @@index([approverUserId])
  @@map("appointment_approvals")
  @@schema("school")
}

model AppointmentMigrationReview {
  id                    String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sourceStaffPositionId String?                    @map("source_staff_position_id") @db.Uuid
  userId                String?                    @map("user_id") @db.Uuid
  staffId               String?                    @map("staff_id") @db.Uuid
  positionId            String?                    @map("position_id") @db.Uuid
  academicYearId        String?                    @map("academic_year_id") @db.Uuid
  majorId               String?                    @map("major_id") @db.Uuid
  status                AppointmentMigrationStatus
  reason                String                     @db.Text
  createdAt             DateTime                   @default(now()) @map("created_at")
  reviewedAt            DateTime?                  @map("reviewed_at")
  reviewedByUserId      String?                    @map("reviewed_by_user_id") @db.Uuid

  @@index([status])
  @@index([sourceStaffPositionId])
  @@map("appointment_migration_reviews")
  @@schema("school")
}
```

## Proposed Database Exclusivity

Prisma cannot express PostgreSQL partial unique indexes. The migration must include raw SQL.

Live appointment statuses for uniqueness:

```sql
('PENDING_APPROVAL', 'APPROVED', 'ACTIVE')
```

Drafts do not block uniqueness. Terminal statuses do not block uniqueness.

Recommended indexes:

```sql
CREATE UNIQUE INDEX appointment_unique_school_position_live
ON school.appointments (position_id, academic_year_id)
WHERE major_id IS NULL
  AND status IN ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE');

CREATE UNIQUE INDEX appointment_unique_major_position_live
ON school.appointments (position_id, academic_year_id, major_id)
WHERE major_id IS NOT NULL
  AND status IN ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE');

CREATE UNIQUE INDEX appointment_unique_staff_position_scope_live
ON school.appointments (staff_id, position_id, academic_year_id, COALESCE(major_id, '00000000-0000-0000-0000-000000000000'::uuid))
WHERE status IN ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE');
```

Policy interpretation:

- `KEPALA_SEKOLAH`, WAKA, `KEPALA_TU`, coordinator positions are one live appointment per school/year.
- `KAPROG` is one live appointment per major/year.
- `WAKIL_KOOR_BKK` and `WAKIL_KOOR_HUBIN` should be explicit position catalog rows before allowing deputy capacity. They must not be modelled as multiple holders of `KOOR_BKK` or `KOOR_HUBIN`.
- `PLT` is also exclusive while active. It requires reason and `effectiveUntil`; it cannot be approved if the end date is absent or outside the academic year.

## Approval Policy

Actor checks should use stable identity role plus active appointment lookup:

- `SUPER_ADMIN` can prepare and approve all appointments.
- Only `SUPER_ADMIN` can approve `KEPALA_SEKOLAH`.
- Active `KEPALA_SEKOLAH` can prepare and approve non-`KEPALA_SEKOLAH` appointments.
- Active `KEPALA_SEKOLAH` can prepare next-year appointments, but next-year approved appointments grant no access until ACTIVE.
- A future appointment can be `APPROVED` but must not influence `RolesGuard` or `PermissionsService` until it is `ACTIVE`, in effective date range, and tied to the active academic year.

## Permission and Authorization Resolver

Do not create position-derived `UserPermissionOverride` rows for appointments.

Recommended resolver behavior:

1. `PermissionsService.resolvePermissions()` unions:
   - stable role permissions from `RolePermission`,
   - active appointment permissions from `PositionPermission`,
   - manual user overrides.
2. Manual `UserPermissionOverride(grant=false)` remains a deny that can remove a role or appointment permission.
3. Position-derived permissions are computed at query time from active appointments, not materialized as permanent user overrides.
4. `RolesGuard` becomes async and checks:
   - stable identity roles from JWT for `PRIMARY_ROLES`,
   - active appointment position codes for `POSITION_CODES`.
5. `SUPER_ADMIN` remains stable identity-based and should continue to authorize routes that list `SUPER_ADMIN`.

This lets existing `@Roles('KEPALA_SEKOLAH')` and `@Roles('WAKA_KURIKULUM' as UserRole)` routes recover through appointment truth without reintroducing Keycloak realm roles.

## Migration Classification From StaffPosition

Migration should be idempotent and PII-minimal.

Migrate a legacy `StaffPosition` only when all conditions are true:

- `StaffPosition.positionId`, `staffId`, and `academicYearId` resolve to existing rows.
- `Staff.user.role` is a stable primary role (`SUPER_ADMIN`, `TATA_USAHA`, `GURU`, `SISWA`, `ORANG_TUA`, `INDUSTRI`) or has an approved mapping before migration.
- `Position.scopeType = MAJOR` has `majorId`.
- `Position.scopeType = NONE` has `majorId IS NULL`.
- No live appointment conflict exists under the new partial unique rules.

Status mapping:

- Active academic year + `StaffPosition.isActive = true` -> `Appointment.status = ACTIVE`.
- Future academic year + `StaffPosition.isActive = true` -> `Appointment.status = APPROVED`.
- Past academic year or inactive `StaffPosition` -> `Appointment.status = ENDED`.

Quarantine any row with:

- missing staff/user/position/year,
- mismatched major scope,
- conflicting exclusive position,
- staff user with position-only DB role and no approved stable role mapping,
- ambiguous date range,
- source row already mapped to a different appointment id.

Quarantine must fail closed: no appointment access and no appointment permissions until reviewed.

## Stable Role Mapping For Historical User.role

Do not silently demote `User.role = KEPALA_SEKOLAH`.

Recommended mapping policy:

- If the user has a `Teacher` profile, map stable identity to `GURU`.
- Else if the user has a `Staff` profile, map stable identity to `TATA_USAHA`.
- Else quarantine for Director review.

Operational Keycloak preflight must grant the same stable role in Keycloak before staging QA. The DB migration alone is not enough because JWT roles come from Keycloak.

For the seeded demo principal `kepala@smkdarussalamsubah.sch.id`, the current seed creates `User.role = KEPALA_SEKOLAH`. Wave B implementation must either:

- update seed to create this user with stable role `GURU` or `TATA_USAHA` plus a `KEPALA_SEKOLAH` appointment, or
- move the principal into migration quarantine until the Director approves the mapping.

## TF2 Compatibility Decision

TF2 remains a security dependency for historical `UserPermissionOverride` rows.

Wave B should not infer appointment provenance from old global `UserPermissionOverride(grant=true)`. Those rows are not proof of position appointment. They must be handled by TF2 classification/dry-run or remain manual overrides with explicit review.

Recommended sequencing:

1. Run TF2 PostgreSQL staging-copy dry-run first, or include the same classification evidence as a prerequisite to Wave B dry-run.
2. Wave B appointment resolver computes position permissions from active appointments and does not write appointment grants into `UserPermissionOverride`.
3. Any historical grant that overlaps position permissions but has no approved provenance stays quarantined or manual, never auto-scoped to appointment.

## PostgreSQL Dry-run Evidence Required

Before implementation PR is approved:

1. Apply the migration on a disposable/staging-copy database.
2. Record PII-minimal counts:
   - total `StaffPosition` rows by `academicYearId`, `isActive`, `position.scopeType`,
   - created appointments by status/source,
   - quarantined rows by reason,
   - legacy `User.role` position-code counts by role,
   - historical `UserPermissionOverride` grants/revokes counts by inferred/manual/quarantined class if TF2 data is present.
3. Prove partial unique indexes on real PostgreSQL:
   - two concurrent `KEPALA_SEKOLAH` live appointments same year -> one succeeds, one fails,
   - two concurrent `KAPROG` same major/year -> one succeeds, one fails,
   - two `KAPROG` different majors/year -> both succeed.
4. Prove future Waka has no current access:
   - `APPROVED` future appointment does not satisfy `@Roles('WAKA_KURIKULUM')`,
   - activation remains Wave C.
5. Rehearse rollback on the same disposable copy.

## Implementation Plan After Approval

Suggested Wave B implementation split:

1. Schema/migration and migration dry-run scripts.
2. `AppointmentsModule` service/controller DTOs for draft, submit, approve, reject, cancel, and list.
3. Appointment resolver integrated into `RolesGuard` and `PermissionsService`.
4. `PositionsService` bridge: read current appointments for Struktur Organisasi; keep legacy assign/unassign disabled or route them through appointment service after UI update.
5. Struktur Organisasi UI: replace read-only status dialog with request/approval workflow only after API policy is tested.
6. Tests:
   - policy unit tests,
   - resolver unit tests,
   - migration classifier tests,
   - PostgreSQL concurrency tests,
   - existing Wave A containment tests updated to verify no Keycloak position role mutation.

## Non-goals For Wave B

- No Keycloak position realm role recreation.
- No academic-year activation transaction.
- No Keycloak session logout/outbox.
- No production/staging secret rotation.
- No broad controller authorization rewrite beyond resolver support for existing `@Roles(positionCode)`.

## Gate 0 Approval Needed

Director/reviewer should approve or reject these decisions:

- [ ] Add appointment schema as proposed.
- [ ] Use raw PostgreSQL partial unique indexes for live appointment exclusivity.
- [ ] Compute appointment permissions dynamically instead of writing position-derived `UserPermissionOverride`.
- [ ] Make `RolesGuard` appointment-aware for `POSITION_CODES`.
- [ ] Map historical `User.role = KEPALA_SEKOLAH` to stable identity only through explicit policy; quarantine ambiguous cases.
- [ ] Treat TF2 classification/dry-run as a prerequisite, not as an implicit assumption.
- [ ] Require PostgreSQL staging-copy dry-run before commit/push/PR approval.

Recommended approval statement:

```text
Saya menyetujui Wave B Gate 0 Option A: additive appointment schema, quarantine fail-closed, dynamic appointment permission resolver, explicit stable-role mapping, TF2 compatibility gate, dan PostgreSQL staging-copy dry-run sebelum Git gate.
```
