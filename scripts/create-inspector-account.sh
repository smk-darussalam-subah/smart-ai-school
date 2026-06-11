#!/usr/bin/env bash
# =============================================================================
# create-inspector-account.sh — buat akun INSPEKTUR ber-SEMUA role (Keycloak).
#
# Jalankan di VPS (user appuser). Password diketik interaktif — TIDAK pernah
# masuk argumen/история/log (pola recovery N-29).
#
#   ./scripts/create-inspector-account.sh [username] [email]
#   default: inspector / inspector@smkdarussalamsubah.sch.id
#
# Setelah sukses: login di web → sidebar menampilkan pemilih "Masuk sebagai"
# (akun multi-role) → pilih peran → seluruh dashboard dirender sebagai peran itu.
# RBAC API tetap menilai seluruh role asli dari token.
# =============================================================================
set -euo pipefail

USERNAME="${1:-inspector}"
EMAIL="${2:-inspector@smkdarussalamsubah.sch.id}"
CONTAINER="${KC_CONTAINER:-smk-keycloak}"
REALM="diis"
ROLES=(SUPER_ADMIN KEPALA_SEKOLAH TATA_USAHA GURU SISWA ORANG_TUA INDUSTRI)
KCADM=/opt/keycloak/bin/kcadm.sh

echo "== Akun inspektur: $USERNAME ($EMAIL) di realm $REALM =="
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

# idempoten: pakai user existing bila ada
UID=\$($KCADM get users -r $REALM -q username=$USERNAME --fields id --format csv --noquotes | head -1 || true)
if [ -z "\$UID" ]; then
  $KCADM create users -r $REALM \
    -s username=$USERNAME -s email=$EMAIL -s enabled=true \
    -s firstName=Inspektur -s lastName=DIIS -s emailVerified=true
  UID=\$($KCADM get users -r $REALM -q username=$USERNAME --fields id --format csv --noquotes | head -1)
fi
echo "user id: \$UID"

$KCADM set-password -r $REALM --userid "\$UID" --new-password '$NEW_PW'
$KCADM update users/\$UID -r $REALM -s 'requiredActions=[]'

for ROLE in ${ROLES[@]}; do
  $KCADM add-roles -r $REALM --uusername $USERNAME --rolename "\$ROLE" || true
  echo "  + role \$ROLE"
done
echo "== SELESAI — $USERNAME punya \${#ROLES[@]} role (idempoten, aman diulang) =="
INNER
unset KC_ADMIN_PW NEW_PW NEW_PW2
echo
echo "Verifikasi: login https://smkdarussalamsubah.sch.id/login sebagai $USERNAME"
echo "→ sidebar memunculkan 'Masuk sebagai' → pilih peran → tinjau dashboard."
