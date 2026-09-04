#!/bin/sh

set -eu
umask 077

[ "$#" -eq 3 ] || {
  printf 'usage: capture-w10d-candidate-tool-evidence.sh CONTAINER TOOL_VOLUME OUTPUT\n' >&2
  exit 64
}
CONTAINER=$1
TOOL_VOLUME=$2
OUTPUT=$3

die() { printf 'ERROR: %s\n' "$*" >&2; exit 65; }
case "$CONTAINER:$TOOL_VOLUME" in
  *[!A-Za-z0-9_.:-]*|:*|*:) die 'runtime resource name invalid' ;;
esac
case "$OUTPUT" in /*) ;; *) die 'output path must be absolute' ;; esac
[ -d "$(dirname "$OUTPUT")" ] || die 'output parent unavailable'
[ ! -e "$OUTPUT" ] || die 'output already exists'
command -v docker >/dev/null 2>&1 || die 'docker unavailable'

actual_volume=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/opt/backup-bin"}}{{.Name}}{{end}}{{end}}' \
  "$CONTAINER") || die 'candidate tool mount unavailable'
[ "$actual_volume" = "$TOOL_VOLUME" ] || die 'candidate tool volume mismatch'

hashes=$(docker exec "$CONTAINER" sh -c \
  'set -eu; test -x /opt/backup-bin/mc; test -f /opt/backup-bin/rclone.zip; test -x /opt/backup-bin/rclone; sha256sum /opt/backup-bin/mc /opt/backup-bin/rclone.zip /opt/backup-bin/rclone') \
  || die 'candidate tool bytes unavailable'
mc_sha=$(printf '%s\n' "$hashes" | awk '$2 == "/opt/backup-bin/mc" {print $1}')
rclone_zip_sha=$(printf '%s\n' "$hashes" | awk '$2 == "/opt/backup-bin/rclone.zip" {print $1}')
rclone_sha=$(printf '%s\n' "$hashes" | awk '$2 == "/opt/backup-bin/rclone" {print $1}')
for value in "$mc_sha" "$rclone_zip_sha" "$rclone_sha"; do
  printf '%s' "$value" | grep -Eq '^[a-f0-9]{64}$' || die 'candidate tool hash invalid'
done

rclone_archive_entry='rclone-v1.70.3-linux-amd64/rclone'
rclone_archive_entry_sha=$(docker exec "$CONTAINER" sh -c '
  set -eu
  candidate=$(mktemp /tmp/diis-rclone-archive-entry.XXXXXXXX)
  cleanup() { rm -f -- "$candidate"; }
  trap cleanup EXIT HUP INT TERM
  unzip -p /opt/backup-bin/rclone.zip "rclone-v1.70.3-linux-amd64/rclone" >"$candidate"
  test -s "$candidate"
  sha256sum "$candidate" | awk "{print \$1}"
') || die 'pinned rclone archive entry unavailable'
printf '%s' "$rclone_archive_entry_sha" | grep -Eq '^[a-f0-9]{64}$' \
  || die 'pinned rclone archive entry hash invalid'
[ "$rclone_sha" = "$rclone_archive_entry_sha" ] \
  || die 'rclone executable does not match pinned archive entry'

mc_version=$(docker exec "$CONTAINER" /opt/backup-bin/mc --version \
  | sed -n '1s/^mc version \([^ ]*\).*/\1/p') || die 'mc version unavailable'
rclone_version=$(docker exec "$CONTAINER" /opt/backup-bin/rclone version \
  | sed -n '1s/^rclone \([^ ]*\).*/\1/p') || die 'rclone version unavailable'
[ "$mc_version" = RELEASE.2025-08-13T08-35-41Z ] || die 'mc version drift'
[ "$rclone_version" = v1.70.3 ] || die 'rclone version drift'

candidate="${OUTPUT}.candidate.$$"
cleanup() { rm -f "$candidate"; }
trap cleanup EXIT HUP INT TERM
printf '{"schemaVersion":"diis-backup-tool-evidence-v3","toolVolume":"%s","mcSha256":"%s","rcloneZipSha256":"%s","rcloneArchiveEntry":"%s","rcloneArchiveEntrySha256":"%s","rcloneSha256":"%s","mcVersion":"%s","rcloneVersion":"%s"}\n' \
  "$TOOL_VOLUME" "$mc_sha" "$rclone_zip_sha" "$rclone_archive_entry" \
  "$rclone_archive_entry_sha" "$rclone_sha" "$mc_version" "$rclone_version" \
  >"$candidate"
chmod 600 "$candidate"
mv "$candidate" "$OUTPUT"
trap - EXIT HUP INT TERM
printf 'CANDIDATE_TOOL_EVIDENCE_CAPTURED container=%s volume=%s\n' "$CONTAINER" "$TOOL_VOLUME"
