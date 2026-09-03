#!/usr/bin/env bash

set -Eeuo pipefail

MINIO_IMAGE='minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e'
MC_IMAGE='minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727'
PREFIX="diis-wave10-minio-proof-$$"
NETWORK="${PREFIX}-net"
CONTAINER="${PREFIX}-server"
VOLUME="${PREFIX}-data"
ACCESS_KEY='wave10synthetic'
SECRET_KEY='wave10-synthetic-secret-only'
BUCKET='wave10-backup-proof'
TMP=$(mktemp -d)
HOST_TMP=$(cygpath -w "$TMP" 2>/dev/null || printf '%s' "$TMP")

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT HUP INT TERM

mc_run() {
  MSYS_NO_PATHCONV=1 docker run --rm --network "$NETWORK" \
    -e "MC_HOST_proof=http://${ACCESS_KEY}:${SECRET_KEY}@minio-proof:9000" \
    -v "$HOST_TMP:/proof:ro" "$MC_IMAGE" "$@"
}

docker network create --label com.diis.wave10-proof=isolated-v1 "$NETWORK" >/dev/null
docker volume create --label com.diis.wave10-proof=disposable-v1 "$VOLUME" >/dev/null
docker run -d --name "$CONTAINER" --network "$NETWORK" --network-alias minio-proof \
  --label com.diis.wave10-proof=disposable-v1 \
  -e MINIO_ROOT_USER="$ACCESS_KEY" -e MINIO_ROOT_PASSWORD="$SECRET_KEY" \
  -v "$VOLUME:/data" "$MINIO_IMAGE" server /data >/dev/null

ready=false
for _ in $(seq 1 120); do
  if mc_run ls proof >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.25
done
[[ "$ready" == true ]] || { echo 'MinIO disposable tidak sehat' >&2; exit 1; }
mc_run mb --ignore-existing "proof/$BUCKET" >/dev/null

dd if=/dev/zero of="$TMP/database.dump" bs=4096 count=2 2>/dev/null
printf 'wave10-sidecar\n' >>"$TMP/database.dump"
expected_sha=$(sha256sum "$TMP/database.dump" | awk '{print $1}')
printf '%s  database.dump\n' "$expected_sha" >"$TMP/database.sha256"

mc_run cp -q /proof/database.dump "proof/$BUCKET/database.dump"
mc_run cp -q /proof/database.sha256 "proof/$BUCKET/database.sha256"
mc_run cat "proof/$BUCKET/database.dump" >"$TMP/database.copyback.dump"
mc_run cat "proof/$BUCKET/database.sha256" >"$TMP/database.copyback.sha256"
[[ "$(sha256sum "$TMP/database.copyback.dump" | awk '{print $1}')" == "$expected_sha" ]] \
  || { echo 'copy-back dump MinIO tidak cocok' >&2; exit 1; }
cmp -s "$TMP/database.sha256" "$TMP/database.copyback.sha256" \
  || { echo 'copy-back sidecar MinIO tidak cocok' >&2; exit 1; }

head -c 128 "$TMP/database.dump" >"$TMP/database.corrupt.dump"
mc_run cp -q /proof/database.corrupt.dump "proof/$BUCKET/database.dump"
mc_run cat "proof/$BUCKET/database.dump" >"$TMP/database.corrupt.copyback"
if [[ "$(sha256sum "$TMP/database.corrupt.copyback" | awk '{print $1}')" == "$expected_sha" ]]; then
  echo 'korupsi MinIO tidak terdeteksi' >&2
  exit 1
fi

capacity=$(docker exec "$CONTAINER" df -Pk /data | awk 'NR==2 {print $2, $4}')
read -r total_kb available_kb <<<"$capacity"
[[ "$total_kb" =~ ^[0-9]+$ && "$available_kb" =~ ^[0-9]+$ && "$available_kb" -gt 0 ]] \
  || { echo 'filesystem target MinIO tidak dapat diobservasi' >&2; exit 1; }

printf 'WAVE10_MINIO_INTEGRATION_COMPLETE copyback=verified corruption=detected target_capacity=observed\n'
