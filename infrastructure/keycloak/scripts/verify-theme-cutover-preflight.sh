#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <work-dir> <expected-sha> <previous-production-sha> <expected-branch>" >&2
  exit 64
}

fail() {
  echo "THEME_CUTOVER_PREFLIGHT_FAILED reason=$1" >&2
  exit 1
}

[[ $# -eq 4 ]] || usage

work_dir=$1
expected_sha=${2,,}
previous_sha=${3,,}
expected_branch=$4

[[ "$expected_sha" =~ ^[0-9a-f]{40}$ ]] || fail "expected-sha-format"
[[ "$previous_sha" =~ ^[0-9a-f]{40}$ ]] || fail "previous-sha-format"
[[ "$expected_sha" != "$previous_sha" ]] || fail "previous-sha-equals-target"
[[ -d "$work_dir/.git" ]] || fail "git-worktree-missing"

cd "$work_dir"

actual_branch=$(git branch --show-current)
[[ "$actual_branch" == "$expected_branch" ]] || fail "branch-mismatch"

actual_sha=$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')
[[ "$actual_sha" == "$expected_sha" ]] || fail "head-sha-mismatch"

git cat-file -e "$previous_sha^{commit}" 2>/dev/null || fail "previous-sha-missing"
git merge-base --is-ancestor "$previous_sha" "$expected_sha" || fail "previous-sha-not-ancestor"
[[ "$(git rev-parse "$expected_sha^1")" == "$previous_sha" ]] || fail "previous-sha-not-first-parent"

[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || fail "worktree-dirty"

theme_root="$work_dir/infrastructure/keycloak/themes/diis/login"
manifest="$work_dir/infrastructure/keycloak/diis-login-theme.sha256"
verifier="$work_dir/infrastructure/keycloak/scripts/verify-theme-bundle.sh"
[[ -f "$verifier" ]] || fail "bundle-verifier-missing"

bash "$verifier" "$theme_root" "$manifest"

printf 'THEME_CUTOVER_PREFLIGHT_OK branch=%s head=%s previous_sha=%s\n' \
  "$actual_branch" "$actual_sha" "$previous_sha"
