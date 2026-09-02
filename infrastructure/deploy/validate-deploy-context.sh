#!/usr/bin/env bash
set -euo pipefail

REF=${1:-}
BRANCH=${2:-}
EXPECTED_SHA=${3:-}
RUN_ID=${4:-}
RUN_ATTEMPT=${5:-}

case "$REF" in
  refs/heads/main) expected_branch=main ;;
  refs/heads/staging) expected_branch=staging ;;
  *)
    printf '%s\n' 'DEPLOY_CONTEXT_REJECTED reason=forbidden-ref' >&2
    exit 64
    ;;
esac

if [[ "$BRANCH" != "$expected_branch" ]]; then
  printf '%s\n' 'DEPLOY_CONTEXT_REJECTED reason=ref-branch-mismatch' >&2
  exit 64
fi
if [[ ! "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  printf '%s\n' 'DEPLOY_CONTEXT_REJECTED reason=invalid-sha' >&2
  exit 64
fi
if [[ ! "$RUN_ID" =~ ^[1-9][0-9]*$ ]] || [[ ! "$RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]]; then
  printf '%s\n' 'DEPLOY_CONTEXT_REJECTED reason=invalid-run-identity' >&2
  exit 64
fi

printf 'DEPLOY_CONTEXT_VALID branch=%s sha=%s run_id=%s attempt=%s\n' \
  "$BRANCH" "$EXPECTED_SHA" "$RUN_ID" "$RUN_ATTEMPT"
