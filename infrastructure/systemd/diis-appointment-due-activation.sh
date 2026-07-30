#!/usr/bin/env bash
set -euo pipefail

API_CONTAINER="${DIIS_API_CONTAINER:-smk-api}"
ENDPOINT_PATH="${DIIS_APPOINTMENT_ENDPOINT_PATH:-/api/v1/appointments/activate-due}"
REQUEST_TIMEOUT_MS="${DIIS_APPOINTMENT_REQUEST_TIMEOUT_MS:-30000}"
MAX_ATTEMPTS="${DIIS_APPOINTMENT_MAX_ATTEMPTS:-3}"
RETRY_DELAY_SECONDS="${DIIS_APPOINTMENT_RETRY_DELAY_SECONDS:-10}"

log() {
  printf '[%s] %s\n' "$(TZ=Asia/Jakarta date '+%Y-%m-%d %H:%M:%S WIB')" "$*"
}

if ! command -v docker >/dev/null 2>&1; then
  log "appointment activation failed: docker command not found"
  exit 127
fi

if ! docker inspect --format '{{.State.Running}}' "$API_CONTAINER" 2>/dev/null | grep -qx 'true'; then
  log "appointment activation failed: API container is not running"
  exit 1
fi

case "$REQUEST_TIMEOUT_MS" in
  ''|*[!0-9]*)
    log "appointment activation failed: invalid DIIS_APPOINTMENT_REQUEST_TIMEOUT_MS"
    exit 2
    ;;
esac

case "$MAX_ATTEMPTS" in
  ''|*[!0-9]*)
    log "appointment activation failed: invalid DIIS_APPOINTMENT_MAX_ATTEMPTS"
    exit 2
    ;;
esac

case "$RETRY_DELAY_SECONDS" in
  ''|*[!0-9]*)
    log "appointment activation failed: invalid DIIS_APPOINTMENT_RETRY_DELAY_SECONDS"
    exit 2
    ;;
esac

if (( 10#$REQUEST_TIMEOUT_MS < 1000 || 10#$REQUEST_TIMEOUT_MS > 120000 )); then
  log "appointment activation failed: DIIS_APPOINTMENT_REQUEST_TIMEOUT_MS must be between 1000 and 120000"
  exit 2
fi

if (( 10#$MAX_ATTEMPTS < 1 || 10#$MAX_ATTEMPTS > 5 )); then
  log "appointment activation failed: DIIS_APPOINTMENT_MAX_ATTEMPTS must be between 1 and 5"
  exit 2
fi

if (( 10#$RETRY_DELAY_SECONDS > 300 )); then
  log "appointment activation failed: DIIS_APPOINTMENT_RETRY_DELAY_SECONDS must be between 0 and 300"
  exit 2
fi

run_once() {
  docker exec \
    -e DIIS_APPOINTMENT_ENDPOINT_PATH="$ENDPOINT_PATH" \
    -e DIIS_APPOINTMENT_REQUEST_TIMEOUT_MS="$REQUEST_TIMEOUT_MS" \
    "$API_CONTAINER" \
    node -e '
const http = require("node:http");

const token = process.env.APPOINTMENT_AUTOMATION_TOKEN || "";
const endpointPath = process.env.DIIS_APPOINTMENT_ENDPOINT_PATH || "/api/v1/appointments/activate-due";
const timeoutMs = Number(process.env.DIIS_APPOINTMENT_REQUEST_TIMEOUT_MS || 30000);

const finish = (payload, code) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(code);
};

const safeFailure = (statusCode, error) => ({
  ok: false,
  statusCode,
  endedCount: 0,
  cancelledCount: 0,
  activatedCount: 0,
  affectedUserCount: 0,
  error,
});

const validateCounts = (json) => {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return null;
  }
  const fields = ["endedCount", "cancelledCount", "activatedCount", "affectedUserCount"];
  const keys = Object.keys(json);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    return null;
  }
  const counts = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(json, field)) return null;
    const value = json[field];
    if (!Number.isInteger(value) || value < 0) return null;
    counts[field] = value;
  }
  return counts;
};

if (token.length < 32) {
  finish(safeFailure(0, "token_unavailable"), 2);
}

const req = http.request({
  host: "127.0.0.1",
  port: 3001,
  method: "POST",
  path: endpointPath,
  headers: {
    accept: "application/json",
    "x-diis-automation-token": token,
  },
}, (res) => {
  let body = "";
  res.setEncoding("utf8");
  res.on("data", (chunk) => {
    body += chunk;
    if (body.length > 8192) {
      req.destroy(new Error("response_too_large"));
    }
  });
  res.on("end", () => {
    const statusCode = res.statusCode || 0;
    try {
      if (statusCode < 200 || statusCode >= 300) {
        finish(safeFailure(statusCode, "http_non_2xx"), 1);
      }

      const json = JSON.parse(body);
      const counts = validateCounts(json);
      if (!counts) {
        finish(safeFailure(statusCode, "invalid_response_contract"), 1);
      }

      finish({
        ok: true,
        statusCode,
        ...counts,
      }, 0);
    } catch {
      finish(safeFailure(statusCode, "invalid_response_json"), 1);
    }
  });
});

req.setTimeout(timeoutMs, () => req.destroy(new Error("request_timeout")));
req.on("error", (error) => {
  finish(safeFailure(0, error.message), 1);
});
req.end();
'
}

attempt=1
last_status=1
last_result=""

while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  set +e
  result="$(run_once)"
  status=$?
  set -e

  if [ "$status" -eq 0 ]; then
    log "appointment activation result: $result"
    exit 0
  fi

  last_status="$status"
  last_result="$result"
  log "appointment activation attempt ${attempt}/${MAX_ATTEMPTS} failed: ${result:-no result returned}"

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    sleep "$RETRY_DELAY_SECONDS"
  fi
  attempt=$((attempt + 1))
done

log "appointment activation failed after ${MAX_ATTEMPTS} attempt(s): ${last_result:-no result returned}"
exit "$last_status"
