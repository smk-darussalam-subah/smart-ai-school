# TASK AKTIF — SMA-9 [W2-01] Keycloak Configuration

**Ditetapkan oleh:** Cowork AI
**Tanggal:** 2026-05-25
**Linear Issue:** SMA-9
**Priority:** 🔴 High — memblokir auth flow di apps/api dan apps/web
**Estimasi:** 2–3 jam

---

## Konteks

Keycloak sudah berjalan sebagai Docker container di `infrastructure/docker/docker-compose.yml`
service name: `keycloak`, port: `8080`.

Yang belum ada:
- Realm `diis` belum dibuat
- Client `diis-web` dan `diis-api` belum dikonfigurasi
- Roles 6 DIIS belum dibuat
- Export realm config untuk reproducibility

Packages/auth sudah siap menerima JWKS dari Keycloak:
- `packages/auth/src/index.ts` → `verifyKeycloakToken()` via JWKS endpoint
- JWKS URL format: `http://localhost:8080/realms/diis/protocol/openid-connect/certs`

---

## Tugas Claude Code

### Task 1 — Buat Keycloak Realm Export (JSON)

Buat file `infrastructure/keycloak/realm-diis.json` berisi realm config lengkap yang bisa di-import via Keycloak Admin UI atau API.

Realm config harus include:
```json
{
  "realm": "diis",
  "displayName": "DIIS SMK Darussalam Subah",
  "enabled": true,
  "accessTokenLifespan": 28800,
  "ssoSessionMaxLifespan": 28800,
  "clients": [
    {
      "clientId": "diis-web",
      "name": "DIIS Web Portal",
      "rootUrl": "http://localhost:3000",
      "redirectUris": ["http://localhost:3000/*"],
      "webOrigins": ["http://localhost:3000"],
      "publicClient": false,
      "protocol": "openid-connect",
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": false
    },
    {
      "clientId": "diis-api",
      "name": "DIIS API Server",
      "bearerOnly": true,
      "publicClient": false,
      "protocol": "openid-connect"
    }
  ],
  "roles": {
    "realm": [
      { "name": "SUPER_ADMIN" },
      { "name": "KEPALA_SEKOLAH" },
      { "name": "GURU" },
      { "name": "SISWA" },
      { "name": "ORANG_TUA" },
      { "name": "INDUSTRI" }
    ]
  },
  "users": [
    // Buat 1 user default SUPER_ADMIN untuk testing awal
    {
      "username": "admin",
      "email": "admin@smk-darussalam.sch.id",
      "enabled": true,
      "credentials": [{ "type": "password", "value": "Admin@DIIS2026!", "temporary": true }],
      "realmRoles": ["SUPER_ADMIN"]
    }
  ]
}
```

### Task 2 — Update docker-compose.yml untuk Auto-Import Realm

Tambahkan environment variable ke service Keycloak di docker-compose.yml agar realm di-import otomatis saat container pertama kali start:

```yaml
keycloak:
  environment:
    - KEYCLOAK_IMPORT=/opt/keycloak/data/import/realm-diis.json
  volumes:
    - ./infrastructure/keycloak:/opt/keycloak/data/import:ro
```

Pastikan tidak breaking service lain yang sudah ada.

### Task 3 — Buat Panduan Setup Keycloak

Buat `docs/deployment/keycloak-setup.md` dengan instruksi lengkap:
1. Start container: `docker compose up keycloak -d`
2. Akses Admin Console: http://localhost:8080
3. Login dengan KEYCLOAK_ADMIN credentials dari .env
4. Import realm (jika auto-import gagal): Admin → Import realm → upload realm-diis.json
5. Generate client secret untuk `diis-web`:
   - Clients → diis-web → Credentials → Regenerate secret
   - Copy secret ke `apps/web/.env.local` sebagai `KEYCLOAK_CLIENT_SECRET`
6. Test JWKS endpoint: `curl http://localhost:8080/realms/diis/protocol/openid-connect/certs`
7. Test token: `curl -X POST http://localhost:8080/realms/diis/protocol/openid-connect/token`

### Task 4 — Buat .env.example Update

Pastikan `.env.example` di root sudah include semua Keycloak variables yang diperlukan.

---

## Definition of Done

- [ ] `infrastructure/keycloak/realm-diis.json` valid dan lengkap
- [ ] `docker-compose.yml` updated dengan volume mount untuk realm import
- [ ] `docs/deployment/keycloak-setup.md` tersedia dan akurat
- [ ] `.env.example` include semua Keycloak variables
- [ ] TypeScript compile bersih: `npx tsc --noEmit` di apps/api dan apps/web
- [ ] Tidak ada file yang dihapus atau diubah di luar scope task ini

---

## File yang Perlu Dibaca

- `infrastructure/docker/docker-compose.yml` — lihat service keycloak yang sudah ada
- `packages/auth/src/index.ts` — lihat cara JWKS digunakan
- `apps/api/src/auth/guards/keycloak.guard.ts` — lihat integrasi guard
- `apps/web/src/lib/auth.ts` — lihat NextAuth Keycloak config

---

## Laporan Akhir

Setelah selesai, tulis ringkasan di bawah ini:

```
STATUS: [SELESAI / PARTIAL / BLOCKED]
FILES CREATED: [list file yang dibuat]
FILES MODIFIED: [list file yang diubah]
CATATAN: [hal penting yang perlu diketahui Kang]
BLOCKING: [jika ada yang memblokir]
```
