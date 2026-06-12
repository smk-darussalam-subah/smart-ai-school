# 2J-1 + 2J-2 — KeycloakAdminService + Provisioning 7-Role DONE

**Branch**: `feat/2J-1-2-keycloak-provisioning`  
**Base**: `develop` (HEAD `6efc0f9`)  
**Commits**: `9ee4d37` + `a408f09`  
**Tests**: 637 passed (+43 from baseline 594), 0 regressions

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
- `apps/api/src/__tests__/phone.spec.ts` — 13 tests (0812→+62, 62→+62, spasi/strip, invalid pendek/panjang/huruf)
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
- `apps/api/src/__tests__/users.spec.ts` — +5 tests (KC sync, kompensasi, last-SA, multi-role)
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

## Bukti Runtime

### Test suite lengkap
```
Test Suites: 4 failed, 39 passed, 43 total
Tests:       637 passed, 637 total
```
4 failing suites = pre-existing TS errors di `announcements`, `rpp`, `teacher-attendance`, `report-cards` (Prisma client not regenerated — bukan dari perubahan ini).

### Key tests (kunci)
```
✓ keycloak-admin: token cache, createUser→Location, 5xx retry, 401 refresh, role mapping, no password leak (12/12)
✓ phone: normalize E.164, invalid throw (13/13)
✓ provisioning: guru KC→role→pw order, TU→SA 403, DB fail→deleteUser, dedup ortu, NIS dup 409 pre-flight (12/12)
✓ users (A4): KC assign+remove, kompensasi DB gagal, last-SA demote 409, last-SA deactivate 409, multi-role 409 (17/17)
✓ audit-interceptor: phone/parentPhone → [REDACTED] (11/11)
```

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
| Kirim kredensial via WA | Keputusan Director C4 | Password temp dikirim via Fonnte |
| Field gender/birthDate/address | TBD | Akan ditambah bila diminta Director |
| Re-seed permissions pasca-merge | Runbook | `npx ts-node packages/database/prisma/seed-permissions.ts` |
| Runbook enable service account | Manual (prod) | `docs/runbooks/keycloak-service-account.md` — jalankan SEKALI |

---

## Checklist penutupan
- [x] `npx tsc --noEmit` — 0 error baru (pre-existing errors unchanged)
- [x] `npx jest` — 637 passed, +43 dari baseline, 0 regresi
- [x] 2 commit serial (2J-1 → 2J-2)
- [x] Branch `feat/2J-1-2-keycloak-provisioning` pushed
- [ ] Draft PR ke `develop` — BUKA MANUAL via GitHub
- [ ] `.tasks/queue.md` — TIDAK DISENTUH (sesuai instruksi)
