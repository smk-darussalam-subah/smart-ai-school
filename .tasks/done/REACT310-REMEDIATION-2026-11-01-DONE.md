# React #310 — local source remediation

Executor result: **LOCAL SOURCE/INTEGRATION PASS — INDEPENDENT RE-REVIEW PASSED.**
The original red regression remains intact. No Git publication or remote runtime
action occurred. Independent review closed #310 on this exact local candidate;
this is not staging/production acceptance.

The background heartbeat/login Server Actions invoke `getActionSession`, which
writes NextAuth cookies. Baseline HTTP traces carry cookie revalidation flag
`x-action-revalidated: [[],0,1]` during the denied Executive redirect, with #310.
These two background callers now use `/api/auth/activity`: a same-origin,
authenticated, strict JSON endpoint that persists rotated cookies and forwards
the same API operations without a Flight/RSC navigation. The shared auth helper,
attendance engine, permissions and Executive guard are unchanged.

Source: two providers, one client helper, one Web route, and two focused test
files. The existing browser harness gains native-activity/HTTP assertions and
bounded image-source binding for baseline comparisons. No dependency/schema,
API service, shared ingress or styling changes are included.

Final image `diis-react310-web:final-20261101`, ID
`sha256:bf7311b10ae556b12e2759305b52e4a54e096963f2e23c7304ed94dda6f07ff0`:
841/841 input hashes match. Next15.5.28/React19.2.6/Sharp0.35.5 remain unchanged.
All five built-browser journeys and nine HTTP controls pass. Linux focused tests
106/106 pass; eight oracle tests remain valid. Tests use synthetic signed sessions
and an HTTP backend adapter, not real SSO, Nest/database, GPS or staging.

The normal Dockerfile build was canceled after about 15 minutes. npm ci had
completed (#10 DONE 868.6s), the three package builds had completed, and the last
recorded stage was Next's optimized production build. The cause of the delay and
the full build outcome remain undetermined; it is not PASS. A clean Next
compilation used a previously verified Linux builder
with nine byte-matching dependency manifests; the old .next output was deleted
inside that disposable image. Standard clean-install/CI proof remains PENDING.

Evidence and full handoff are in outer workspace
`output/react310-remediation-20261101/`, including final-five-http/RESULT.json,
retained failed before-traces, source manifest and screenshot gallery. Full report:
`docs/audits/DIIS-REACT310-LOCAL-REMEDIATION-HANDOFF-2026-11-01-REV1.md`.
REV1 corrects the P3-E01 build narrative and two task notes only; original logs,
receipts, handoff and evidence seal are retained unchanged. The correction is in
`output/react310-evidence-correction-20261101/`.

Next, only after separate authorization: literal packaging and clean-install
exact-candidate CI with **GPT-6.1 Terra / medium**; retain denial, cookie
persistence, attendance and red-to-green assertions. Git, staging,
production, old residuals and commissioning remain HOLD.
