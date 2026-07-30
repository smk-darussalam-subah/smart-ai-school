# Wave AI-0B Modul Ajar Operational Provider Evidence

Tanggal eksekusi: 2026-07-30

Verdict executor: FOLLOW-UP REQUIRED

## Authorization And Target

- Director/operator approved AI-0B operational provider gate for staging only.
- Approved target: `appuser@204.168.242.123`.
- SSH key checked without reading key content: `C:\Users\USER\.ssh\id_ed25519_deploy` exists.
- SSH access succeeded as `appuser`.
- Scope honored: no Git commit, push, PR, deploy, production promotion, timer change, database mutation, schema change, Keycloak role mutation, or appointment/TF2 mutation.

## Staging Runtime Identity

- Staging repo path inspected read-only: `/opt/diis-staging/smart-ai-school`.
- Staging deployed SHA: `a3fcbd3662cf7051a8c2d7f8385126e43013f7f8`.
- Staging API health endpoint: HTTP 200.
- Staging containers observed running:
  - `smk-staging-api`: running and healthy.
  - `smk-staging-web`: running.
  - `smk-ollama`: running.
- Production source SHA was read only as containment proof: `68d114ced0ac7a68ce071452d50725561b7daa26`.

## Effective Provider And Model

Redacted effective environment from running `smk-staging-api`:

- `AI_PROVIDER`: `ollama`.
- `OPENAI_API_KEY`: unset.
- `OPENAI_CHAT_MODEL`: `gpt-4.1-mini`.
- `ANTHROPIC_API_KEY`: set, but not active for the AI-0A OpenAI gateway path.
- `OLLAMA_URL` host category: `ollama:11434`.
- `OLLAMA_CHAT_MODEL`: default category `qwen2.5:7b`.
- `OLLAMA_EMBED_MODEL`: `nomic-embed-text`.
- `OLLAMA_EMBED_DIMENSIONS`: `768`.
- `NODE_ENV`: `production`.

Conclusion: staging is currently configured for local Ollama chat/generate, not OpenAI cloud generation.

Follow-up after operator note:

- A redacted key-name check found `OPENAI_API_KEY` present in `/opt/diis-staging/smart-ai-school/.env`.
- The deploy workflow uses `infrastructure/docker/.env.staging` for staging compose, not the repository-root `.env`.
- A redacted key-name check found `infrastructure/docker/.env.staging` only had `ANTHROPIC_API_KEY` among AI provider keys; `AI_PROVIDER`, `OPENAI_API_KEY`, and `OPENAI_CHAT_MODEL` were absent there.
- The running `smk-staging-api` therefore reports `OPENAI_API_KEY` unset and `AI_PROVIDER=ollama`.
- Root cause is staging secret/env wiring, not proof that the OpenAI key was never configured.
- Source follow-up now makes the staging compose override and staging env example explicit for `AI_PROVIDER`, `OPENAI_API_KEY`, and `OPENAI_CHAT_MODEL`.
- To use OpenAI on staging, the controlled staging env must explicitly set `AI_PROVIDER=openai` and provide a staging OpenAI key in the deploy env file.

## Provider Health

Ollama tags and model inventory:

- `/api/tags`: HTTP 200.
- Configured chat model present: yes.
- Model inventory count: 2.
- Models observed by name only:
  - `qwen2.5:7b`, size 4.7 GB.
  - `nomic-embed-text:latest`, size 274 MB.

Embedding path:

- Synthetic non-PII embedding probe through `smk-staging-api` to Ollama succeeded.
- Embed model: `nomic-embed-text`.
- HTTP status: 200.
- Vector length: 768.
- Elapsed: 939 ms.

Chat/generate path:

- Synthetic non-PII chat/generate probe through `smk-staging-api` to Ollama failed.
- Configured model: `qwen2.5:7b`.
- HTTP status: 500.
- Elapsed: 119673 ms.
- Response output length: 0.
- Done flag: false.

Relevant redacted Ollama log evidence:

- Host memory visible to Ollama: total 3.7 GiB.
- Model load requirement logged:
  - model weights about 4.1 GiB;
  - KV cache about 224 MiB;
  - total memory about 4.3 GiB.
- Ollama runner load failed with exit code `-1`.
- `/api/generate` returned 500 after about 1m59s.
- `docker inspect smk-ollama` showed `OOMKilled=true`.

Conclusion: Ollama service and embedding are healthy, but the configured chat model cannot load on the current staging VPS memory profile. This directly blocks Modul Ajar generation when effective provider is `ollama`.

## Failure Drill

