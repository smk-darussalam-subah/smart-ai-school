#!/bin/bash
# Reviewed portable operator entrypoint. Default is observation, never prune.
set -Eeuo pipefail
umask 077
if [ "$#" -lt 4 ] || [ "$1" != --bundle ] || [ "$3" != --sha256 ]; then
  printf '%s\n' 'Usage: diis-build-cache-cleanup.sh --bundle PRIVATE_ROOT --sha256 APPROVED_HASH [observe|apply|status] --profile FILE --policy FILE --output FILE ...' >&2
  exit 64
fi
bundle_root=$2
bundle_hash=$4
shift 4
[[ "$bundle_root" = /* && "$bundle_hash" =~ ^[a-f0-9]{64}$ ]] || exit 65
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
exec python3 -I -B "$script_dir/capacity_bundle.py" run \
  --root "$bundle_root" --sha256 "$bundle_hash" -- "$@"
