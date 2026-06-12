# 2J-3 — Wajib-Ortu Enforcement + Consent R-05 + Assign-Parent Wizard DONE

**Branch**: `feat/2J-3-4-siswa-ortu-users-v2`  
**Commit**: `8465879`  
**Tests**: **705 passed / 43 suites** (baseline 690 + 15 baru, 0 regresi)

---

## Ringkasan Perubahan

### Enforcements (POST & PATCH /students)

- **`POST /students`**: `parentId` kini **wajib** di `CreateStudentSchema` (dari `.optional()` → `.uuid()`). Tanpa parentId → Zod reject 400. Operator harus gunakan `/provision/students` (wizard) bila ortu belum ada.
- **`PATCH /students/:id`**: Jika `dto.parentId === null` dan student sudah punya `parentId` di DB → `BadRequestException` 400. Tidak bisa hapus ortu yang sudah terdaftar.

### Migration — consent_at

- **`20260612000002_2J3_consent_assign_parent`**: `ALTER TABLE auth.users ADD COLUMN consent_at TIMESTAMP NULL`
- Field `consentAt DateTime?` ditambah ke Prisma `User` model (schema.prisma)

### Endpoint baru: GET /students/without-parent

- Role: `SUPER_ADMIN`, `TATA_USAHA`
- Permission: `student.read`
- Paginated (page/limit), filter `parentId IS NULL AND deletedAt IS NULL`
- Diperlukan untuk wizard "Tambahkan Orang Tua" di UI 2J-4

### Endpoint baru: PATCH /students/:id/assign-parent

- Role: `SUPER_ADMIN`, `TATA_USAHA`
- Permission: `user.provision`
- Body: `{ ortu: {name, phone, email?}, reuseParentByPhone?: boolean, consent: true }`
- Flow saga:
  1. Cek student ada + belum punya ortu (else 400)
  2. `ProvisioningService.provisionOrtu()` — create/reuse ortu di KC + DB
  3. `$transaction`: update `users.consent_at` + update `student.parentId`
- Gagal KC → tidak ada rollback DB (ortu belum dibuat di DB)

### ProvisionStudentSchema — consent: z.literal(true)

`/provision/students` kini wajib field `consent: true`. Operator mengkonfirmasi persetujuan data sebelum provisioning. `consent_at` dicatat di `auth.users` saat siswa dibuat.

### ProvisioningService.provisionOrtu()

Method publik baru — mengekstrak logika pembuatan akun ortu dari `provisionStudent()` untuk digunakan oleh `StudentService.assignParent()`. Mendukung dedup via `reuseByPhone`.

---

## Files

### Baru
- `apps/api/src/student/dto/assign-parent.dto.ts` — `AssignParentSchema` (consent wajib, phoneE164)
- `packages/database/prisma/migrations/20260612000002_2J3_consent_assign_parent/migration.sql`

### Dimodifikasi
- `apps/api/src/student/dto/create-student.dto.ts` — parentId jadi wajib
- `apps/api/src/student/student.controller.ts` — +`findWithoutParent` + `assignParent`
- `apps/api/src/student/student.service.ts` — +`ProvisioningService` inject, `findWithoutParent`, `assignParent`, guard update
- `apps/api/src/student/student.module.ts` — import `ProvisioningModule`
- `apps/api/src/provisioning/provisioning.service.ts` — `provisionOrtu()` publik, `TempCredential` di-export, `consentAt` di `provisionStudent()`
- `apps/api/src/provisioning/provisioning.module.ts` — `exports: [ProvisioningService]`
- `apps/api/src/provisioning/dto/provision.dto.ts` — `consent: z.literal(true)` pada `ProvisionStudentSchema`
- `packages/database/prisma/schema.prisma` — `consentAt DateTime?` di `User`

---

## Bukti Runtime

### Gerbang penuh (lokal)

```
$ npx tsc --noEmit          → exit 0 (0 error)
$ npx eslint src --ext .ts  → exit 0 (0 error, 0 warning)
$ npx nest build            → exit 0
$ npx jest
Test Suites: 43 passed, 43 total
Tests:       705 passed, 705 total
Snapshots:   0 total
Time:        ~55s
```

### Test baru (15)

```
PASS src/__tests__/student.spec.ts
  StudentService — 2J-3 guard parentId null
    ✓ parentId: null dengan ortu sudah ada → BadRequestException
    ✓ parentId: null dengan ortu belum ada → boleh (update berhasil)
  StudentService — findWithoutParent
    ✓ mengembalikan siswa tanpa parentId dengan pagination
    ✓ halaman 2 menggunakan skip yang benar
  StudentService — assignParent
    ✓ student sudah punya ortu → BadRequestException
    ✓ student tidak ditemukan → NotFoundException
    ✓ sukses: ortu baru dibuat, student diperbarui, consent_at dicatat
  StudentController
    ✓ findWithoutParent — delegasi ke service dengan pagination
    ✓ findWithoutParent — query tidak valid → BadRequestException
    ✓ assignParent — delegasi ke service dengan actor dari CurrentUser
  CreateStudentSchema — 2J-3 parentId wajib
    ✓ tanpa parentId → invalid (Zod reject)
    ✓ dengan parentId valid → valid (Zod parse sukses)
PASS src/__tests__/provisioning.spec.ts
  ProvisionStudentSchema — consent wajib true
    ✓ consent: true → valid (Zod parse sukses)
    ✓ consent: false → invalid (Zod reject)
    ✓ consent absent → invalid (Zod reject)
```

---

## Checklist

- [x] `npx tsc --noEmit` — **0 error**
- [x] `npx eslint src --ext .ts` — **0 error**
- [x] `npx nest build` — hijau
- [x] `npx jest` — **705 passed / 43 suites**, 0 regresi dari baseline 690
- [x] Migration SQL dibuat (consent_at TIMESTAMP NULL)
- [x] Prisma schema diperbarui + `npx prisma generate` dijalankan
- [x] Branch `feat/2J-3-4-siswa-ortu-users-v2` — commit `8465879`

## TODO berikutnya (2J-4)

- `GET /users/grouped`, `GET /users?role=&q=&cursor=`, `GET /users/:id/effective-permissions`
- `GET /auth/me` extended dengan `permissions: string[]`
- Frontend: Users v2 accordion 7 role, SiswaForm wizard, lib/permissions.ts `can()`, sidebar permission-gated
- Smoke test via inspector account
