# AI OpenAI Runtime Provider Correction

Tanggal: 2026-07-30

## Keputusan

Provider AI final untuk generate/chat non-PII adalah OpenAI dengan model
`gpt-4.1-mini`.

Ollama tetap dipertahankan untuk embedding dan rute lokal sesuai containment PII.

## Runtime Correction

Target VPS: `appuser@204.168.242.123`

File konfigurasi runtime yang dikoreksi:

- Staging: `/opt/diis-staging/smart-ai-school/infrastructure/docker/.env.staging`
- Production: `/home/appuser/smart-ai-school/infrastructure/docker/.env`

Nilai efektif setelah recreate API:

- Staging: `AI_PROVIDER=openai`, `OPENAI_CHAT_MODEL=gpt-4.1-mini`
- Production: `AI_PROVIDER=openai`, `OPENAI_CHAT_MODEL=gpt-4.1-mini`

OpenAI API key diverifikasi hadir tanpa mencetak nilai secret.

## Backups

Backup env dibuat sebelum perubahan:

- Staging provider/model: `.env.staging.bak-20260730085245`
- Production provider/model: `.env.bak-20260730085245`
- Staging key patch: `.env.staging.bak-openai-key-20260730085653`
- Production key patch: `.env.bak-openai-key-20260730085653`

## Verification

Container env redacted:

- Staging: provider `openai`, model `gpt-4.1-mini`, key present.
- Production: provider `openai`, model `gpt-4.1-mini`, key present.
- Remote/container temporary secret files: absent.

Direct OpenAI smoke from containers:

- Staging: HTTP 200, model `gpt-4.1-mini`, marker matched, elapsed 797 ms.
- Production: HTTP 200, model `gpt-4.1-mini`, marker matched, elapsed 8847 ms.

Public health:

- Staging API health: HTTP 200.
- Production API health: HTTP 200.
- `smk-staging-api` and `smk-api`: healthy.

Local source verification:

- `git diff --check`: pass.
- `npm run type-check --workspace apps/api`: pass.
- `npm run test --workspace apps/api -- --runTestsByPath src/__tests__/ai-generate.spec.ts src/__tests__/ai-gateway.spec.ts`: 2 suites / 25 tests pass.

## Source Hardening

Repo defaults were updated so future deployments do not drift back to the old
Ollama provider default:

- `.env.example`
- `infrastructure/docker/.env.staging.example`
- `infrastructure/docker/docker-compose.yml`
- `infrastructure/docker/docker-compose.staging.yml`
- `apps/api/src/ai/ai.module.ts`

## Residual

This correction proves provider reachability and runtime configuration. Full browser
QA for AI Modul Ajar generation, LMS Wave 3, and output quality remains a separate
staging evidence gate.
