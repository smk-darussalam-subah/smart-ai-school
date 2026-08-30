# Wave 9 Checkpoint A External Deck Contract Exact-SHA Freeze Review

Tanggal: 2026-08-30

## Verdict

`APPROVED FOR EXACT-SHA FREEZE AND CHECKPOINT B RESTART`

Tidak ditemukan P0, P1, atau P2 terbuka pada scope follow-up kontrak deck eksternal. Freeze ini
menyetujui baseline aplikasi untuk produksi ulang artefak Checkpoint B. Verdict ini bukan approval
atas screenshot, PDF, deck, adoption package, promosi `main`, atau production go-live.

## Frozen Baseline

- frozen application/deployed SHA: `380a0708230d7ac3793e7303c105563de8ed3a4c`;
- frozen application root tree: `030ea15047811309c4de1a8f96eee1258333e085`;
- reviewed source head: `56637e2130e3681b9c779af983ebd4cc6e5cb320`;
- merge `develop`: `940f13f3f0686b2ebfda231a2d1e1a6ae7217368`;
- deploy run: `33316348155`;
- production/main remains: `76d64c6582fdf959d5868d89f36a3e36ea02beea`;
- shared-auth theme manifest remains:
  `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`.

If audit reports are later promoted through docs-only Gitflow, the evidence branch SHA and root
tree will change. That must not redefine the frozen application. Checkpoint B must continue to bind
product capture and artifact generation to the frozen application SHA above, with a documented
proof that subsequent delta is docs-only.

## Findings

No P0/P1/P2 findings.

## Independent Integrity Verification

The reviewer independently verified:

- PR `#611` merged to `develop` and PR `#612` merged to `staging`;
- reviewed head is an ancestor of both `origin/develop` and `origin/staging`;
- `origin/staging` equals the stated frozen SHA and root tree;
- deploy run `33316348155` completed successfully at the exact staging SHA;
- VPS checkout equals the frozen SHA and tree;
- VPS checkout has zero tracked and zero untracked changes;
- `smk-staging-api` is running and healthy;
- `smk-staging-web` is running;
- public staging web returns HTTP 200;
- API health is `ok` and database is `up`;
- no open pull request remains;
- classic protection for `develop`, `staging`, and `main` requires one approval with admin
  enforcement enabled;
- `Protect Staging` and `Protect main` rulesets are active and require one approval;
- `main` is unchanged;
- the source delta from the previous frozen application is limited to the two reviewed Help
  registry/test files; additional committed differences are audit reports;
- the staging QA report contains no detected credential, token, key, cookie, or private-key
  pattern and passes whitespace validation.

## Browser Evidence Review

The Executor evidence is coherent and sufficient for the affected matrix:

- Orang Tua sees family topics and preserves the verified selected-child context;
- an unowned `studentId` fails closed to general Help;
- Industri sees the industry topic without family projection;
- direct cross-persona topic access returns generic unavailable content without restricted
  metadata;
- desktop `1440x900` and mobile `390x844` have no horizontal overflow;
- visible interaction targets meet the 44 px minimum;
- keyboard order, console, and application network evidence are clean.

The reviewer opened a fresh Chrome route to staging Help. The route correctly redirected through
the protected login flow to the Keycloak OIDC form. No credential was available or requested, so
the reviewer did not independently reproduce the authenticated persona matrix. The browser matrix
above is therefore accepted from the redacted Executor evidence, while delivery binding and
runtime integrity were independently verified live.

## Freeze Conditions

The freeze remains valid only while all of the following hold:

1. final capture uses frozen application SHA `380a0708230d7ac3793e7303c105563de8ed3a4c`;
2. no product source, schema, dependency, infrastructure, Keycloak, or secret delta is introduced;
3. synthetic PII-safe fixtures and role/Appointment/selected-child authority are used;
4. every screenshot, PDF, and deck records its frozen SHA, route, persona, viewport, hash, size,
   and authority metadata;
5. the fourth deck covers both Orang Tua and Industri and remains facilitator-only rather than
   cross-persona self-service;
6. old or provisional artifacts are not reused;
7. any newly discovered product, authority, privacy, layout, or content defect invalidates the
   freeze and returns work to Checkpoint A.

## Next Gate

1. Permanently package the Executor staging QA report and this reviewer report through docs-only
   Gitflow.
2. Verify the post-docs delta is reports-only and retain the frozen application SHA above.
3. Restart Checkpoint B from a clean artifact workspace.
4. Generate and independently review 40 screenshots, 24 PDF guides, 4 presentation decks, and the
   adoption package.
5. Keep `main`, production, and go-live approval separate. Appointment automation production
   remains an independent go-live prerequisite.

## Confidence

- delivery and exact-SHA integrity: 0.99;
- authority/privacy evidence: 0.96;
- responsive/accessibility evidence: 0.94;
- independently reproduced authenticated browser matrix: not claimed;
- readiness to restart Checkpoint B: 0.97.
