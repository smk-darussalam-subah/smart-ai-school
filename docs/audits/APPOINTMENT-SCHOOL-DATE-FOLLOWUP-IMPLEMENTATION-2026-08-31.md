# Appointment School-Date Follow-up Implementation

Tanggal: 2026-08-31

Peran: Executor

Status: **FOLLOW-UP CLOSED; READY FOR INDEPENDENT SOURCE RE-REVIEW; GIT, STAGING, MAIN, DAN PRODUCTION HOLD**

## Baseline dan batas kerja

- Branch: `fix/appointment-school-date-20260831`.
- Baseline/head tanpa commit: `origin/develop@5da6c9b0580d7175fba4f6194d5dd14797f6fa57`.
- Baseline tree: `be5ff7c6f11c642a7b95534a08bfe74eba6832f9`.
- `origin/develop` dan `origin/staging` tetap memiliki tree yang identik pada pemeriksaan akhir.
- Open PR: `0`.
- Tidak ada stage, commit, push, PR, deploy, staging mutation, production mutation, token, systemd, Keycloak, n8n, schema, migration, dependency, web, Help, atau artifact delta.

## Root cause dan reproduksi

Consumer Appointment membentuk tanggal efektif dari komponen UTC host. Pada instant
`2026-08-30T17:15:00.000Z` atau `2026-08-31 00:15 WIB`, implementasi lama menghasilkan
`2026-08-30`, sedangkan tanggal sekolah yang benar adalah `2026-08-31`. Akibatnya scheduler
dapat mengaktifkan appointment pada tanggal yang benar hanya setelah 07:00 WIB, dan resolver
permission, projection jabatan, serta scope KAPROG dapat mengalami keterlambatan yang sama.

Reproduksi sebelum perubahan:

```json
{
  "instant": "2026-08-30T17:15:00.000Z",
  "utcDate": "2026-08-30",
  "jakartaSchoolDate": "2026-08-31",
  "defect": true
}
```

## Implementasi

### Shared helper

`getSchoolDate(now)` adalah helper murni dengan kontrak berikut:

- timezone eksplisit `Asia/Jakarta`;
- ekstraksi `year/month/day` melalui `Intl.DateTimeFormat.formatToParts()`;
- validasi input dan calendar round-trip;
- hasil berupa UTC midnight agar tetap kompatibel dengan kolom tanggal Prisma/PostgreSQL;
- menerima instant eksplisit atau default `new Date()`;
- tidak bergantung pada timezone host dan tidak menambah dependency.

### Consumer map

| Consumer | Perubahan |
|---|---|
| `AppointmentsService` | Semua effective/due checks memakai school date. Aktivasi due, annual cutover, end, successor, supersede, allowed actions, dan validasi tahun memakai satu `now`/`schoolDate` per operasi. Successor kedaluwarsa dibatalkan secara fail-closed sebelum kandidat sah dicari; boundary akhir hari ini tetap inklusif. |
| `PermissionsService` | Active position codes dan appointment-derived permissions memakai school date yang sama. Cache entry dibatasi pada school date yang sama agar cache sebelum tengah malam tidak menunda authority. |
| `PositionsService` | Struktur, sidebar `my positions`, access check, dan `isEffectiveNow` memakai school date. |
| `resolveActiveKaprogMajorScope` | Scope KAPROG memakai school date dan tetap fail-closed untuk user/year/major yang tidak valid. |
| Migration classifier | Default implicit `asOf` memakai school date; explicit `asOf` tetap menang tanpa perubahan kontrak. |
| `SchoolConfigService` | Caller annual cutover menangkap satu `now` segera setelah advisory lock diperoleh dan meneruskannya ke helper aktivasi dalam transaksi create/update. |
| `RolesGuard` | Tidak diubah; regresi membuktikan dynamic position authority tetap melalui `PermissionsService`. |
| Teacher attendance | Dibaca sebagai pola pembanding dan tidak diubah karena bukan consumer Appointment. |

Advisory lock tetap `pg_advisory_xact_lock(hashtext('appointment_due_activation'))`. Lock tetap
diambil sebelum `now`, active-year read, dan mutasi. Bentuk response automation tetap tepat empat count aman:
`endedCount`, `cancelledCount`, `activatedCount`, dan `affectedUserCount`.

## Closure temuan re-review

### P1 - Successor kedaluwarsa

- Successor `APPROVED` definitif dengan `effectiveUntil < schoolDate` diubah menjadi
  `CANCELLED` dengan `endedAt` dan alasan terstruktur sebelum pencarian kandidat aktif.
- Query aktivasi successor mensyaratkan `effectiveFrom <= schoolDate` serta
  `effectiveUntil IS NULL OR effectiveUntil >= schoolDate`.
- Status `CANCELLED` melepaskan partial unique slot `replacesAppointmentId`, tidak menghitung
  kapasitas `ACTIVE`, dan memungkinkan successor sah berikutnya disiapkan.
- Regresi membuktikan successor yang berakhir kemarin tidak pernah menerima status `ACTIVE`,
  sedangkan successor yang berakhir tepat hari ini tetap diaktifkan.

### P2 - Instant sebelum advisory lock

- Scheduler tidak lagi menangkap waktu sebelum transaksi. `now` diambil sebagai statement
  pertama setelah `acquireActivationLock()` selesai.
