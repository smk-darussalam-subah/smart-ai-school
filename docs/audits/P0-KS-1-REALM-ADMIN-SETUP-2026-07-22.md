# P0-KS-1 Opsi A — Keycloak Service Account Permission Setup

Date: 2026-07-22
Status: **READY FOR DIRECTOR EXECUTION**
Estimated time: 5 minutes

## Prerequisites

- SSH access to VPS staging (`smkdarussalamsubah.sch.id`)
- Keycloak admin credentials (Username: `admin` or via `KEYCLOAK_ADMIN` env var)
- Keycloak container running (`smk-keycloak`)

## Opsi A.1 — Via Keycloak Admin CLI (recommended, scriptable)

SSH ke VPS lalu jalankan dari dalam container Keycloak:

```bash
# 1. Dapatkan token admin Keycloak dari dalam container
docker exec -it smk-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "$KEYCLOAK_ADMIN" \
  --password "$KEYCLOAK_ADMIN_PASSWORD"

# 2. Identifikasi client ID internal untuk `diis-api` di realm `diis`
#    (Returns UUID, simpan sebagai $CLIENT_ID)
CLIENT_ID=$(docker exec -it smk-keycloak /opt/keycloak/bin/kcadm.sh get \
  -r diis \
  clients?clientId=diis-api \
  --fields id,clientId)

echo "Client diis-api UUID: $CLIENT_ID"

# 3. Identifikasi service account user ID untuk client `diis-api`
SA_USER_ID=$(docker exec -it smk-keycloak /opt/keycloak/bin/kcadm.sh get \
  -r diis \
  clients/$CLIENT_ID/service-account-user \
  --fields id)

echo "Service account user ID: $SA_USER_ID"

# 4. Dapatkan ID role `realm-admin` dari client `realm-management`
REALM_MANAGEMENT_CLIENT_ID=$(docker exec -it smk-keycloak /opt/keycloak/bin/kcadm.sh get \
  -r diis \
  clients?clientId=realm-management \
  --fields id,clientId)

REALM_ADMIN_ROLE_ID=$(docker exec -it smk-keycloak /opt/keycloak/bin/kcadm.sh get \
  -r diis \
  clients/$REALM_MANAGEMENT_CLIENT_ID/roles/realm-admin \
  --fields id,name)

echo "realm-admin role ID: $REALM_ADMIN_ROLE_ID"

# 5. Assign role `realm-admin` ke service account `diis-api`
docker exec -it smk-keycloak /opt/keycloak/bin/kcadm.sh create \
  -r diis \
  users/$SA_USER_ID/role-mappings/clients/$REALM_MANAGEMENT_CLIENT_ID \
  -b '[{"id":"'"$REALM_ADMIN_ROLE_ID"'","name":"realm-admin"}]'

echo "✓ Role realm-admin assigned to service account diis-api"
```

**Catatan:** Ganti `$KEYCLOAK_ADMIN` dan `$KEYCLOAK_ADMIN_PASSWORD` dengan kredensial admin Keycloak yang sebenarnya (lihat `.env` di VPS atau `docker-compose.yml`).

## Opsi A.2 — Via Keycloak Admin Console UI (manual)

Jika lebih nyaman dengan UI:

1. **Login ke Keycloak Admin Console:**
   - URL: `https://auth.smkdarussalamsubah.sch.id/admin/master-realm/console/`
   - Username: `admin` (atau yang setara)
   - Password: dari env var `KEYCLOAK_ADMIN_PASSWORD`

2. **Pilih realm `diis`** (dropdown kiri atas).

3. **Navigasi:** Clients → `diis-api` → tab **Service Account Roles**.

4. **Pilih client `realm-management`** di dropdown "Client".

5. **Filter "Available roles":** ketik `realm-admin`.

6. **Pilih `realm-admin`** → klik **Add selected >>**.

   **Catatan alternatif (least-privilege):** Bila Director hanya ingin memberikan izin minimal (bukan super-admin realm), pilih `manage-realm` saja. Tapi `realm-admin` lebih aman untuk future-proof karena mencakup semua operasi realm management yang mungkin dibutuhkan di Wave berikutnya.

