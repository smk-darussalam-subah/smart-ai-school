# Wave 3 AI Ollama Fallback Runtime Follow-up

Tanggal: 2026-08-06

## Trigger

Targeted staging browser QA pada `42662c3f7bdbedccbe225275e8bc01f1d4c1a01a` menemukan forced Ollama fallback gagal:

- `sarana`: HTTP 500, sekitar 30 detik.
- `refleksi`: HTTP 500, sekitar 30 detik.
- API log: `AI_PROVIDER_TIMEOUT`.
- Direct lightweight Ollama request dari `smk-staging-api` tetap berhasil HTTP 200 dalam sekitar 2,7 detik.

Interpretasi: container/model Ollama hidup, tetapi structured Modul Ajar fallback terlalu berat untuk runtime budget saat dikirim dengan JSON Schema penuh.

## Remediation

Perbaikan sempit:

- OpenAI tetap memakai section-specific JSON Schema.
- Ollama fallback/circuit sekarang memakai `responseFormat: "json_object"` supaya adapter mengirim `format: "json"`.
- Prompt tetap menyertakan kontrak schema teks ringkas.
- Zod backend tetap menjadi validator final fail-closed.
- Tidak ada schema, dependency, infrastructure, Keycloak, scheduler, atau production change.

File source:

- `apps/api/src/ai/ai-generate.service.ts`
- `apps/api/src/__tests__/ai-generate.spec.ts`

## Local Verification

- `npm.cmd --workspace apps/api test -- --runInBand --forceExit apps/api/src/__tests__/ai-generate.spec.ts apps/api/src/__tests__/ai-gateway.spec.ts apps/api/src/__tests__/ai-provider-status.spec.ts apps/api/src/__tests__/notification.spec.ts`
  - 4 suites / 91 tests pass.
- `npm.cmd --workspace apps/api run type-check`
  - pass.
- `npm.cmd --workspace apps/api run lint`
  - pass.
- `git diff --check`
  - pass.

## Required Staging Re-QA

After deploy:

1. OpenAI browser generation for `kegiatan` remains HTTP 2xx and contains `diferensiasi`.
2. Force staging-only circuit open.
3. Generate at least `sarana` or `refleksi` through authenticated browser session.
4. Confirm HTTP 2xx and audit model `ollama`.
5. Confirm Super Admin provider banner shows fallback while circuit is open.
6. Clean circuit/probe/notice keys.
7. Confirm provider status returns `effectiveProvider=openai`, `openaiCircuit=closed`.

Main / production remains HOLD until forced Ollama fallback passes in staging.
