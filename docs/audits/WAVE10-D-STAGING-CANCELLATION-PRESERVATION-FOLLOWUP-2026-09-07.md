# W10-D staging cancellation preservation: Executor follow-up

Verdict: **SOURCE COMPLETE - STAGING HOLD**.

Independent exact-manifest review remains required. Packaging and every operational mutation gate remain HOLD.

## Scope and exact binding

Evidence timestamp: 2026-09-07T03:21:23+07:00. All new evidence is local source inspection or synthetic WSL execution, not live staging/production proof.

- Checkout: `C:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school-w10d-staging-readiness-20260906`.
- Branch: `fix/w10d-staging-readiness-20260906`.
- HEAD: `dcfb81b2935d15de212a4e9ed0fce885f1d4a76b`; base tree: `bff80d8dccaa99965bcfcb8bcc05ce1e88752e79`.
- Candidate is the unstaged working-tree manifest below, not HEAD alone.
- Input review: `WAVE10-D-STAGING-PRODUCER-LIFECYCLE-INDEPENDENT-REVIEW-2026-09-07.md`, SHA-256 `e900938e22457b2591b0778c25109d19556c1c40c2f66d7a6e4e2e49bdc23cf7`.
- Prior Executor report is preserved: `WAVE10-D-STAGING-PRODUCER-LIFECYCLE-FOLLOWUP-2026-09-07.md`, SHA-256 `d413a05f2959a2e57d284930e1f70ebfde2af73d0cdc44747d4e56d259cb58df`. Its source manifest is superseded, not silently amended.

## Consolidated closure

**P2-PSR03: closed in candidate source, pending independent verification.** Installing SIG_IGN discarded signals pending after the command-success decision. Cleanup now preserves the original signal dispositions and uses the existing blocked-signal lifetime for bounded cleanup. No handler transition to SIG_IGN occurs in producer cleanup. Pending HUP/INT/TERM propagates on restoration of the original mask, after child reap and group-absence verification, including when the command itself succeeded.

Cleanup failure is retained separately while restoring the mask. If unmasking raises cancellation, an existing cleanup failure takes precedence. Typed `ProducerAmbiguous` and unresolved ownership continue to prevent subsequent commands, rollback and recovery-snapshot deletion. Ordinary failed commands with proven cleanup retain the original bounded rollback path.

The existing P1 ownership fixes are preserved: spawn and selector initialization remain inside the protected cleanup scope, the mask spans producer ownership, and ownership is removed only after verified cleanup. No change to workflow, capacity adapter, application, dependency, schema, image or provider configuration was needed.

Completion sweep covered the late-success boundary, already-failing commands, repeated signals, cleanup mask entry, resource closure, transaction flow and ambiguity precedence. No further verified P0/P1/P2/P3 was found in this narrow Executor sweep. This is not an independent approval or exhaustive repository audit.

## Bukti Runtime

Commands executed from the named checkout under WSL:

```text
python3 -B infrastructure/deploy/tests/staging-readiness-contract.py
bash infrastructure/deploy/tests/deploy-lock-contract.sh
bash infrastructure/deploy/tests/shared-ingress-contract.sh
```

| Verification | Result |
| --- | --- |
| Deployment | 45/45 PASS, 13.913 seconds |
| Cancellation command matrix | 24 subcases: 3 signals x 2 producer outcomes x 4 injection boundaries: cleanup entry, mask transition, kill escalation, selector close |
| Transaction regression | 3 subcases: successful synthetic merge command followed by each signal produces failed/verified-rollback outcome, one rollback apply, no source-result success, retained journal |
| Ambiguity precedence | 6 subcases: 3 signals x observation/resource-close failure; typed ambiguity preserved, next spawn prohibited, children reaped and groups absent |
| Previous lifecycle/rollback controls | All existing tests retained; obsolete handler-transition injection updated to the remaining mask transition |
| Deploy lock | 2/2 PASS, synthetic concurrency and timeout |
| Shared ingress | 21/21 PASS, fake-Docker contract, not a live ingress invocation |
| AST | 2/2 PASS via stdin to `python3 -m ast`, no bytecode files generated |
| Hygiene | Source/report whitespace and conflict-marker checks, Git diff/cached checks and targeted high-confidence secret-pattern scan; final results verified before handoff |
| Git | Staged files 0; no commit/push/PR/CI dispatch |

