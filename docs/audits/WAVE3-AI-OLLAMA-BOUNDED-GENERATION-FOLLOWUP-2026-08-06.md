# Wave 3 AI Ollama Bounded Generation Follow-up

Tanggal: 2026-08-06

## Trigger

After PR #441 deployed to staging, forced Ollama fallback still timed out:

- Browser generate `sarana`: HTTP 500 after about 30 seconds.
- API log: `AI_PROVIDER_TIMEOUT`.
- Direct lightweight Ollama JSON request from `smk-staging-api`: HTTP 200 in about 2.7 seconds.

This means Ollama is reachable, but structured Modul Ajar fallback still needs bounded generation controls.

## Remediation

Perbaikan sempit:

- Structured Ollama calls now send bounded generation options:
  - `temperature: 0.2`
  - `num_predict: 512`
- Normal narrative Ollama chat remains unchanged.
- OpenAI structured output behavior is unchanged.
- Zod remains the final fail-closed validator for DIIS section shape.

Files:

- `apps/api/src/ai/adapters/ollama.adapter.ts`
- `apps/api/src/__tests__/ai-gateway.spec.ts`

## Verification

- `npm.cmd --workspace apps/api test -- --runInBand --forceExit apps/api/src/__tests__/ai-generate.spec.ts apps/api/src/__tests__/ai-gateway.spec.ts apps/api/src/__tests__/ai-provider-status.spec.ts apps/api/src/__tests__/notification.spec.ts`
  - 4 suites / 91 tests pass.
- `npm.cmd --workspace apps/api run type-check`
  - pass.
- `npm.cmd --workspace apps/api run lint`
  - pass.
- `git diff --check`
  - pass.

## Staging Re-QA Required

After deploy:

1. Force staging-only OpenAI circuit open.
2. Generate `sarana` through authenticated GURU browser session.
3. Expected: HTTP 2xx, keys `sarana` and `target`, audit model `ollama`.
4. Clean circuit/probe/notice keys.
5. Confirm provider status closed.

Main remains HOLD until this staging re-QA passes.