- Jalur create dan update tahun ajaran menerapkan urutan yang sama, lalu meneruskan instant
  tunggal itu ke `applyAcademicYearActivation()`.
- Tiga deferred-lock fake-clock regression memulai operasi pada `23:59:59.999 WIB`, menahan
  lock, melepasnya pada `00:00 WIB`, dan membuktikan seluruh query/cutover memakai tanggal baru.

## Boundary matrix

| Instant UTC | WIB | Expected school date | Hasil |
|---|---|---|---|
| `2026-08-30T16:59:59.999Z` | 23:59:59.999 | `2026-08-30` | PASS |
| `2026-08-30T17:00:00.000Z` | 00:00 | `2026-08-31` | PASS |
| `2026-08-30T17:15:00.000Z` | 00:15 | `2026-08-31` | PASS |
| `2026-08-30T23:59:59.999Z` | 06:59:59.999 | `2026-08-31` | PASS |
| `2026-08-31T00:00:00.000Z` | 07:00 | `2026-08-31` | PASS |
| `2026-08-31T17:15:00.000Z` | month rollover | `2026-09-01` | PASS |
| `2026-12-31T17:15:00.000Z` | year rollover | `2027-01-01` | PASS |
| `2028-02-28T17:15:00.000Z` | leap date | `2028-02-29` | PASS |

Process `TZ=UTC` tidak mengubah hasil. Lifecycle projection juga membuktikan:

- due hari ini: effective;
- future: tidak effective;
- `effectiveUntil` kemarin: expired;
- `effectiveUntil` hari ini: tetap effective secara inklusif.

Pada instant 00:15 WIB, scheduler, appointment permissions, active position codes,
Positions projection/sidebar, KAPROG scope, dan migration classifier seluruhnya memakai
`2026-08-31T00:00:00.000Z`.

## Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| Focused helper/Appointment/permission/position/KAPROG/roles/school-config | 7 suite / 157 test PASS |
| Full API, termasuk seluruh broader regression | 69 suite PASS, 1 existing skipped; 1,331 test PASS, 4 existing skipped |
| API type-check | PASS |
| API lint | PASS |
| API production build | PASS |
| Shared package build (`auth`, `logger`, `types`) | PASS |
| `git diff --check` | PASS |
| Legacy UTC Appointment consumer scan | Tidak ditemukan |
| Secret/high-entropy credential pattern scan | Bersih |

Regresi khusus juga membuktikan:

- successor kedaluwarsa dibatalkan sebelum kandidat sah dicari dan tidak pernah diaktifkan;
- successor dengan `effectiveUntil` tepat pada school date masih aktif secara inklusif;
- scheduler, create-year, dan update-year memakai instant setelah deferred lock melewati tengah malam WIB;
- retry kedua `activate-due` menghasilkan empat count nol dan tidak mengulang update;
- advisory lock dipanggil sebelum query tahun aktif pada tiap run;
- cache invalidation affected users tetap dilakukan setelah commit;
- cache permission tidak digunakan lintas pergantian school date;
- one-active-year ambiguity tetap fail-closed;
- manual revoke tetap menang atas permission dari Appointment.

## Manifest perubahan

1. `apps/api/src/common/helpers/school-date.helper.ts`
2. `apps/api/src/common/helpers/appointment-scope.helper.ts`
3. `apps/api/src/appointments/appointments.service.ts`
4. `apps/api/src/appointments/appointment-migration.classifier.ts`
5. `apps/api/src/permissions/permissions.service.ts`
6. `apps/api/src/positions/positions.service.ts`
7. `apps/api/src/school-config/school-config.service.ts`
8. `apps/api/src/__tests__/school-date.helper.spec.ts`
9. `apps/api/src/__tests__/appointment-scope.helper.spec.ts`
10. `apps/api/src/__tests__/appointments.spec.ts`
11. `apps/api/src/__tests__/permissions.spec.ts`
12. `apps/api/src/__tests__/positions.spec.ts`
13. `apps/api/src/__tests__/school-config.spec.ts`
14. `docs/audits/APPOINTMENT-SCHOOL-DATE-FOLLOWUP-IMPLEMENTATION-2026-08-31.md`

## Runtime, freeze, dan residual risk

- Tidak ada browser QA karena tidak ada web/UI delta.
- Tidak ada one-shot staging atau production proof pada source gate ini; itu tetap gate sesudah Git delivery dan exact-SHA staging deployment.
- Tidak ada PostgreSQL migration atau schema delta. Advisory lock SQL tidak berubah; unit regression membuktikan lock ordering dan retry idempotency. Runtime concurrency tetap harus direview pada staging one-shot gate.
- Wave 9 screenshot, PDF, deck, Help, claim ledger, dan artifact binary tidak berubah. Artifact preservation layak dinilai reviewer melalui backend-only exact-SHA addendum; old frozen SHA tidak boleh disebut sebagai final production SHA setelah fix dipromosikan.
- Review preflight/Gate 1 tanggal 2026-08-31 yang mendahului penemuan P1 ini dinyatakan **superseded** dan tidak boleh dipakai sebagai approval produksi.
- Gate 1 production dan Gate 2 timer activation tetap HOLD serta memerlukan approval baru yang terikat exact SHA hasil fix.

## Handoff

Executor berhenti pada **Independent Reviewer source gate**. Worktree tidak memiliki staged file.