7. **Klik Save** (bila ada tombol save — beberapa versi Keycloak auto-save).

8. **Logout dari Admin Console.**

## Post-Action Verification

### Langkah 1 — Verifikasi role assignment via API

```bash
# Di VPS staging, dapatkan token service account lalu introspect
docker exec -it smk-keycloak /opt/keycloak/bin/kcadm.sh get \
  -r diis \
  clients/$CLIENT_ID/service-account-user \
  --fields id,username
```

Atau via Keycloak Admin Console → Clients → `diis-api` → Service Account Roles → **Effective roles** harus mencakup `realm-admin`.

### Langkah 2 — Sync Role Keycloak via DIIS UI

1. Login ke DIIS staging sebagai `SUPER_ADMIN`.
2. Buka `/dashboard/struktur-organisasi`.
3. Klik tombol **"Sync Role Keycloak"** (pojok kanan atas, tombol outline indigo).
4. **Expected result:**
   ```
   Hasil Sinkronisasi Keycloak Realm Roles
   Dibuat (12)     — WAKA_KURIKULUM, WAKA_KESISWAAN, BENDAHARA, KEPALA_TU, ...
   Sudah Ada (1)   — KEPALA_SEKOLAH
   Gagal (0)       — Tidak ada
   ```
5. **Bila masih ada yang gagal:** catat error message. Dengan P0-KS-2 fix yang sudah di-deploy, pesan error sekarang akan jujur (403 Forbidden, bukan "tidak tersedia").

### Langkah 3 — Test penugasan jabatan end-to-end

1. Setelah sync berhasil, di Struktur Organisasi → klik tombol **"Tetapkan"** di salah satu jabatan (mis. `WAKA_KURIKULUM`).
2. Pilih pegawai dari dropdown → klik **Simpan**.
3. **Expected:** toast sukses "Penugasan berhasil disimpan." (tidak ada error 403 lagi).
4. **Verify di Keycloak:** cek user → Role Mappings → harus muncul `WAKA_KURIKULUM` di assigned roles.
5. **Verify di DIIS:** buka `/dashboard/users` → klik tombol **"Jabatan"** di baris user tersebut → harus muncul `WAKA_KURIKULUM` di section "Jabatan Aktif Tahun Ini" + "Role Keycloak".

## Rollback Plan

Bila terjadi masalah setelah role assignment:

```bash
# Hapus role realm-admin dari service account
docker exec -it smk-keycloak /opt/keycloak/bin/kcadm.sh delete \
  -r diis \
  users/$SA_USER_ID/role-mappings/clients/$REALM_MANAGEMENT_CLIENT_ID \
  -b '[{"id":"'"$REALM_ADMIN_ROLE_ID"'","name":"realm-admin"}]'
```

## Setelah Director Eksekusi

Setelah Director mengkonfirmasi role assignment berhasil:

1. **Director** klik "Sync Role Keycloak" di staging → verify 12 roles ter-create.
2. **Director** test penugasan jabatan → verify berhasil.
3. **Director** kasih tahu executor bahwa P0-KS-1 closed → executor bisa update audit register dan dokumentasi.

## Update Permanent (rekomendasi Wave berikutnya)

Setelah staging terverifikasi, update `realm-diis.json` untuk permanen:

```json
{
  "clientId": "diis-api",
  "serviceAccountsEnabled": true,
  "authorizationServicesEnabled": true,
  "defaultClientScopes": [
    "web-origins", "acr", "profile", "roles", "email"
  ],
  "serviceAccountRole": "realm-admin"  // ← NEW (optional)
}
```

Atau tambahkan explicit role mapping di section `users` realm config.

Ini menutup P1-KS-4 juga (realm-diis.json tidak update service account permissions).

## Path

`docs/audits/P0-KS-1-REALM-ADMIN-SETUP-2026-07-22.md` (file ini).
