#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <theme-login-root> <approved-manifest>" >&2
  exit 64
}

fail() {
  echo "THEME_BUNDLE_INVALID reason=$1" >&2
  exit 1
}

[[ $# -eq 2 ]] || usage

theme_root=$1
manifest=$2
[[ -d "$theme_root" ]] || fail "theme-root-missing"
[[ -f "$manifest" ]] || fail "manifest-missing"

theme_root=$(cd "$theme_root" && pwd -P)
manifest=$(cd "$(dirname "$manifest")" && printf '%s/%s\n' "$(pwd -P)" "$(basename "$manifest")")

expected_paths=(
  "messages/messages_en.properties"
  "messages/messages_id.properties"
  "resources/css/login.css"
  "resources/js/login.js"
  "theme.properties"
)

declare -A expected_tree=(
  ["messages"]="d"
  ["messages/messages_en.properties"]="f"
  ["messages/messages_id.properties"]="f"
  ["resources"]="d"
  ["resources/css"]="d"
  ["resources/css/login.css"]="f"
  ["resources/js"]="d"
  ["resources/js/login.js"]="f"
  ["theme.properties"]="f"
)

while IFS=$'\t' read -r relative_path entry_type; do
  [[ -n "${expected_tree[$relative_path]+present}" ]] || fail "unexpected-tree-entry:$relative_path"
  [[ "$entry_type" == "${expected_tree[$relative_path]}" ]] || fail "tree-entry-type:$relative_path"
  unset 'expected_tree[$relative_path]'
done < <(find "$theme_root" -mindepth 1 -printf '%P\t%y\n' | LC_ALL=C sort)

[[ ${#expected_tree[@]} -eq 0 ]] || {
  mapfile -t missing_entries < <(printf '%s\n' "${!expected_tree[@]}" | LC_ALL=C sort)
  fail "missing-tree-entry:${missing_entries[0]}"
}

mapfile -t manifest_lines < <(grep -v '^[[:space:]]*$' "$manifest")
[[ ${#manifest_lines[@]} -eq ${#expected_paths[@]} ]] || fail "manifest-entry-count"

for index in "${!expected_paths[@]}"; do
  line=${manifest_lines[$index]}
  if [[ ! "$line" =~ ^([0-9a-f]{64})[[:space:]][[:space:]](.+)$ ]]; then
    fail "manifest-format"
  fi

  expected_hash=${BASH_REMATCH[1]}
  relative_path=${BASH_REMATCH[2]}
  [[ "$relative_path" == "${expected_paths[$index]}" ]] || fail "manifest-path-order"
  [[ "$relative_path" != /* && "$relative_path" != *".."* && "$relative_path" != *\\* ]] || fail "manifest-path-unsafe"

  file_path="$theme_root/$relative_path"
  [[ -f "$file_path" ]] || fail "source-file-missing:$relative_path"
  resolved_file=$(cd "$(dirname "$file_path")" && printf '%s/%s\n' "$(pwd -P)" "$(basename "$file_path")")
  [[ "$resolved_file" == "$theme_root/"* ]] || fail "source-path-escape:$relative_path"

  actual_hash=$(sha256sum "$file_path" | awk '{print $1}')
  [[ "$actual_hash" == "$expected_hash" ]] || fail "hash-mismatch:$relative_path"
  printf 'THEME_FILE_OK path=%s sha256=%s\n' "$relative_path" "$actual_hash"
done

manifest_hash=$(sha256sum "$manifest" | awk '{print $1}')
printf 'THEME_BUNDLE_OK file_count=%s manifest_sha256=%s\n' "${#expected_paths[@]}" "$manifest_hash"
