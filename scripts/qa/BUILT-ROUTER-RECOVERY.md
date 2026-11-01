# Built-browser denial and recovery regression

This lab runs an existing Linux standalone Web image, the actual middleware,
route authority, providers, server actions, proxy, App Router, and client UI.
The Guru session is encrypted locally. Backend responses are synthetic HTTP
fixtures: this does **not** test Keycloak, Nest guards, PostgreSQL or live ingress.
No dependency installation or school data is needed.

The baseline exception remains **OPEN**. A successful redirect and interactive
Beranda do not make a journey pass if React emitted an exception. Exit `1` is
an assertion failure; exit `2` is a setup/harness failure. Failed receipts must
be retained. Do not add an expected-failure waiver or ignore React #310.

Run from the selected checkout, using absolute installed-tool/evidence paths:

```powershell
node scripts/qa/built-router-recovery.cjs `
  --image diis-pr733-next-web:local-20261031 `
  --image-receipt C:/Users/USER/Documents/Claude/Projects/DIIS/output/pr733-next-api-guard-remediation-20261031/WEB-EVIDENCE-REUSE.json `
  --input-binding C:/Users/USER/Documents/Claude/Projects/DIIS/output/pr733-next-api-guard-remediation-20261031/WEB-CONSUMED-INPUTS.json `
  --playwright-module C:/Users/USER/.codex/tools/diis/node-tools/node_modules/@playwright/test `
  --next-auth-module C:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school-learning-ai-package-20261025/node_modules/next-auth/jwt `
  --openssl-exe 'C:/Program Files/Git/usr/bin/openssl.exe' `
  --output-dir C:/Users/USER/Documents/Claude/Projects/DIIS/output/react310-new-run `
  --profile split-authority

node --test scripts/qa/router-recovery-contract.test.cjs
```

The input manifest must match the selected checkout and the reviewed image
digest. After an application fix, build a new image and provide a newly bound
input manifest and image receipt. Never relabel a stale image as the fixed one.

For the repaired candidate, add `--expect-json-activity`: each Guru journey must
complete heartbeat/login through HTTP204 without a Server Action dispatch. Nine
additional actual-HTTP controls verify valid activity, anonymous/foreign-origin
denial, invalid input and method, and JSON-only responses. These controls are
separate from the five browser journeys. The real attendance provider must still
offer its location-check action; no check-in/out mutation is attempted.

The locally tested repaired image is `diis-react310-web:final-20261101`. Use
`output/react310-remediation-20261101/FINAL-IMAGE-RECEIPT.json` and
`FINAL-WEB-CONSUMED-INPUTS.json` in the outer DIIS workspace for the two binding
options, plus a fresh output directory. This image uses verified dependency
reuse followed by a clean Next compilation; it is not proof that the canceled
standard Dockerfile clean install passed. Keep that CI obligation explicit.

`--input-root <absolute frozen source folder>` is only for a bound historical
image whose source differs from the current working tree. Every manifest entry
is still verified under that root; the selected image digest must match its
receipt. This never allows a changed working tree to be called byte-identical
to an old image. Candidate proofs use the current checkout as the default root.

Five journeys cover direct Guru entry, two fresh desktop denied entries, mobile
denial, and anonymous denial. Listeners start before navigation and remain active
through completed hydration and a native click; desktop additionally navigates
to Panduan and back. The mobile menu must open and close with Escape. Screenshots,
exceptions, console diagnostics, network paths/statuses, backend call metadata,
source binding and cleanup are recorded without authentication material.

Timing profiles: `immediate`, `authority-delayed` (750 ms authority reads),
`split-authority` (alternating auth/me reads delayed 1500 ms), `slow-client`
(100 ms latency, 500 kB/s download, 200 kB/s upload, CPU x4), `warm-context`,
and `native-browser` (warm context with PWA enabled). These are deterministic
boundary probes, not measurements of production latency or capacity.

`--focused-denial` runs only the first desktop denied journey. The diagnostic
`--without-attendance-provider` omits one permission **only in the synthetic
fixture**; it is a counterfactual, never a proposed permission change or fix.
The default fixture enables the real AttendanceEngine without recording attendance
or requesting GPS. No check-in/out endpoint is implemented in the fixture.

Chrome is an isolated headless process, with non-loopback DNS disabled. HTTPS
uses an ephemeral self-signed localhost certificate; no OS trust changes occur.
The native-browser profile trusts that certificate only in its isolated browser.
Docker publishes only to 127.0.0.1, uses a loopback backend, and is removed after
testing; temporary keys are deleted. This is not a Docker network-none test.
Browser request interception is deliberately avoided because it disables cache.

The eight contract tests include the sanitized historical #310 observation. They
test the failure oracle, **not** a new browser reproduction. Browser receipts
are the application evidence. Earlier successful probes with the attendance
provider omitted cannot close the real Guru journey.
