# W10-D Staging Cancellation Preservation Independent Review

Verdict: **APPROVED FOR EXPLICIT GIT PACKAGING**.

Scope: exact five-file source candidate below, reviewed locally on 2026-09-07 WIB.
This is source approval, not execution of Git packaging, merge approval, staging
sign-off, image publication, cleanup or production commissioning approval.

## Findings first

No remaining verified P0/P1/P2/P3 finding was identified in this affected slice.
P2-PSR03 is closed, and both previous P1 closures remain intact. External readiness
gaps are unchanged and are not converted into PASS by this source verdict.

| Finding | Independent result | Evidence |
| --- | --- | --- |
| P2-PSR03: cancellation lost on successful producer cleanup | CLOSED | Original HUP/INT/TERM command and canonical transaction reproductions now fail as interrupted/verified rollback, never forward success |
| P1-PSR01: unowned producer on spawn/setup interruption | Remains CLOSED | Actual spawn-boundary signal, selector creation/registration, cleanup-entry and repeated-signal tests reap children and prove group absence |
| P1-PSR02: rollback with unresolved producer cleanup | Remains CLOSED | Typed ambiguity/ownership guards retain snapshots and journal, reject subsequent commands, and prohibit rollback while absence is unproven |

## Why the fix holds

`infrastructure/deploy/staging-readiness-deploy.py:54` preserves signal
dispositions during producer cleanup instead of switching them to SIG_IGN.
The lifetime mask protects cleanup; pending cancellation survives until the
original mask is restored after reap and process-group absence checks.

At `run()` lines 196-209, cleanup failure is retained separately. A cancellation
raised while unmasking cannot replace a previously captured cleanup failure.
Unresolved ownership therefore continues to block commands and rollback.

Canonical transaction handling still distinguishes ordinary interrupted/failed
commands with proven termination from ProducerAmbiguous. Successful producer
completion alone does not imply successful deployment after cancellation.
Legitimate verified rollback remains available and is classified as failed/no-retry,
not as successful deployment. No broad source rewrite was needed.

This is an operational cancellation/recovery boundary, not evidence of an
untrusted remote-user exploit. No claim about actual production behavior or
damage is made from the synthetic reproduction.

## Exact binding

Checkout:
`C:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school-w10d-staging-readiness-20260906`.

Branch: `fix/w10d-staging-readiness-20260906`.
Local HEAD: `dcfb81b2935d15de212a4e9ed0fce885f1d4a76b`.
Base tree: `bff80d8dccaa99965bcfcb8bcc05ce1e88752e79`.
Approval binds the actual unstaged candidate bytes, not HEAD alone.

Executor report read in full:
`docs/audits/WAVE10-D-STAGING-CANCELLATION-PRESERVATION-FOLLOWUP-2026-09-07.md`.
Full SHA-256 verified:
`39bb8991c99a466899cf3d0da03dd31c686c3eb4d02b94e3e73a8af62eb3c602`.

| Approved source path | SHA-256 |
| --- | --- |
| .github/workflows/ci.yml | ba2107fc5549d3fe167fdda475cf1436402fd7f20c066a77c20cfe0299a76b2c |
| .github/workflows/deploy.yml | e19e6f0f302393cadd1f3f9d3d9816bd885c8b809aa1c7e03f003da9bf401d86 |
| infrastructure/deploy/staging-readiness-deploy.py | 80c79eb1febd04ec420fdc80d9202c8a8312cf8a3638b05549204eb2da01c102 |
| infrastructure/deploy/tests/staging-readiness-contract.py | 72d095cc08fbc72f416a7871fe1e2a39ea09f03df0a2a2020bbd22e3ce934adb |
| docs/runbooks/w10d-staging-readiness.md | 8a993cb038beea205c778c7831be52b9f3dcd0abe5ef19fd24b8ff4e646d6002 |

Workflow bytes match the previously reviewed candidate. This follow-up changes
producer logic, its tests and runbook only. No application, schema, dependency,
image recipe, capacity adapter or base Compose delta is added by this slice.

Historical reports/SBOMs are preserved and are not automatically approved package
contents. Any evidence documents included in packaging must be named explicitly
in its literal manifest. This review does not authorize staging all untracked files.

## Independent checks

Fresh WSL commands against this checkout:

