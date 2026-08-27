#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
keycloak_root=$(cd "$script_dir/.." && pwd -P)
bundle_verifier="$script_dir/verify-theme-bundle.sh"
preflight_verifier="$script_dir/verify-theme-cutover-preflight.sh"
source_theme="$keycloak_root/themes/diis/login"
source_manifest="$keycloak_root/diis-login-theme.sha256"
node_binary=${DIIS_NODE_BINARY:-node}
temp_root=$(mktemp -d)

cleanup() {
  rm -rf "$temp_root"
}
trap cleanup EXIT

expect_failure() {
  local expected_reason=$1
  shift
  local output
  if output=$("$@" 2>&1); then
    echo "Expected failure: $expected_reason" >&2
    exit 1
  fi
  grep -Fq "reason=$expected_reason" <<<"$output" || {
    echo "Wrong failure for $expected_reason: $output" >&2
    exit 1
  }
}

copy_bundle() {
  local destination=$1
  mkdir -p "$destination/theme" "$destination/config"
  cp -R "$source_theme/." "$destination/theme/"
  cp "$source_manifest" "$destination/config/manifest.sha256"
}

copy_bundle "$temp_root/valid"
bash "$bundle_verifier" "$temp_root/valid/theme" "$temp_root/valid/config/manifest.sha256" >/dev/null

copy_bundle "$temp_root/missing"
rm "$temp_root/missing/theme/messages/messages_en.properties"
expect_failure "missing-tree-entry:messages/messages_en.properties" \
  bash "$bundle_verifier" "$temp_root/missing/theme" "$temp_root/missing/config/manifest.sha256"

copy_bundle "$temp_root/missing-js"
rm "$temp_root/missing-js/theme/resources/js/login.js"
expect_failure "missing-tree-entry:resources/js/login.js" \
  bash "$bundle_verifier" "$temp_root/missing-js/theme" "$temp_root/missing-js/config/manifest.sha256"

copy_bundle "$temp_root/wrong-hash"
printf '\ninvalid\n' >> "$temp_root/wrong-hash/theme/theme.properties"
expect_failure "hash-mismatch:theme.properties" \
  bash "$bundle_verifier" "$temp_root/wrong-hash/theme" "$temp_root/wrong-hash/config/manifest.sha256"

copy_bundle "$temp_root/extra-template"
printf 'unexpected\n' > "$temp_root/extra-template/theme/login.ftl"
expect_failure "unexpected-tree-entry:login.ftl" \
  bash "$bundle_verifier" "$temp_root/extra-template/theme" "$temp_root/extra-template/config/manifest.sha256"

copy_bundle "$temp_root/extra-js"
printf 'unexpected\n' > "$temp_root/extra-js/theme/resources/js/legacy.js"
expect_failure "unexpected-tree-entry:resources/js/legacy.js" \
  bash "$bundle_verifier" "$temp_root/extra-js/theme" "$temp_root/extra-js/config/manifest.sha256"

copy_bundle "$temp_root/extra-css"
printf 'unexpected\n' > "$temp_root/extra-css/theme/resources/css/legacy.css"
expect_failure "unexpected-tree-entry:resources/css/legacy.css" \
  bash "$bundle_verifier" "$temp_root/extra-css/theme" "$temp_root/extra-css/config/manifest.sha256"

copy_bundle "$temp_root/symlink"
ln -s login.js "$temp_root/symlink/theme/resources/js/login-link.js"
expect_failure "unexpected-tree-entry:resources/js/login-link.js" \
  bash "$bundle_verifier" "$temp_root/symlink/theme" "$temp_root/symlink/config/manifest.sha256"

copy_bundle "$temp_root/historical-asset"
mkdir -p "$temp_root/historical-asset/theme/resources/img"
printf 'changed historical asset\n' > "$temp_root/historical-asset/theme/resources/img/logo-diis.svg"
expect_failure "unexpected-tree-entry:resources/img" \
  bash "$bundle_verifier" "$temp_root/historical-asset/theme" "$temp_root/historical-asset/config/manifest.sha256"

