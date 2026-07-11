#!/usr/bin/env bash
# =============================================================================
# provision-smoke-test.sh — buat Keycloak client + user untuk staging smoke test
#
# Script ini membuat:
# 1. Client "smoke-test" dengan directAccessGrantsEnabled=true (password grant)
# 2. User "smoke-test" dengan role SUPER_ADMIN
#
# Prasyarat: jalankan di VPS (user appuser) di mana Keycloak container running.
# Password admin diketik interaktif — TIDAK masuk argumen/log.
#
#   ./scripts/provision-smoke-test.sh
#
# Setelah sukses, set env vars untuk smoke test:
#   export SMOKE_TEST_USERNAME=smoke-test
#   export SMOKE_TEST_PASSWORD=<password yang di-set>
#
# Lalu jalankan:
#   npx ts-node --project apps/api/tsconfig.json scripts/smoke-test-staging.ts
#
# Idempoten: aman dijalankan ulang. Client dan user yang sudah ada akan di-update.
# =============================================================================
set -euo pipefail

CONTAINER="${KC_CONTAINER:-smk-keycloak}"
REALM="diis"
USERNAME="smoke-test"
EMAIL="smoke-test@staging.local"
CLIENT_ID="smoke-test"
KCADM=/opt/keycloak/bin/kcadm.sh

echo "== Provisioning smoke test client + user in realm '$REALM' =="
set +o history
read -rsp "Password ADMIN MASTER Keycloak: " KC_ADMIN_PW; echo
read -rsp "Password BARU untuk $USERNAME: " NEW_PW; echo
read -rsp "Ulangi password baru: " NEW_PW2; echo
set -o history
[ "$NEW_PW" = "$NEW_PW2" ] || { echo "Password tidak sama"; exit 1; }

docker exec -i "$CONTAINER" bash -s -- <<INNER
set -euo pipefail
$KCADM config credentials --server http://localhost:8080 --realm master \
  --user admin --password '$KC_ADMIN_PW' >/dev/null

# ── 1. Create or update smoke-test client ──────────────────────────
# directAccessGrantsEnabled=true enables password grant for smoke testing.
# This client is NOT used by the web frontend — it's test-only.
CLIENT_ID_INTERNAL=\$($KCADM get clients -r $REALM -q clientId=$CLIENT_ID --fields id --format csv --noquotes | head -1 || true)
if [ -z "\$CLIENT_ID_INTERNAL" ]; then
  $KCADM create clients -r $REALM \
    -s clientId=$CLIENT_ID \
    -s name="Smoke Test Client" \
    -s description="Dedicated client for staging smoke tests — password grant enabled" \
    -s enabled=true \
    -s publicClient=false \
    -s bearerOnly=false \
    -s standardFlowEnabled=false \
    -s implicitFlowEnabled=false \
    -s directAccessGrantsEnabled=true \
    -s serviceAccountsEnabled=false \
    -s fullScopeAllowed=true \
    -s 'redirectUris=[]' \
    -s 'webOrigins=[]'
  CLIENT_ID_INTERNAL=\$($KCADM get clients -r $REALM -q clientId=$CLIENT_ID --fields id --format csv --noquotes | head -1)
  echo "  + client $CLIENT_ID created (id: \$CLIENT_ID_INTERNAL)"
else
  # Update existing client to ensure directAccessGrants is enabled
  $KCADM update clients/\$CLIENT_ID_INTERNAL -r $REALM \
    -s directAccessGrantsEnabled=true
  echo "  = client $CLIENT_ID updated (directAccessGrants enabled)"
fi

# ── 2. Create or update smoke-test user ─────────────────────────────
UID=\$($KCADM get users -r $REALM -q username=$USERNAME --fields id --format csv --noquotes | head -1 || true)
if [ -z "\$UID" ]; then
  $KCADM create users -r $REALM \
    -s username=$USERNAME -s email=$EMAIL -s enabled=true \
    -s firstName=Smoke -s lastName=Test -s emailVerified=true
  UID=\$($KCADM get users -r $REALM -q username=$USERNAME --fields id --format csv --noquotes | head -1)
  echo "  + user $USERNAME created (id: \$UID)"
else
  echo "  = user $USERNAME already exists (id: \$UID)"
fi

$KCADM set-password -r $REALM --userid "\$UID" --new-password '$NEW_PW'
$KCADM update users/\$UID -r $REALM -s 'requiredActions=[]'
echo "  + password set, requiredActions cleared"

# ── 3. Assign SUPER_ADMIN realm role ────────────────────────────────
$KCADM add-roles -r $REALM --uusername $USERNAME --rolename SUPER_ADMIN 2>/dev/null \
  && echo "  + role SUPER_ADMIN assigned" \
  || echo "  = role SUPER_ADMIN already assigned"

echo ""
echo "== SELESAI =="
echo "  Client: $CLIENT_ID (directAccessGrantsEnabled=true)"
echo "  User:   $USERNAME (SUPER_ADMIN)"
echo ""
echo "Env vars untuk smoke test:"
echo "  SMOKE_TEST_USERNAME=$USERNAME"
echo "  SMOKE_TEST_PASSWORD=<password yang baru di-set>"
INNER

unset KC_ADMIN_PW NEW_PW NEW_PW2
echo ""
echo "Verifikasi token:"
echo "  curl -s -X POST 'https://auth.smkdarussalamsubah.sch.id/realms/diis/protocol/openid-connect/token' \\"
echo "    -d 'grant_type=password&client_id=$CLIENT_ID&username=$USERNAME&password=<password>'"
echo "  Decode JWT di jwt.io — realm_access.roles harus berisi SUPER_ADMIN"