Tests use real short-lived synthetic Python subprocesses and private disposable filesystem fixtures. Child reaping, process-group absence and empty ownership are asserted on normal/interruption paths. Deliberately ambiguous test ownership is cleared only after test-side absence proof. Transaction temporary files use scoped context cleanup. Compose use is config-only: no real container/network/image build or mutation. No unrelated application suite was rerun.

## Literal manifest and local changes

| Candidate source path | SHA-256 |
| --- | --- |
| `.github/workflows/ci.yml` | `ba2107fc5549d3fe167fdda475cf1436402fd7f20c066a77c20cfe0299a76b2c` |
| `.github/workflows/deploy.yml` | `e19e6f0f302393cadd1f3f9d3d9816bd885c8b809aa1c7e03f003da9bf401d86` |
| `infrastructure/deploy/staging-readiness-deploy.py` | `80c79eb1febd04ec420fdc80d9202c8a8312cf8a3638b05549204eb2da01c102` |
| `infrastructure/deploy/tests/staging-readiness-contract.py` | `72d095cc08fbc72f416a7871fe1e2a39ea09f03df0a2a2020bbd22e3ce934adb` |
| `docs/runbooks/w10d-staging-readiness.md` | `8a993cb038beea205c778c7831be52b9f3dcd0abe5ef19fd24b8ff4e646d6002` |

Only these repository files were written in this follow-up:

```text
infrastructure/deploy/staging-readiness-deploy.py
infrastructure/deploy/tests/staging-readiness-contract.py
docs/runbooks/w10d-staging-readiness.md
docs/audits/WAVE10-D-STAGING-CANCELLATION-PRESERVATION-FOLLOWUP-2026-09-07.md
```

The workflow bytes are unchanged. Historical reports/SBOMs and unrelated untracked files are preserved, not included implicitly in a packaging manifest. This report's full SHA-256 is supplied separately to avoid self-reference.

## Tool routing and limitations

Used `diis-context-bootstrap` then `diis-executor` as required. Bootstrap bound the exact checkout/HEAD and prepared machine-local CodeGraph/Serena settings and index; this is local tooling metadata, not deployable source. Worktree AGENTS.md was absent; outer supplied rules and canonical application AGENTS.md were read alongside the worktree ways-of-working, decision log and dated review. CodeGraph was queried with the explicit checkout. Its generic-name matches included unrelated `run` symbols; only the actual deployment code and focused tests were treated as runtime evidence. No Serena activation or external API was needed for this Python-only change.

No vulnerability service, provider credential, browser session, SSH or remote observation was used. The secret scan is a limited heuristic for private-key blocks and recognizable GitHub/AWS credential shapes, not an exhaustive credential audit. No external prerequisite is upgraded by local source verification. The previous capacity, DNS and registry observations remain historical; the existing prerequisite ledger remains open. Capacity adapter remains observation-only, not cleanup authorization.

## Bounded independent reviewer handoff

Review P2-PSR03 against the input specification and exact five-file source manifest above. Verify the new report hash, pending-signal preservation on successful and failing producers for all three signals, repeated cleanup signals, typed ambiguity precedence, retained ownership/snapshots and transaction failed/rollback-only outcome. Rerun focused contracts as appropriate; do not substitute green unrelated application tests for these boundaries. Report all verified affected-slice findings together. Do not implement fixes or stage/package files as part of review.

Next authority gate: independent exact-manifest source review. No packaging approval is claimed. Packaging, staging promotion/deploy, DNS mutation, image publication, credential/provider setup, cleanup, backup/restore, scheduler, commissioning, piloting and all production operations remain HOLD.