repo="$temp_root/repo"
mkdir -p "$repo/infrastructure/keycloak/scripts" "$repo/infrastructure/keycloak/themes/diis/login"
cp "$bundle_verifier" "$preflight_verifier" "$repo/infrastructure/keycloak/scripts/"
cp "$source_manifest" "$repo/infrastructure/keycloak/diis-login-theme.sha256"
cp -R "$source_theme/." "$repo/infrastructure/keycloak/themes/diis/login/"
git -C "$repo" init -q -b main
git -C "$repo" config user.name "DIIS Disposable Test"
git -C "$repo" config user.email "diis-test@example.invalid"
git -C "$repo" add -- infrastructure
git -C "$repo" commit -qm "test: baseline"
baseline_sha=$(git -C "$repo" rev-parse HEAD)
printf 'previous\n' > "$repo/previous.txt"
git -C "$repo" add -- previous.txt
git -C "$repo" commit -qm "test: previous production"
previous_sha=$(git -C "$repo" rev-parse HEAD)
printf 'tracked\n' > "$repo/tracked.txt"
git -C "$repo" add -- tracked.txt
git -C "$repo" commit -qm "test: target"
expected_sha=$(git -C "$repo" rev-parse HEAD)

bash "$preflight_verifier" "$repo" "$expected_sha" "$previous_sha" main >/dev/null

wrong_sha=ffffffffffffffffffffffffffffffffffffffff
expect_failure "head-sha-mismatch" \
  bash "$preflight_verifier" "$repo" "$wrong_sha" "$previous_sha" main

expect_failure "previous-sha-not-first-parent" \
  bash "$preflight_verifier" "$repo" "$expected_sha" "$baseline_sha" main

printf 'dirty\n' >> "$repo/tracked.txt"
expect_failure "worktree-dirty" \
  bash "$preflight_verifier" "$repo" "$expected_sha" "$previous_sha" main
git -C "$repo" restore -- tracked.txt

git -C "$repo" switch -qc not-main
expect_failure "branch-mismatch" \
  bash "$preflight_verifier" "$repo" "$expected_sha" "$previous_sha" main

secret_marker='DIIS_SHOULD_NEVER_APPEAR_IN_OUTPUT'
output=$(KC_ADMIN_PASSWORD="$secret_marker" bash "$bundle_verifier" \
  "$temp_root/valid/theme" "$temp_root/valid/config/manifest.sha256")
if grep -Fq "$secret_marker" <<<"$output"; then
  echo "Secret marker leaked into output" >&2
  exit 1
fi

workflow="$keycloak_root/../../.github/workflows/apply-kc-theme.yml"
remote_script="$script_dir/apply-theme-cutover-remote.sh"
workflow_for_node=$workflow
remote_script_for_node=$remote_script
if [[ "$node_binary" == *.exe ]] && command -v wslpath >/dev/null 2>&1; then
  workflow_for_node=$(wslpath -w "$workflow")
  remote_script_for_node=$(wslpath -w "$remote_script")
fi
"$node_binary" - "$workflow_for_node" "$remote_script_for_node" <<'NODE'
const fs = require('node:fs');
const yaml = require('js-yaml');

const workflow = yaml.load(fs.readFileSync(process.argv[2], 'utf8'));
const remoteScript = fs.readFileSync(process.argv[3], 'utf8');
const dispatch = workflow.on.workflow_dispatch;
if (!dispatch.inputs.expected_sha.required ||
    !dispatch.inputs.previous_production_sha.required ||
    !dispatch.inputs.confirmation.required) {
  throw new Error('Required workflow inputs are missing');
}
if (workflow.jobs['apply-theme'].environment !== 'production') {
  throw new Error('Production environment gate is missing');
}
const remote = workflow.jobs['apply-theme'].steps.find((step) => step.with && step.with.script);
if (!remote || !remote.with.script.includes('apply-theme-cutover-remote.sh')) {
  throw new Error('Workflow does not use the controlled cutover script');
}
if (!remote.with.script.includes('DIIS_CONFIRMATION')) {
  throw new Error('Workflow does not forward the explicit confirmation');
}
if (!/--no-deps --force-recreate keycloak\s/.test(`${remoteScript}\n`)) {
  throw new Error('Remote cutover is not restricted to recreating Keycloak');
}
NODE

echo "THEME_CUTOVER_TESTS_OK cases=16"
