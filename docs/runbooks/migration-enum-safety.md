# Runbook: Enum Migration Safety (R-19)

> **Status:** Verified — 2026-07-07
> **Severity:** LOW (documentation + verification)

## Problem

PostgreSQL `ALTER TYPE ... ADD VALUE` statements **cannot be rolled back** inside a transaction. If a migration that adds enum values fails midway through, the enum values that were already added cannot be removed without dropping the entire type (which is a destructive operation).

Prisma detects `ALTER TYPE ... ADD VALUE` and automatically runs these statements **outside** a transaction. This means:

- ✅ The migration won't fail due to transaction restrictions
- ⚠️ But if the migration fails after some values are added, those values persist in the database
- ⚠️ Re-running the migration would fail with "enum value already exists" **unless** `IF NOT EXISTS` is used

## Mitigation Strategy

### 1. Always use `IF NOT EXISTS`

Every `ALTER TYPE ... ADD VALUE` statement **MUST** include `IF NOT EXISTS`:

```sql
-- ✅ CORRECT — idempotent, safe to re-run
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'BENDAHARA';

-- ❌ WRONG — will fail on re-run if value already exists
ALTER TYPE "auth"."UserRole" ADD VALUE 'BENDAHARA';
```

### 2. Backup before enum migrations

Always create a database backup before running a migration that modifies enum types:

```bash
./scripts/backup-db.sh
```

### 3. Never remove enum values in production

Removing an enum value that's in use is a **breaking change**. PostgreSQL does not support `ALTER TYPE ... DROP VALUE` directly — you would need to:

1. Create a new enum type without the unwanted value
2. Migrate all columns to the new type
3. Drop the old type
4. Rename the new type

This is risky and should be avoided. Instead, leave unused enum values in place — they have no side effects.

### 4. Unused enum values are safe

Enum values that were added but are never used in any row are harmless. They don't affect performance, data integrity, or application behavior. There is no need to clean them up.

## Verification: Migration R-23

Migration `20260707000001_r23_userrole_position_codes` was verified on 2026-07-07:

- ✅ All 12 `ALTER TYPE ... ADD VALUE` statements use `IF NOT EXISTS`
- ✅ Migration is idempotent — safe to re-run
- ✅ No rollback needed — unused enum values are harmless

```sql
-- Verified statements (all use IF NOT EXISTS):
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKA_KURIKULUM';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKA_KESISWAAN';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKA_HUMAS';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKA_SARPRAS';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'KEPALA_TU';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'KAPROG';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'KOOR_BKK';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'KOOR_HUBIN';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'GURU_BK';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'BENDAHARA';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'STAF_KEPEGAWAIAN';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'OPERATOR_DAPODIK';
```

## Checklist for Future Enum Migrations

Before creating a migration that modifies PostgreSQL enum types:

- [ ] Every `ADD VALUE` uses `IF NOT EXISTS`
- [ ] Database backup created (`./scripts/backup-db.sh`)
- [ ] No `DROP VALUE` statements (use new type migration instead)
- [ ] Migration tested on staging before production
- [ ] Application code updated to handle new enum values
