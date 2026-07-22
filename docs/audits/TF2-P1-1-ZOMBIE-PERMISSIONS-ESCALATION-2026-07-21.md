# TF2-P1-1 Zombie Permissions — Escalation to Director

Date: 2026-07-21
Role: Codex Executor (follow-up to reviewer self-critique)
Status: **OPEN — needs Director decision**
Severity: **P1** (eskalasi ke P0 saat tahun ajaran 2027/2028 diaktifkan tanpa fix)

## Temuan

`UserPermissionOverride` tidak punya kolom tahun ajaran. Saat tahun berganti
tanpa admin klik "Lepas", izin bekas pejabat tetap aktif selamanya sampai
ditolak manual.

## Bukti Kode

### Schema — tidak ada kolom tahun

`packages/database/prisma/schema.prisma:123-135`:

```prisma
model UserPermissionOverride {
  id           String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String     @map("user_id") @db.Uuid
  permissionId String     @map("permission_id") @db.Uuid
  grant        Boolean
  createdAt    DateTime   @default(now()) @map("created_at")
  // TIDAK ADA: academicYearId, expiresAt, staffPositionId
}
```

### Query resolvePermissions — tidak filter tahun

`apps/api/src/permissions/permissions.service.ts:143-174`:

```ts
this.prisma.userPermissionOverride.findMany({
  where: { userId: authUserId },   // ← tidak ada filter tahun
  select: { grant: true, permission: { select: { code: true } } },
})
```

### Cron system — tidak ada

`grep -r "@Cron|@Interval|@Timeout|ScheduleModule.forRoot" apps/api → 0 hasil`.

## Skenario Insiden

1. Tahun 2026/2027 aktif. Pak Budi ditunjuk sebagai `KEPALA_TU` dengan 8 izin
   terkait keuangan → 8 baris `UserPermissionOverride(grant=true)`.
2. Tahun 2027/2028 diaktifkan. Pak Budi tidak ditunjuk kembali sebagai `KEPALA_TU`
   (diganti orang lain). Tidak ada yang klik "✕ Lepas" karena administrasi
   sekolah menganggap "tahun baru = mulai baru".
3. Hasil: `StaffPosition` tahun lama tetap `isActive=true` (kolom ini juga tidak
   di-expire), `UserPermissionOverride` tetap ada → `resolvePermissions` tetap
   mengembalikan 8 izin keuangan untuk Pak Budi.
4. Pak Budi (yang seharusnya sudah tidak punya akses keuangan) tetap bisa membuka
   modul Keuangan. **Ghost permission.**
5. Tidak ada alarm, tidak ada audit trigger. Insiden terdeteksi hanya saat audit
   manual atau saat Pak Budi melakukan sesuatu yang salah.

## Tiga Opsi Remediasi

### Opsi A — Schema Change (paling benar, butuh approval Director)

**Perubahan:**

```prisma
model UserPermissionOverride {
  id              String     @id @default(...)
  userId          String
  permissionId    String
  grant           Boolean
  academicYearId  String?    @map("academic_year_id") @db.Uuid  // NEW
  staffPositionId String?    @map("staff_position_id") @db.Uuid // NEW (traceability)
  createdAt       DateTime   @default(now())

  // Index untuk query by active year
  @@index([userId, academicYearId])
  @@unique([userId, permissionId, academicYearId])
}
```

**Logic changes:**

- `PositionsService.assign()` (`positions.service.ts:172-240`): stamp `academicYearId`
  + `staffPositionId` saat membuat override.
- `PositionsService.unassign()` (`positions.service.ts:245-310`): hapus by
  `[userId, permissionId, academicYearId]` — tidak lagi blanket delete.
- `PermissionsService.resolvePermissions()`: filter by `academicYearId IN (activeYear.id, NULL)`
  — NULL berarti global override (mis. grant khusus di luar tahun).
- Migration backfill: set existing rows `academicYearId = <current_active_year>`.

**Plus:**

- Eliminasi kelas bug sepenuhnya.
- Audit trail jelas (setiap override terkait staff position + tahun).
- Skalabel ke multi-year history.

**Minus:**

- **Schema change forbidden tanpa Director approval** (AGENTS.md: "Do not alter
  the Prisma schema ... without explicit approval").
- Migration blast radius: semua baris existing di-backfill.
- Bila ada override global (di luar tahun), perlu convention `academicYearId = NULL`.

### Opsi B — Application-Level Cascade (tanpa schema change)

**Perubahan:**

- Tambah method `PositionsService.expireOverridesForYear(academicYearId)`:
  ```ts
  async expireOverridesForYear(academicYearId: string) {
    // Hapus semua override yang dibuat untuk tahun ini
    // Heuristik: cari staffPosition isActive=true tahun ini, set false, delete overrides
    // Catatan: tanpa kolom tahun di override, ini best-effort.
  }
  ```
- Panggil saat academic year di-deactivate/rotate (di `school/academic-years` flow).
- Tambah `@nestjs/schedule` dependency + `@Cron('0 0 1 * *')` yearly sweep
  sebagai safety net.

**Plus:**

- Tidak menyentuh schema.
- Bisa diterapkan dalam sesi ini.

**Minus:**

- **Butuh dependency baru `@nestjs/schedule`** — juga dilarang tanpa approval.
- Heuristik tanpa kolom tahun rentan false-positive (override global ikut terhapus).
- Race condition antara assignment baru dan cascade.
- Cron failure = silent zombie kembali.
- Audit trail hilang setelah cascade.

### Opsi C — Defer + Runtime Warning (zero risk now)

**Perubahan:**

- Tambah runtime warning di `accessCheck(userId)`: bila `activePositions` ada dari
  tahun lama tapi tidak ada di tahun aktif, return field `warnings: string[]`.
- Tambah bagian "Operational Runbook" di docs: "SOP Tahun Ajaran Baru" — admin
  WAJIB klik ✕ Lepas di semua penugasan sebelum mengaktifkan tahun baru.
- Catat di residual register sebagai P1 dengan timeline Q3 2026.

**Plus:**

- Zero code change produksi.
- Zero risk.

**Minus:**

- **Insiden pasti terjadi saat 2027/2028 aktif tanpa SOP diikuti.**
- Mengandalkan disiplin manual admin (fragile).
- Tidak menyelesaikan root cause.

## Rekomendasi Executor

**Opsi A** di Wave gate berikutnya (dengan Director approval). Opsi C sebagai
*jangkar* sampai A diterapkan. Opsi B tidak direkomendasikan karena perlu
dependency baru + blast radiusnya lebih besar daripada A.

## Konsekuensi Tindakan vs. Non-Tindakan

| Skenario | Risiko |
|---|---|
| Implement Opsi A sekarang tanpa approval | **Pelanggaran AGENTS.md** — dilarang. |
| Implement Opsi C + dokumen ini | Aman. Insiden tetap mungkin Q3 2026. |
| Tidak melakukan apa-apa | Insiden pasti saat tahun baru diaktifkan. |

## Director Decision Needed

- [ ] Approve Opsi A (schema change) untuk Wave gate berikutnya?
- [ ] Bila ya, kapan jadwalkannya? (Sebelum 2027/2028 aktif = Q3 2026 target.)
- [ ] Bila tidak, pilih Opsi B atau C?

## Path ke Report

`docs/audits/TF2-P1-1-ZOMBIE-PERMISSIONS-ESCALATION-2026-07-21.md` (file ini).
