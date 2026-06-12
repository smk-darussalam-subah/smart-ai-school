# 2J-1 + 2J-2 — KeycloakAdminService + Provisioning 7-Role DONE

**Branch**: `feat/2J-1-2-keycloak-provisioning`  
**Base**: `develop` (HEAD `6efc0f9`)  
**Commits**: `9ee4d37` (2J-1) + `a408f09` (2J-2) + `b682ac5` (done-report) + 1 commit verifikasi lokal (lint cleanup + bukti runtime)  
**Tests**: **690 passed / 43 suites — SEMUA hijau** (baseline develop 645 + 45 baru, 0 regresi; diverifikasi LOKAL pasca `prisma generate`)

> Catatan verifikasi lokal (2026-06-12): eksekusi awal di cloud melaporkan 637 passed
> dengan 4 suite gagal karena Prisma client belum di-generate di environment cloud.
> Setelah `prisma generate` di lokal: seluruh 43 suite hijau. Sesi lokal juga
> menutup 10 error eslint (dead code/unused imports) + 2 error tsc (`ProvisionResult`
> belum di-export) yang lolos di cloud, plus perbaikan minor `clearTimeout` pada
> jalur retry-5xx KeycloakAdminService.

---

## Ringkasan 2J-1 — KeycloakAdminService

### Files baru
- `apps/api/src/keycloak-admin/keycloak-admin.types.ts` — `KcUserRepresentation`, `KcRoleRepresentation`, `CreateKcUserInput`, `KcTokenResponse`, `KcTokenCache`
- `apps/api/src/keycloak-admin/keycloak-admin.service.ts` — Service dengan token cache (client_credentials), fetch + AbortController 10 dtk, fail-closed 503, retry 1× 5xx, 401 refresh paksa
- `apps/api/src/keycloak-admin/keycloak-admin.module.ts` — Provider + export
- `apps/api/src/__tests__/keycloak-admin.spec.ts` — 12 tests
- `docs/runbooks/keycloak-service-account.md` — Runbook enable service account di prod (GUI + kcadm.sh)

### Files dimodifikasi
- `infrastructure/keycloak/realm-diis.json` — Client `diis-api`: `bearerOnly: false`, `serviceAccountsEnabled: true`
- `apps/api/src/app.module.ts` — + import KeycloakAdminModule + ProvisioningModule

### Metode KeycloakAdminService
`createUser`, `setTempPassword`, `assignRealmRole`, `removeRealmRole`, `setEnabled`, `findByUsername`, `findByEmail`, `getUserRealmRoles`, `deleteUser` (kompensasi saga saja)

---

## Ringkasan 2J-2 — Provisioning + FIX A4

### Files baru
- `apps/api/src/common/helpers/phone.ts` — `normalizePhoneE164`, `normalizeOrThrow`, `phoneE164` (Zod)
- `apps/api/src/__tests__/phone.spec.ts` — 14 tests (0812→+62, 62→+62, spasi/strip/titik/kurung, invalid pendek/panjang/huruf)
- `apps/api/src/provisioning/dto/provision.dto.ts` — `ProvisionUserSchema`, `ProvisionStudentSchema` (Zod strict)
- `apps/api/src/provisioning/provisioning.service.ts` — `provisionUser`, `provisionStudent` (saga terkompensasi)
- `apps/api/src/provisioning/provisioning.controller.ts` — `POST /provision/users`, `POST /provision/students`
- `apps/api/src/provisioning/provisioning.module.ts`
- `apps/api/src/__tests__/provisioning.spec.ts` — 12 tests

### Files dimodifikasi
- `apps/api/src/users/users.service.ts` — **FIX A4**: updateRole KC-first (assign+remove), kompensasi DB gagal, C3-(a) last-SA lockout, C3-(b) multi-role detection via KC; updateActive KC-first (setEnabled), kompensasi, last-SA lockout
- `apps/api/src/users/users.module.ts` — + import KeycloakAdminModule, PermissionModule
- `apps/api/src/audit-log/interceptors/audit.interceptor.ts` — `SENSITIVE_SUBSTRINGS` + `'phone'`
- `packages/database/prisma/seed-permissions.ts` — + `{code:'user.provision', module:'users'}`; assign ke TATA_USAHA
- `apps/api/src/__tests__/users.spec.ts` — +6 tests (KC sync, role-sama early-return, kompensasi, last-SA, multi-role)
- `apps/api/src/__tests__/audit-interceptor.spec.ts` — +1 test (phone/parentPhone redacted)

### Kebijakan username
| Role | Username |
|---|---|
| SISWA | NIS |
| GURU | email |
| TATA_USAHA | email |
| KEPALA_SEKOLAH | email |
| SUPER_ADMIN | email |
| ORANG_TUA | phone E.164 |
| INDUSTRI | email |

### Email sintetis (C1)
- Siswa tanpa email: `{nis}@siswa.smkdarussalamsubah.sch.id`
- Ortu tanpa email: `{phoneTanpaPlus}@ortu.smkdarussalamsubah.sch.id`

---

## Bukti Runtime (LOKAL — Windows dev machine, 2026-06-12)

### Gerbang penuh
```
$ npx tsc --noEmit          → exit 0 (0 error)
$ npx eslint src --ext .ts  → exit 0 (0 error, 0 warning)
$ npx nest build            → exit 0
$ npx jest
Test Suites: 43 passed, 43 total
Tests:       690 passed, 690 total
Snapshots:   0 total
Time:        55.25 s
Ran all test suites.
```
`npx jest --detectOpenHandles` → 0 handle bocor (warning "worker process has failed
to exit gracefully" yang kadang muncul = artefak teardown flaky antar-worker,
tidak muncul saat deteksi handle aktif — bukan dari kode baru).

