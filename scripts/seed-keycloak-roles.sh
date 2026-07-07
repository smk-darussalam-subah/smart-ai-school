#!/usr/bin/env bash
# =============================================================================
# seed-keycloak-roles.sh — Seed 13 position codes sebagai Keycloak realm roles
#
# Idempotent: skip role yang sudah ada (409 Conflict).
# Alternatif runtime: POST /positions/sync-roles (SA only) via API.
#
# Usage:
#   ./scripts/seed-keycloak-roles.sh
#
# Required environment variables:
#   KEYCLOAK_URL          — e.g. http://localhost:8080
#   KEYCLOAK_REALM        — e.g. diis
#   KEYCLOAK_CLIENT_ID    — service account client (default: diis-api)
#   KEYCLOAK_CLIENT_SECRET — service account secret
# =============================================================================
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-diis}"
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-diis-api}"
KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:?KEYCLOAK_CLIENT_SECRET is required}"

ADMIN_URL="${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}"
TOKEN_URL="${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token"

# 13 position codes from Struktur Organisasi (2J-5)
POSITION_CODES=(
  "KEPALA_SEKOLAH:Kepala Sekolah"
  "WAKA_KURIKULUM:Wakasek Kurikulum"
  "WAKA_KESISWAAN:Wakasek Kesiswaan"
  "WAKA_HUMAS:Wakasek Humas"
  "WAKA_SARPRAS:Wakasek Sarpras"
  "KEPALA_TU:Kepala Tata Usaha"
  "KAPROG:Kepala Program Keahlian"
  "KOOR_BKK:Koordinator BKK"
  "KOOR_HUBIN:Koordinator Hubin"
  "GURU_BK:Guru Bimbingan Konseling"
  "BENDAHARA:Bendahara"
  "STAF_KEPEGAWAIAN:Staf Kepegawaian"
  "OPERATOR_DAPODIK:Operator Dapodik"
)

echo "=== Seed Keycloak Realm Roles ==="
echo "URL:   ${KEYCLOAK_URL}"
echo "Realm: ${KEYCLOAK_REALM}"
echo ""

# --- Get access token ---
echo "Fetching access token..."
TOKEN_resp=$(curl -sf -X POST "${TOKEN_URL}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${KEYCLOAK_CLIENT_ID}" \
  -d "client_secret=${KEYCLOAK_CLIENT_SECRET}") || {
    echo "ERROR: Failed to get access token from Keycloak"
    exit 1
  }

ACCESS_TOKEN=$(echo "${TOKEN_resp}" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token acquired."
echo ""

# --- Seed roles ---
created=0
existing=0
failed=0

for entry in "${POSITION_CODES[@]}"; do
  code="${entry%%:*}"
  description="${entry##*:}"

  # Check if role already exists (GET returns 200 if exists, 404 if not)
  http_code=$(curl -sf -o /dev/null -w "%{http_code}" \
    -X GET "${ADMIN_URL}/roles/${code}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}") || http_code="000"

  if [ "${http_code}" = "200" ]; then
    echo "  SKIP  ${code} (already exists)"
    existing=$((existing + 1))
    continue
  fi

  # Create the role
  create_code=$(curl -sf -o /dev/null -w "%{http_code}" \
    -X POST "${ADMIN_URL}/roles" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${code}\",\"description\":\"${description}\"}") || create_code="000"

  if [ "${create_code}" = "201" ]; then
    echo "  CREATE ${code}"
    created=$((created + 1))
  else
    echo "  FAIL  ${code} (HTTP ${create_code})"
    failed=$((failed + 1))
  fi
done

echo ""
echo "=== Summary ==="
echo "Created:  ${created}"
echo "Existing: ${existing}"
echo "Failed:   ${failed}"

if [ "${failed}" -gt 0 ]; then
  exit 1
fi
exit 0