- Normal synthetic single-section provider call: failed at provider runtime because the active chat model cannot load.
- Local PII route: not executed as an application route because the same local chat model is already proven unable to load. Running a PII prompt would add no safety evidence and could add log risk.
- Cloud timeout/rate-limit simulation: not executed because `AI_PROVIDER=ollama` and `OPENAI_API_KEY` is unset. No cloud provider is active for AI-0A.
- Application-level `generate-rpp-step` staging drill: not executed because AI-0A source is not deployed to staging yet by design. This AI-0B gate is operator/provider evidence only.

Expected behavior after remediation:

- If staging remains local-only, configure a chat model that fits the VPS memory limit, or increase available memory and prove `/api/generate` succeeds within a bounded timeout.
- If staging should use cloud for non-PII, set `AI_PROVIDER=openai` with a rotated staging-only OpenAI key and prove non-PII cloud call succeeds while PII still routes local-only.

## Credential And Secret Hygiene

Local credential source:

- Ignored local `.env.production` exists.
- It contains multiple credential categories by key name, including AI/provider and infrastructure credentials.
- Values were not printed, copied, committed, or written to report.
- Per AI-0B prompt, credentials in this ignored local file must be treated as exposed until revoked/rotated by the provider/operator owner.
- Rotation status: not verified. Codex does not have provider-console proof in this session.

Tracked source and diff scan:

- Tracked source marker scan found only example/rule/template categories, not active code diff secrets.
- Current AI-0A diff marker scan found 0 files for the checked secret patterns.
- Recent staging logs marker scan after smoke found:
  - `smk-staging-api`: 0 sensitive or synthetic prompt markers.
  - `smk-ollama`: 0 sensitive or synthetic prompt markers.

No command output in this report contains secret values, connection strings, tokens, or API keys.

## No-Mutation Confirmation

Actions performed:

- Read-only SSH connectivity check.
- Read-only container status/env category inspection.
- Synthetic Ollama provider probes.
- Read-only logs/stats/inspect checks.
- Local source/diff secret marker scans.
- Report file creation in workspace.

Actions not performed:

- No database writes or SQL.
- No Keycloak mutation.
- No production container/env/timer mutation.
- No staging deploy or container recreate.
- No Git staging, commit, push, PR, or merge.
- No provider-console credential rotation.

## Required Follow-Up Before Git Packaging Or Staging QA

1. Decide provider mode for staging:
   - Option A: local-only, replace `qwen2.5:7b` with a smaller proven chat model or increase VPS memory.
   - Option B: cloud non-PII via OpenAI, with rotated staging-only key, staging compose wiring for `AI_PROVIDER`/`OPENAI_API_KEY`/`OPENAI_CHAT_MODEL`, and `AI_PROVIDER=openai`.
2. Rotate/revoke credentials represented by ignored local `.env.production`, or provide operator proof that the old values are already dead.
3. Recreate only staging API if environment changes are required.
4. Rerun AI-0B:
   - effective provider/model redacted;
   - local PII-capable chat route;
   - normal synthetic non-PII generation;
   - stable failure code behavior where applicable;
   - secret/log scan.
5. Only after AI-0B passes: proceed to explicit Git packaging for AI-0A, deployment to staging, and integrated browser QA Wave 3.

## Source Follow-Up Prepared

After operator confirmation that OpenAI is the intended chat/generate provider, the source follow-up prepared these non-secret changes:

- `.env.example` now documents `AI_PROVIDER`, `OPENAI_API_KEY`, and `OPENAI_CHAT_MODEL`.
- `infrastructure/docker/.env.staging.example` now documents the same staging AI provider keys.
- `infrastructure/docker/docker-compose.staging.yml` now explicitly passes the OpenAI provider variables to `smk-staging-api`.
- A staging runtime follow-up found `OLLAMA_CHAT_MODEL` was also absent from the effective `smk-staging-api` environment. The staging override now explicitly passes `OLLAMA_CHAT_MODEL`, `OLLAMA_EMBED_MODEL`, and `OLLAMA_EMBED_DIMENSIONS`; staging defaults the local chat model to `qwen2.5:1.5b` to avoid the observed `qwen2.5:7b` memory failure on the current VPS profile.

Local verification after this source follow-up:

- API focused tests: 3 suites / 39 tests passed.
- Web focused tests: 1 suite / 8 tests passed.
- API type-check: passed.
- Web type-check: passed.
- API lint: passed.
- Web lint: passed with only existing Next lint deprecation/plugin warning.
- API build: passed.
- Web build: passed, 39/39 pages.
- `docker compose -f infrastructure/docker/docker-compose.yml -f infrastructure/docker/docker-compose.staging.yml config --quiet`: passed with expected local missing-env warnings because no real secrets were loaded.
- Secret pattern scan of edited env examples/report/config found placeholders only, no active credential values.

## Request To Reviewer

Please review AI-0B evidence with the following finding in mind:

- Source containment AI-0A is approved, but staging runtime provider is not operational for generation.
- The current blocker is not DTO/UI containment; it is runtime provider configuration/capacity and credential rotation proof.