```text
python3 -B infrastructure/deploy/tests/staging-readiness-contract.py
bash infrastructure/deploy/tests/deploy-lock-contract.sh
bash infrastructure/deploy/tests/shared-ingress-contract.sh
```

| Check | Result |
| --- | --- |
| Deployment contract | 45/45 PASS, 14.083 seconds reported by suite |
| Cancellation matrix | 24 subcases: three signals, successful/failing producer, four cleanup boundaries |
| Canonical transaction regression | Three signals produce failed/verified-rollback outcome, no source-result success, retained journal |
| Ambiguity precedence | Six subcases preserve typed ambiguity and block next spawn despite pending cancellation |
| Original reviewer reproducer, independently rerun outside suite | HUP/INT/TERM command and FakeHost transaction paths CLOSED; empty ownership registry |
| Deploy lock | 2/2 PASS, synthetic concurrency/timeout |
| Shared ingress | 21/21 PASS, fake-Docker behavioral harness |
| Executor hash and source manifest | Report MATCH; source 5/5 MATCH |
| Python AST | 2/2 PASS without bytecode generation |
| Literal source whitespace/conflict/credential-pattern scan | No findings; limited heuristic, not exhaustive secret audit |
| Git diff and cached diff | Clean; staged files zero |

The separate original reproduction used real short-lived Python children and
tracked FakeHost transaction adapters in private temporary directories. It
asserted interruption rather than byte return; after the synthetic merge,
transaction allowed exactly the verified rollback apply, no forward source-result
success, and retained the journal. Context-managed fixtures were cleaned.

No real Docker image/container/network was created. Compose use in tests was
config-only. Tests of unproven ownership use synthetic failure injection and
clear test-side ownership only after the fixture's absence checks.

## Tool routing and limitations

Used `diis-context-bootstrap --prepare-tools` and `diis-independent-review`.
Bootstrap resolved the named checkout/HEAD and refreshed two changed files in
machine-local CodeGraph tooling. These local indexing/configuration effects
are not deployable source changes or operational authorization.

CodeGraph was queried with the explicit checkout and maxFiles=2. Its generic
`run` name links included unrelated application symbols and missing inferred
test links; only the real Python source and direct behavioral evidence were
used for conclusions. No TypeScript reference work required Serena. No external
vulnerability scan/service was invoked or claimed. Fix-verification methodology
was used as a supplement, not as a replacement for the DIIS review contract.

The previous role/bootstrap instructions and local evidence were used; old
orientation dates were not treated as current remote operating truth.
No full application build/test, new CI run, live Docker up/rollback, provider
inspection, scanner installation, DNS/registry probe or SSH session was run.
These remain outside this local re-review. Source tests do not certify the
daemon-side completion of a real interrupted deployment; affected staging
runtime verification remains mandatory under its later approval.

## Next steps and gate boundaries

1. Under the applicable explicit Git instruction, package only the five approved
   source paths and separately named evidence files. Verify hashes, literal
   staged manifest and clean diff, then bind CI and PR review to the new commit.
   This Reviewer has not performed or implicitly authorized merge/deployment.
2. Continue independent prerequisite preparation for DNS, registry/scanner and
   capacity/writer preservation under their existing authorized scopes. Do not
   repeat unrelated application QA or rebuild a byte-identical image merely
   because the deployment controller changed.
3. Before staging, obtain current bounded evidence and the required exact-target
   approvals. Historical NXDOMAIN, 403, capacity and image evidence do not become
   current merely because source review passed. No early staging merge: its
   automatic deployment trigger is not an environment-review safety net.
4. Cleanup integration/action, image publication/pull configuration, DNS changes,
   staging rollout, backup/restore and commissioning remain separately gated.

Confidence is high for closure of the supplied source findings and tested
legitimate behavior. Live deployment, provider readiness and physical capacity
are not assessed as current. No percentage substitutes for those missing gates.

## Reviewer output and final status

Only this new DIIS review report was written; source, prior reports and unrelated
artifacts were preserved. No staging, commit, push, PR, protection change, VPS
access, credential handling, cleanup, publication, backup/restore, scheduler or
production mutation occurred. Machine-local bootstrap/index effects are disclosed
above. This report remains untracked pending an explicit evidence manifest.

Final: **APPROVED FOR EXPLICIT GIT PACKAGING** for the exact source hashes above.
**STAGING AND ALL OPERATIONAL MUTATIONS REMAIN HOLD.**
