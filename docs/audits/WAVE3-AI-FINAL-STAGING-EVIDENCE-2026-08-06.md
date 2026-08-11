# Wave 3 AI Final Staging Evidence

Tanggal: 2026-08-06

## Verdict

APPROVED FOR MAIN PROMOTION.

Staging QA targeted untuk AI Wave 3 sudah selesai setelah remediation bertahap pada Ollama fallback. Main promotion dapat dilanjutkan dengan catatan production deploy tetap harus diverifikasi setelah workflow main selesai.

## Final Staging Binding

- Final staging merge SHA: `4ab5905025555ef797393808a32bfe4e0849a94c`.
- Final staging deploy run: `31067430919`.
- VPS deployed SHA: `4ab5905025555ef797393808a32bfe4e0849a94c`.
- `smk-staging-api`: up and healthy.
- `smk-staging-web`: up.
- `smk-ollama`: up.
- Staging health endpoint from container: HTTP 200, status `ok`.

## Delivery Chain After Initial Hard Stop

### PR #440

- Change: Ollama fallback uses `responseFormat: "json_object"` while OpenAI keeps section JSON Schema.
- Develop merge SHA: `adffa426a13a142e4ddc1d52170f467f80158cab`.
- Promotion PR #441 staging merge SHA: `d18eda42085d8c2306858eba876db1840f15fd2b`.
- Result: source/CI passed, but staging forced fallback still timed out.

### PR #442

- Change: bounded structured Ollama generation options:
  - `temperature: 0.2`
  - `num_predict: 512`
- Develop merge SHA: `0dd7aca38ba1008d467d7598c3ac79328c6015b5`.
- Promotion PR #443 staging merge SHA: `48cd48db583ab9ecfe86a815e75d427b70fca221`.
- Result: source/CI passed, but staging forced fallback still timed out for contextual Modul Ajar prompt.

### PR #444

- Change: degraded deterministic local fallback for Ollama.
- DIIS builds a safe JSON patch from authoritative saved RPP context.
- Local Ollama is asked to return only that JSON object.
- Zod backend remains the final fail-closed validator.
- OpenAI primary path remains full section-specific JSON Schema.
- Develop merge SHA: `e7dc3d0d2ff260a0fe90dfbbfeffda190776809c`.
- Promotion PR #445 staging merge SHA: `4ab5905025555ef797393808a32bfe4e0849a94c`.
- Result: staging forced fallback passed.

## Verification Summary

For PR #440, #442, and #444:

- GitHub CI: Build Check, Lint & Type Check, Unit Tests all passed.
- Focused local checks per branch:
  - `ai-generate.spec.ts`
  - `ai-gateway.spec.ts`
  - `ai-provider-status.spec.ts`
  - `notification.spec.ts`
  - 4 suites / 91 tests passed.
- API type-check passed.
- API lint passed.
- `git diff --check` passed.

## Browser QA Results

Browser: Chrome extension.

Auth pattern:

- DB-backed synthetic users.
- Federated logout before role switching.
- No credentials, cookies, tokens, or real PII are stored in this report.

### Consent Incomplete

PASS.

- Synthetic GURU consent reset through official API path by synthetic Super Admin.
- GURU browser login redirected to `/consent`.
- Consent acceptance returned to `/dashboard`.
- Reload stayed on `/dashboard`.

### OpenAI Primary Generation

PASS.

- Authenticated synthetic GURU browser session.
- Saved RPP with active TeachingAssignment.
- Section: `kegiatan`.
- HTTP status: `201`.
- Duration: `5169 ms`.
- Output keys: `kegiatan`.
- Every kegiatan item had non-empty `diferensiasi`.

### Forced Ollama Fallback

Initial result before remediation: FAIL.

- `sarana`: HTTP 500 after about 30 seconds.
- `refleksi`: HTTP 500 after about 30 seconds.
- API error: `AI_PROVIDER_TIMEOUT`.
- Direct lightweight Ollama JSON request from `smk-staging-api`: HTTP 200 in about `2702 ms`.

Final result after PR #445: PASS.

- Staging-only circuit key opened:
  `diis:d9ca74d5766a:ai:openai:circuit`.
- Circuit detail: `qa_forced_circuit_after_pr445`.
- Authenticated synthetic GURU browser generation:
  - section: `sarana`
  - HTTP status: `201`
  - duration: `23876 ms`
  - output keys: `sarana`, `target`
- Output:
  - `sarana`: laptop praktik, kabel jaringan, perangkat penghubung, perangkat simulasi, dan lembar kerja.
  - `target`: peserta didik kelas kejuruan yang sedang mempelajari dasar jaringan lokal.

### Super Admin Provider Status

PASS.

While circuit was open, synthetic Super Admin saw provider status:

- `effectiveProvider=ollama`
- `openaiCircuit=open`
- `reason=quota_exhausted`
- `detailCode=qa_forced_circuit_after_pr445`

After cleanup:

- `effectiveProvider=openai`
- `openaiCircuit=closed`
- `reason=null`
- `detailCode=null`

### Audit Provider Model

PASS.

Latest audit row for `rpp-sarana` after forced fallback:

- `model=ollama`
- `tokensUsed=124`

## Cleanup

Deleted staging provider state keys:

- `diis:d9ca74d5766a:ai:openai:circuit`
- `diis:d9ca74d5766a:ai:openai:probe-lease`
- `diis:d9ca74d5766a:ai:openai:quota-notice`

Post-cleanup provider status is closed and OpenAI is effective again.

## Production Readiness Notes

- `main` was not modified before this report.
- Production deploy requires `REDIS_QUEUE_NAMESPACE=production`.
- Production Docker env-file has been prepared with `REDIS_QUEUE_NAMESPACE=production`.
- Production runtime still needs post-main verification:
  - deploy workflow success,
  - deployed SHA equals main,
  - `smk-api` healthy,
  - `smk-web` healthy,
  - production `REDIS_QUEUE_NAMESPACE=production`,
  - OpenAI provider status closed,
  - no forced circuit state left behind.
