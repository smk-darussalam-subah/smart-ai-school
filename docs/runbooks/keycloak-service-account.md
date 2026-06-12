# Runbook — Enable Keycloak Service Account `diis-api`

## Tujuan
Client `diis-api` memerlukan service account agar bisa menerbitkan token
client-credentials (grant_type=client_credentials) untuk memanggil
Keycloak Admin REST API. Realm production tidak di-reimport otomatis,
jadi langkah ini dikerjakan manual SEKALI.

## Prasyarat
- Akses ke VPS sebagai `appuser`
- Kredensial admin master Keycloak (`admin` / `$KC_ADMIN_PASSWORD`)
- `diis-api` client secret sudah tersedia di `.env` VPS (`KEYCLOAK_API_CLIENT_SECRET`)

---

## Langkah 1 — Via Console (GUI)

1. Login ke Admin Console Keycloak (via SSH tunnel):
   ```bash
   ssh -L 8443:localhost:8080 appuser@<VPS_IP>
   ```
   Buka `https://localhost:8443` → realm `diis`.

2. Clients → `diis-api` → Settings:
   - **Access Type**: `confidential` (bukan bearer-only)
   - **Service Accounts Enabled**: `ON`

3. Save.

4. Clients → `diis-api` → **Service Account Roles** tab:
   - Client Roles → pilih `realm-management`
   - Assign role: `manage-users` + `view-users`
   - **JANGAN** assign `realm-admin` — least-privilege.

5. Clients → `diis-api` → **Credentials** tab:
   - Copy `Client Secret` (simpan sebagai `KEYCLOAK_API_CLIENT_SECRET` di `.env` VPS).

---

## Langkah 2 — Via kcadm.sh (alternatif CLI)

```bash
# Masuk container Keycloak
docker compose exec keycloak bash

# Login admin master
/opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password "$KC_ADMIN_PASSWORD"

# Disable bearer-only
/opt/keycloak/bin/kcadm.sh update clients/$( \
  /opt/keycloak/bin/kcadm.sh get clients -r diis -q clientId=diis-api --fields id \
  | grep -o '"id" : "[^"]*"' | cut -d'"' -f4) \
  -r diis \
  -s bearerOnly=false \
  -s serviceAccountsEnabled=true

# Assign realm-management roles ke service account
SVC_USER_ID=$(/opt/keycloak/bin/kcadm.sh get users -r diis \
  -q username=service-account-diis-api --fields id \
  | grep -o '"id" : "[^"]*"' | cut -d'"' -f4)

MGMT_CLIENT_ID=$(/opt/keycloak/bin/kcadm.sh get clients -r diis \
  -q clientId=realm-management --fields id \
  | grep -o '"id" : "[^"]*"' | cut -d'"' -f4)

for ROLE in manage-users view-users; do
  ROLE_ID=$(/opt/keycloak/bin/kcadm.sh get clients/$MGMT_CLIENT_ID/roles/$ROLE \
    -r diis --fields id | grep -o '"id" : "[^"]*"' | cut -d'"' -f4)
  /opt/keycloak/bin/kcadm.sh add-roles -r diis \
    --uusername service-account-diis-api \
    --cclientid realm-management --rolename $ROLE
done
```

---

## Langkah 3 — Verifikasi

### 3a. Dapatkan token client-credentials
```bash
curl -s -X POST \
  "https://auth.smkdarussalamsubah.sch.id/realms/diis/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=diis-api" \
  -d "client_secret=$KEYCLOAK_API_CLIENT_SECRET" | jq .

# Ekspektasi: JSON dengan access_token, expires_in, token_type=Bearer
```

### 3b. Buat user uji
```bash
TOKEN=$(curl -s ... | jq -r '.access_token')

curl -s -X POST \
  "https://auth.smkdarussalamsubah.sch.id/admin/realms/diis/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test-provision",
    "email": "test@smkdarussalamsubah.sch.id",
    "firstName": "Test",
    "lastName": "Provision",
    "enabled": true
  }' -I

# Ekspektasi: HTTP/1.1 201 Created, header Location berisi ID user baru
```

### 3c. Cek user muncul
```bash
curl -s \
  "https://auth.smkdarussalamsubah.sch.id/admin/realms/diis/users?username=test-provision&exact=true" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0].username'

# Ekspektasi: "test-provision"
```

### 3d. Hapus user uji
```bash
USER_ID=$(curl -s ... | jq -r '.[0].id')
curl -s -X DELETE \
  "https://auth.smkdarussalamsubah.sch.id/admin/realms/diis/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" -I

# Ekspektasi: HTTP/1.1 204 No Content
```

### 3e. Cek user hilang
```bash
curl -s \
  "https://auth.smkdarussalamsubah.sch.id/admin/realms/diis/users?username=test-provision&exact=true" \
  -H "Authorization: Bearer $TOKEN" | jq 'length'

# Ekspektasi: 0
```

---

## Troubleshooting

| Gejala | Kemungkinan penyebab | Aksi |
|---|---|---|
| `401 Unauthorized` saat token | Client secret salah | Cek `KEYCLOAK_API_CLIENT_SECRET` di `.env` VPS |
| `403 Forbidden` saat create user | Service account belum punya `manage-users` | Ulangi Langkah 1 Step 4 |
| `400 Bad Request` "Bearer-only clients..." | `bearerOnly` masih `true` | Ulangi Langkah 1 Step 2 |
| `404 Not Found` di /admin/realms/diis/users | Realm name salah | Pastikan realm = `diis` (lowercase) |
