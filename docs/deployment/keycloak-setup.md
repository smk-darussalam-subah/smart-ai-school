# Keycloak Setup — DIIS SMK Darussalam Subah

Panduan konfigurasi Keycloak 24 sebagai Identity Provider untuk sistem DIIS.

---

## Prasyarat

- Docker dan Docker Compose v2 sudah terinstall
- File `.env` sudah dikonfigurasi (lihat `.env.example`)
- PostgreSQL service sudah running dan healthy

---

## 1. Start Container Keycloak

```bash
# Dari root direktori proyek
docker compose -f infrastructure/docker/docker-compose.yml up keycloak -d

# Cek log saat startup
docker logs -f smk-keycloak
```

Tunggu hingga muncul log `Keycloak 24.x ... started` (~30–60 detik).
Realm `diis` akan di-import otomatis dari `infrastructure/keycloak/realm-diis.json`.

---

## 2. Akses Admin Console

- URL: `http://localhost:8080`
- Username: nilai `KC_ADMIN_USER` di `.env` (default: `admin`)
- Password: nilai `KC_ADMIN_PASSWORD` di `.env`

---

## 3. Verifikasi Realm (Jika Auto-Import Gagal)

Jika realm `diis` belum ada setelah startup:

1. Login ke Admin Console → `http://localhost:8080`
2. Klik dropdown realm (pojok kiri atas) → **Create realm**
3. Klik **Browse** → upload file `infrastructure/keycloak/realm-diis.json`
4. Klik **Create**

---

## 4. Generate Client Secret untuk `diis-web`

Client `diis-web` (confidential client) memerlukan secret untuk NextAuth:

1. Admin Console → **Clients** → `diis-web`
2. Tab **Credentials**
3. Klik **Regenerate** pada kolom Secret
4. Copy secret yang muncul
5. Tambahkan ke `apps/web/.env.local`:
   ```env
   KEYCLOAK_CLIENT_SECRET=<secret-yang-di-copy>
   ```

---

## 5. Verifikasi JWKS Endpoint

```bash
curl http://localhost:8080/realms/diis/protocol/openid-connect/certs | jq .
```

Respons berisi array `keys` — ini yang digunakan `packages/auth/src/index.ts` untuk verifikasi JWT.

---

## 6. Test Login Token (Password Grant — Dev Only)

```bash
curl -s -X POST \
  http://localhost:8080/realms/diis/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=diis-web" \
  -d "client_secret=<CLIENT_SECRET>" \
  -d "username=admin" \
  -d "password=Admin@DIIS2026!" | jq .
```

> **Catatan:** `directAccessGrantsEnabled` harus diaktifkan untuk test ini (default: `false`).
> Aktifkan sementara di Clients → diis-web → Settings → Direct access grants.

---

## 7. Test Health API dengan Token

```bash
TOKEN=$(curl -s -X POST \
  http://localhost:8080/realms/diis/protocol/openid-connect/token \
  -d "grant_type=password&client_id=diis-web&client_secret=<SECRET>&username=admin&password=Admin@DIIS2026!" \
  | jq -r .access_token)

curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/health
```

---

## 8. Roles DIIS

Realm `diis` memiliki 6 roles yang sudah di-import:

| Role | Deskripsi |
|------|-----------|
| `SUPER_ADMIN` | Akses penuh semua modul |
| `KEPALA_SEKOLAH` | Dashboard eksekutif, laporan, approval |
| `GURU` | Manajemen kelas, nilai, absensi |
| `SISWA` | Portal siswa — nilai, jadwal |
| `ORANG_TUA` | Pantau perkembangan anak |
| `INDUSTRI` | Akses profil siswa dan lowongan |

Untuk assign role ke user: **Users** → pilih user → tab **Role mapping** → **Assign role**.

---

## 9. Konfigurasi Production

Saat deploy ke VPS, update environment variables di docker-compose.yml:

```yaml
KC_HOSTNAME: auth.smkdarussalamsubah.sch.id
KC_HOSTNAME_STRICT: "true"
KC_HTTP_ENABLED: "false"   # Gunakan HTTPS only
KC_PROXY: edge              # Nginx sebagai reverse proxy
```

Dan update `redirectUris` di client `diis-web` untuk include domain production.

---

## Troubleshooting

**Container restart terus-menerus:**
```bash
docker logs smk-keycloak --tail 50
```
Biasanya karena PostgreSQL belum ready. Cek `docker compose ps` untuk status postgres.

**Realm tidak ter-import:**
File di `/opt/keycloak/data/import/` hanya di-import SEKALI saat realm belum ada.
Jika realm sudah ada dan ingin re-import, hapus realm terlebih dahulu via Admin Console.

**Token validation gagal di API:**
Pastikan `KEYCLOAK_URL` dan `KEYCLOAK_REALM` di `apps/api/.env` sudah benar:
```env
KEYCLOAK_URL=http://keycloak:8080   # dalam Docker network
KEYCLOAK_REALM=diis
```
