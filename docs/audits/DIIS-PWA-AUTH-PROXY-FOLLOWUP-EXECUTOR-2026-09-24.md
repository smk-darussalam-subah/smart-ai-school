# DIIS PWA Auth Proxy Follow-up Executor Report

Date: 2026-09-24
Verdict: `SOURCE COMPLETE - INDEPENDENT REVIEW AND STAGING HOLD`

## Scope and Binding

- Repository: `smk-darussalam-subah/smart-ai-school`
- Branch: `fix/pwa-auth-proxy-followup-20260924`
- Baseline `origin/develop`: `beea4243574fe59f398d78d16be583d66321e441`
- Baseline tree: `7f2c34076aeb3174e057487a6100cdb5d7d779f8`
- Trigger: staging PWA QA observed authenticated browser calls to `/api/backend/*` reaching the API without a bearer token and returning HTTP 401.
- Follow-up review: `DIIS-PWA-AUTH-PROXY-FOLLOWUP-INDEPENDENT-SOURCE-REVIEW-2026-09-24.md`, SHA-256 `1cc27388c798c672ab42d77b1740ec2a5b2657882d34803d7b1cbc7708ea9b59`.
- Source delta: five paths. This gate did not commit, push, open a PR, deploy, or mutate staging/production.

## Root Cause

Two source conditions formed the failure:

1. `next.config.js` rewrote `/api/backend/:path*` directly to the Nest API. The rewrite bypassed the authenticated Next.js route handler that is responsible for deriving the bearer token from the NextAuth session.
2. The route handler used ambient `getServerSession(authOptions)`. The repaired handler now resolves the token from the actual incoming `NextRequest`, which also gives deterministic behavior for secure cookies in a standalone runtime.

A related completion-sweep issue was closed at the same boundary: malformed encoded `Authorization` input could make `next-auth/getToken` throw in middleware. Middleware now treats that condition as an absent session and fails closed.

The independent review then identified two related header-boundary defects: the generic header copier also forwarded the NextAuth cookie and caller-supplied proxy identity. Both are closed by the same explicit request-header allowlist. No client-IP header is reconstructed because this gate has no independently proven ingress overwrite-only contract.

## Changes

1. Removed the stale `/api/backend` rewrite so requests reach the authenticated route handler.
2. Bound token lookup to `NextRequest` using `getToken`, with malformed or undecodable session material resolving to no token.
3. Replaced copy-all request forwarding with an explicit allowlist for representation, negotiation, conditional, range, and authorization headers.
4. Never forwards `cookie`, `set-cookie`, `forwarded`, `x-forwarded-*`, `x-real-ip`, CDN client-IP headers, arbitrary `x-*`, or caller user-agent to NestJS.
5. Preserved an explicit caller-provided `Authorization` header; the proxy derives a bearer only when the header is absent.
6. Kept request method, query, body, required application headers, and response behavior intact.
7. Added a regression suite using real encrypted NextAuth cookies, proxy-identity spoofing controls, allowlist behavior, and source-contract checks for the removed bypass.
8. Kept middleware public/protected-route behavior unchanged while making malformed authentication input fail closed.

## Source Manifest

Aggregate algorithm: SHA-256 over the UTF-8, LF-separated manifest lines shown below, with a trailing LF. Each line is `<sha256><two spaces><repository-relative path>`.

```text
3299b872530979f3d45bb707ad4ceb13e2fb559df3937152f24ab5f0445bb91a  apps/web/next.config.js
7a7b29a4085aa3c879644e8428412c87dba4d5bc1043006808448ee7d019b8c9  apps/web/src/app/api/backend/[...path]/route.ts
452e6303543c449bf1cd3c3f91881733bf899a55008a6f1469d1efc890e6b4b3  apps/web/src/middleware.ts
f4945d68dee9e376d10436e350f01ae16e1bef440eeb65c9dbeaddfe847aeba7  apps/web/src/__tests__/api-backend-proxy-auth.test.ts
396f3ec05a133bf14d924c55aa6ee09c9f38b969ca37c4587623d15dc9c48e54  apps/web/src/__tests__/w10d-auth-security.test.ts
```

Source aggregate SHA-256: `807782275db3b7330abb662f7be7d110be0f1371af046e4e64a0e91ac66aff5e`

## Verification

- Focused Jest: 5 suites, 106 tests passed.
- Final auth-proxy regression after adding the explicit `set-cookie` control: 1 suite, 7 tests passed.
- Web type-check: passed.
- Web lint: passed; only existing tool notices were emitted.
- Web production build: passed, 50/50 pages generated; `/api/backend/[...path]` is a dynamic route.
- Standalone runtime proof with synthetic-only credentials:
  - a valid encrypted secure NextAuth cookie reached a synthetic API with the expected bearer;
  - POST method and request body were preserved;
  - malformed cookie material did not create an authorization header;
  - the stale rewrite was demonstrated to bypass the handler before removal and no longer did so after the change.
- Header-boundary behavioral proof:
  - valid, malformed, and explicit-bearer requests never forward the session cookie;
  - caller-supplied proxy, edge, CDN client-IP, user-agent, and arbitrary `x-*` headers do not reach the backend fetch;
  - the application allowlist retains `Accept`, `Accept-Language`, `Content-Type`, conditional request headers, `Range`, and `Authorization`.
- Prettier: all five source paths passed.
- `git diff --check`: passed.
- Secret scan: no credential, private key, or secret value found.
- Staged files: zero.
- Temporary local listeners on ports 3101 and 3901: zero.
- Dependency installation reported zero audit vulnerabilities; no dependency or lockfile changed.

## Negative Controls

- Missing cookie cannot invent a bearer token.
- A decoded token without `accessToken` cannot invent a bearer token.
- Malformed cookie/session input fails closed.
- Malformed encoded bearer input does not crash middleware and cannot enter a protected page.
- Explicit `Authorization` is not overwritten by session-derived state.
- Valid encrypted session cookie produces a bearer without forwarding the cookie.
- Malformed cookie and explicit-bearer paths do not forward cookie material.
- Spoofed `forwarded`, `x-forwarded-*`, `x-real-ip`, `cf-connecting-ip`, `true-client-ip`, `x-client-ip`, and arbitrary `x-*` headers are dropped.
- Headers outside the explicit application allowlist, including caller `user-agent`, are dropped.
- Reintroducing the `/api/backend` rewrite fails the source contract.

## Boundaries and Next Gate

This source gate does not claim that staging reconnect submission or teacher monitoring has been revalidated. Those scenarios require the exact reviewed bytes to be packaged, merged, deployed, and then rerun against staging. The unchanged server-domain assessment evidence may be reused where its source and runtime inputs remain byte-identical.

Next action: a narrow independent re-review of the two changed closure paths, five-path manifest, and two updated handoff artifacts. If approved, use literal seven-path Git packaging and exact-head CI, then stop before merge.

Rekomendasi model untuk tindak lanjut
Task berikutnya: Independent Reviewer memverifikasi allowlist request, negative controls cookie/proxy identity, manifest 5/5, dan dua handoff; packaging serta staging tetap HOLD.
Model / effort: GPT-5.6 Sol (`gpt-5.6-sol`) / high.
Alasan: delta sempit tetapi menentukan batas credential dan integritas atribusi audit web-to-API.
Syarat kualitas: tidak ada cookie atau header identitas caller yang mencapai NestJS, sementara bearer dan header aplikasi yang dibutuhkan tetap berfungsi.
Eskalasi bila: kebutuhan client-IP harus dipertahankan tetapi kontrak ingress overwrite-only belum tersedia -> GPT-6 Astra / high.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
