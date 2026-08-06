# Wave 3 AI Ollama Degraded Fallback Follow-up

Tanggal: 2026-08-06

## Trigger

After PR #443 deployed to staging, forced Ollama fallback still timed out for real saved-RPP generation.

Additional direct isolation from `smk-staging-api` showed:

- Short "return this JSON" Ollama request: HTTP 200.
- Compact Modul Ajar prompt: timeout around 30 seconds.

Conclusion: the VPS Ollama/Qwen 1.5B runtime is healthy for small deterministic JSON tasks, but not reliable for contextual Modul Ajar generation within the current 30s budget.

## Remediation

Ollama fallback is now a degraded deterministic local fallback:

- DIIS builds a safe JSON patch from authoritative saved RPP context.
- Ollama is asked to return only that JSON object without modification.
- Request still goes through local Ollama and `responseFormat: "json_object"`.
- Zod backend remains the final fail-closed validator.
- OpenAI primary path remains full section-specific JSON Schema.
- PII still stays local-only; fallback prompt does not include raw browser context or credentials.

This keeps the production fallback operational when OpenAI quota/credit/usage is exhausted, without pretending the local 1.5B model can reliably perform full contextual generation under load.

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

1. Force staging-only provider circuit open.
2. Generate `sarana` via authenticated browser GURU session.
3. Expected: HTTP 2xx and valid keys `sarana`, `target`.
4. Confirm Super Admin banner shows fallback.
5. Confirm audit model `ollama`.
6. Clean circuit/probe/notice keys and confirm provider status closed.

Main remains HOLD until this passes.
