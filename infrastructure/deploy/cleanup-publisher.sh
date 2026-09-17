#!/usr/bin/env bash
set -euo pipefail

config=${1:?}
runner_temp=${2:?}
run_id=${3:?}
original_status=${4:?}

[[ "$runner_temp" = /* && "$runner_temp" != / ]]
[[ "$run_id" =~ ^[1-9][0-9]*$ && "$original_status" =~ ^[0-9]+$ ]]
[[ "$config" == "$runner_temp/diis-publisher-$run_id" ]]
[[ -d "$config" && ! -L "$config" ]]

docker logout ghcr.io >/dev/null 2>&1 || true
rm -rf -- "$config"
[[ ! -e "$config" ]]
exit "$original_status"