### Output mentah test kunci (saga-kompensasi · dedup-E.164 · last-SA · A4-sync)
```
PASS src/__tests__/provisioning.spec.ts
  √ guru sukses → urutan KC(create→role→pw)→DB benar
  √ TU provision SUPER_ADMIN → 403
  √ TU provision GURU → sukses
  √ DB gagal → deleteUser KC untuk user BARU saja
  √ SISWA via /provision/users → 400 (Zod refine)
  √ email sintetis ortu tanpa email
  √ tempPassword tak pernah masuk argumen logger
  √ siswa+ortu baru → 2 createUser + parentId terisi
  √ ortu existing (input 0812 match DB +628...) → 1 createUser saja
  √ NIS duplikat → 409 pre-flight (KC tidak dipanggil)
  √ gagal KC siswa → hapus KC ortu baru saja, TANPA hapus ortu existing
  √ email sintetis siswa benar: {nis}@siswa.smkdarussalamsubah.sch.id
PASS src/__tests__/users.spec.ts (A4/A4b/C3)
  √ berhasil ubah role — sync KC (assign + remove)
  √ role sama → early-return tanpa menyentuh KC maupun update DB
  √ kompensasi saat DB gagal — kembalikan role KC
  √ last-SA demote → 409 ConflictException
  √ multi-role KC → 409 ConflictException
  √ berhasil nonaktifkan — KC-first + invalidasi cache
  √ kompensasi saat DB gagal — restore KC enabled
  √ last-SA deactivate → 409 ConflictException
```
Suite baru lain: `keycloak-admin.spec.ts` 12 test (token cache/refresh, Location
parse, 5xx retry→503 fail-closed, role name→id, no password leak),
`phone.spec.ts` 14 test (E.164 edge: 08/62/+62/spasi/strip/titik/kurung),
`audit-interceptor.spec.ts` +1 (phone/parentPhone → [REDACTED]).

### Verifikasi staging (untuk Director)
```bash
# 1. Token client credentials
curl -s -X POST "https://auth.smkdarussalamsubah.sch.id/realms/diis/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=diis-api" \
  -d "client_secret=$KEYCLOAK_API_CLIENT_SECRET" | jq .

# 2. Provision guru uji
TOKEN=$(curl -s ... | jq -r '.access_token')
curl -s -X POST "https://api.smkdarussalamsubah.sch.id/api/v1/provision/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"GURU","fullName":"Guru Uji","email":"guru-uji@smkdarussalamsubah.sch.id"}' | jq .

# 3. Login sebagai user baru (via browser — gunakan tempPassword dari respons)
# 4. Matikan Keycloak → provision harus return 503 (ServiceUnavailableException)
```

---

## Trade-off & Keputusan

1. **`bearerOnly: false` untuk `diis-api`** — Konsekuensi teknis: client ini sekarang bisa digunakan untuk login interaktif bila `standardFlowEnabled` diaktifkan. Saat ini `standardFlowEnabled: false` jadi tidak ada risiko. Dicatat di runbook.
2. **`getUserRealmRoles` dibutuhkan C3-(b)** — Deteksi multi-role via KC API, bukan DB, karena role KC adalah sumber kebenaran. Konsekuensi: 1 extra API call per updateRole.
3. **DTO tanpa `gender`/`birthDate`/`address`** — Keputusan user (Fakta #13). Akan ditambahkan di TODO 2J-3/2J-4 bila diminta.
4. **`normalizeOrThrow` vs Zod `phoneE164`** — Dua jalur validasi: `normalizeOrThrow` untuk service code (BadRequestException), `phoneE164` untuk DTO Zod (ZodIssue). PhoneValidationError di-catch oleh Zod transform.

---

## TODO DITUNDA (sesuai RFC)

| Item | Target | Catatan |
|---|---|---|
| UI 7-tab provision | 2J-4 | Frontend form + role selector |
| Wajib-ortu create-student lama | 2J-3 | Backfill students tanpa ortu |
| Kirim kredensial via WA | Keputusan Director C4 | **TIDAK diimplement** (sesuai instruksi). Default saat ini = C4-(a) sekali-tampil di layar admin; opsi (b) kirim via Fonnte menunggu keputusan Director |
| Field gender/birthDate/address | TBD | Akan ditambah bila diminta Director |
| Re-seed permissions pasca-merge | Runbook | `npx ts-node packages/database/prisma/seed-permissions.ts` |
| Runbook enable service account | Manual (prod) | `docs/runbooks/keycloak-service-account.md` — jalankan SEKALI |

---

## Checklist penutupan
- [x] `npx tsc --noEmit` — **0 error mutlak** (diverifikasi lokal)
- [x] `npx eslint src --ext .ts` — **0 error** (10 temuan cloud diperbaiki lokal, tanpa suppress)
- [x] `npx nest build` — hijau
- [x] `npx jest` — **690 passed / 43 suites**, 0 regresi dari baseline 645
- [x] Commit serial (2J-1 → 2J-2 → done-report → verifikasi lokal)
- [x] Branch `feat/2J-1-2-keycloak-provisioning` pushed
- [ ] Draft PR ke `develop` — link menyusul di bawah
- [x] `.tasks/queue.md` — TIDAK DISENTUH (diverifikasi: `git diff develop...HEAD -- .tasks/queue.md` kosong)
