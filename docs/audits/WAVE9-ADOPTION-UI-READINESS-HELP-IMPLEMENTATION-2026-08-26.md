# Wave 9 Adoption UI Readiness and Help Implementation

Tanggal: 2026-08-26
Branch kerja: `feat/wave9-adoption-readiness-help-20260826`
Status: **READY FOR INDEPENDENT SOURCE REVIEW**
Scope: Wave 9 Checkpoint A - Adoption UI Readiness and Role-Aware Help System

## 1. Gate Boundary

Pekerjaan berhenti pada Source Reviewer gate. Tidak ada staging, commit, push, PR, merge,
deploy, branch-protection change, shared-staging mutation, production mutation, PDF final,
PPTX final, atau screenshot final yang dilakukan.

Perubahan tema login Keycloak merupakan tambahan scope eksplisit dari Director untuk menutup
bug pemilih bahasa yang tidak dapat ditutup dan menutupi form. Perubahan ini hanya menyentuh
source theme. Tidak ada realm mutation, role mutation, credential, secret, atau deployment.

## 2. Final Baseline

Baseline diambil dari clean worktree `origin/develop`:

| Ref | Commit | Product tree |
| --- | --- | --- |
| `origin/develop` | `28d983cde5eea64274d4cc20ca80eed6f70989d4` | `d65b8bb8974dd29e42ab25bf50ea38c78f65cc9b` |
| `origin/staging` | `a187b88bcb4f8388ebf078f1d6c9b4037e21dfe9` | `d65b8bb8974dd29e42ab25bf50ea38c78f65cc9b` |
| `origin/main` | `c8c0440dd92af0b31cc01a430c9eaa67b0bc8e61` | `d65b8bb8974dd29e42ab25bf50ea38c78f65cc9b` |

Gate 0 pada awal eksekusi membuktikan product tree identik, tidak ada PR terbuka, policy
approval normal aktif, production health read-only sehat, dan canonical dirty checkout tidak
disentuh. Seluruh implementasi dilakukan pada worktree terpisah.

## 3. Fixed Plan dan Ownership

1. Inventaris route, menu, state, persona, Appointment, Teaching Assignment, Wali Kelas,
   selected-child, dan permission boundary.
2. Audit UI/UX, accessibility, claim-source trace, terminology, artifact privacy, dan client
   bundle boundary menggunakan tiga agent read-only yang tidak overlap.
3. Tutup P0/P1/P2 reproduktif tanpa schema, migration, dependency, atau policy baru.
4. Implementasikan typed Help catalog, server authority projection, local client search,
   contextual Help, print, public login Help, dan secure private artifact route.
5. Jalankan focused test, full source gates, standalone trace proof, browser QA lokal, dan
   tulis report ini.

Ownership edit tetap pada Executor utama. Agent hanya mengaudit dan tidak mengubah source,
Git, staging, atau production.

## 4. Inventory dan Coverage

### 4.1 Canonical Help inventory

- 30 stable Help topics.
- 32 primary route mappings.
- 30 screenshot registry entries, semuanya `pending` pada Checkpoint A.
- 10 artifact PDF slots, semuanya `pending` pada Checkpoint A.
- 4 deck content maps untuk Checkpoint B.
- 30 claim-source ledger entries, tepat satu trace minimum untuk setiap topik.
- 8 glossary entries untuk identity role, Appointment, Teaching Assignment, Wali Kelas,
  KKTP, snapshot, view-as, dan PII.

Screenshot block `pending` difilter di server dan tidak dirender menjadi placeholder atau
broken image. Final validation mode sengaja gagal selama required screenshot/artifact masih
pending.

### 4.2 Primary route-topic map

| Route group | Stable topic |
| --- | --- |
| `/dashboard` | `topic.start` |
| `/login` | `topic.account-recovery` |
| `/dashboard/akademik`, `/dashboard/kegiatan`, `/dashboard/nilai` | `topic.academic-workspace` |
| `/dashboard/jadwal` | `topic.schedule` |
| `/dashboard/rapor` | `topic.report-card` |
| `/dashboard/rpp` | `topic.module-authoring` |
| `/dashboard/penutupan-semester` | `topic.semester-closing` |
| `/dashboard/siswa` | `topic.student-management` |
| `/dashboard/ppdb` | `topic.ppdb` |
| `/dashboard/kelas`, `/dashboard/mapel` | `topic.class-config` |
| `/dashboard/kalender` | `topic.calendar` |
| `/dashboard/keuangan` | `topic.finance` |
| `/dashboard/pengumuman`, `/dashboard/wa-log` | `topic.announcements` |
| `/dashboard/lowongan` | `topic.career-industry` |
| `/dashboard/presensi-guru` | `topic.teacher-attendance` |
| `/dashboard/ai`, `/dashboard/knowledge` | `topic.ai-assistant` |
| `/dashboard/monitoring` | `topic.monitoring` |
| `/dashboard/executive` | `topic.executive` |
| `/dashboard/struktur-organisasi` | `topic.appointments` |
| `/dashboard/users`, `/dashboard/audit*`, `/dashboard/health` | `topic.system-administration` |
| `/dashboard/tahun-ajaran`, `/dashboard/profil` | `topic.school-period` |

### 4.3 Authority projection matrix

| Archetype | Positive projection | Negative/fail-closed control |
| --- | --- | --- |
| Super Admin | system, monitoring, governance, all permitted topics | view-as removes original-position topics |
| Tata Usaha | student, PPDB, class config, finance by permission | no semester close without Appointment/permission |
| Guru ordinary | academic workspace; assignment only with active context | no Penutupan Semester menu/topic |
| Wali Kelas | class report topic with exact active-year wali context | stable role Guru alone is insufficient |
| Kepala Sekolah active | governance and semester topics through Appointment | base Guru without Appointment remains denied |
| Waka/Kaprog | only topics matching active position and DB permission | no authority from legacy Keycloak position role |
| Siswa | assessment attempt, own remedial, own report | no authoring, answer key, correction, or operations copy |
| Orang Tua | selected-child remedial/report/finance | multi-child without verified selection hides family topics |
| Industri | honest career/industry unavailable workflow | no student registry projection |

Teacher authoring, student attempt, teacher remedial, student remedial, family remedial,
family Rapor, and internal Rapor operations are separate topics. This prevents technically
authorized Help pages from teaching the wrong actor's workflow.

## 5. Finding Closure

| ID | Severity | Finding | Closure |
| --- | --- | --- | --- |
| W9-P1-01 | P1 | GURU ordinary still saw `Penutupan Semester` although direct action failed | Sidebar requires approved role/Appointment plus `academic.final-report.read` or `academic.semester.close`; shared helper and regression test fail closed on permission fetch failure. |
| W9-P1-02 | P1 | Login locale menu was stuck open and obscured fields | Added explicit accessible controller, closed default state, click/outside/Escape/focusout/window-blur paths, focus restore, and flow-based open layout with no overlap. |
| W9-P1-03 | P1 | No role-aware Help route, stable topic contract, or server projection | Added typed/Zod catalog, server-only authority and content projection, 32-route map, deep links, related topics, and local search over authorized summaries only. |
| W9-P1-04 | P1 | PPDB read authority in UI/API did not align with approved Appointment readers | GET list/detail supports exact intended Appointment positions with `ppdb.read`; mutations remain Super Admin/Tata Usaha only. |
| W9-P1-05 | P1 | Class and Calendar pages used stale identity checks instead of active Appointment authority | Pages now use dashboard authority, DB permission, active-year calendar scope, and fail-closed state. |
| W9-P1-06 | P1 | Teaching Assignment Help context used a broad endpoint that Appointment reviewers could satisfy | Added exact `/teaching-assignments/me/context` projection from active-year assignments owned by the authenticated Guru. |
| W9-P1-07 | P1 | Wali-class context could include historical academic years | Wali classes are resolved only from the single active academic year; no active year returns an empty fail-closed result. |
| W9-P1-08 | P1 | Hidden Help catalog/evidence risked entering client bundles | Client component imports only `help-search`; full catalog, authority metadata, screenshot registry, and source ledger stay server-only. Build chunk scan found no forbidden marker. |
| W9-P1-09 | P1 | Secure Help artifact foundation was missing | Added authenticated allowlisted route, private directory, path containment, streaming, generic 404, no-store/nosniff/referrer headers, and standalone trace inclusion. |
| W9-P1-10 | P1 | Mixed assessment/remedial/report topics exposed wrong-actor instructions | Split authoring/attempt, teacher/student/family remedial, and family/internal Rapor operations. |
| W9-P2-01 | P2 | Dashboard load failures could appear as legitimate empty data | Schedule/calendar/session use classified result states and actionable copy instead of silent empty fallback. |
| W9-P2-02 | P2 | Session dialogs lacked complete modal semantics | Reused Radix Dialog for focus trap, Escape, initial/return focus, and accessible close control. |
| W9-P2-03 | P2 | Collapsed sidebar controls could remain focusable | Collapsed desktop navigation is removed from layout/interactivity. |
| W9-P2-04 | P2 | Several controls were below professional touch target size | Shared/dialog/view-as/login controls use minimum 44px target; mobile browser measurements confirm. |
| W9-P2-05 | P2 | Low-contrast helper copy and hover-only tooltip access | Raised contrast, added keyboard focus path, visible focus, and 44px target. |
| W9-P2-06 | P2 | INDUSTRI saw a student management path it could not use | Removed student registry navigation/projection and replaced career route with honest unavailable state. |
| W9-P2-07 | P2 | Multi-child Help was secure but gave no recovery instruction before selection | Added actionable `Pilih anak` warning while preserving fail-closed projection. |
| W9-P2-08 | P2 | Teaching Assignment mutations lacked explicit audit metadata | Added body-redacted audit decorators to create/update/delete actions. |

No P0 was reproduced.

### 5.1 Independent review follow-up

| ID | Severity | Closure evidence |
| --- | --- | --- |
| P1-F01 | P1 | Setiap artefak kini memiliki authority contract mandiri. Route menguji primary role, Appointment, assignment context, permission any/all, selected-child, dan recovery SA eksplisit tanpa mewarisi audience topik. |
| P1-F02 | P1 | Projection membawa state artefak `pending/ready/unavailable`; UI hanya menampilkan link untuk `ready`, mempertahankan `studentId`, dan route memverifikasi child ownership. Route test mencakup persona silang, anak hilang/palsu/sah, pending, missing file, abort, dan exact headers. |
| P1-F03 | P1 | Metadata detail selalu generik `Panduan DIIS`; valid-but-forbidden dan slug asing memakai body/status yang sama tanpa judul restricted. Browser Guru membuktikan `Penutupan Semester` tidak muncul pada metadata maupun body denied. |
| P1-F04 | P1 | Schema canonical menggunakan `assignmentContexts`, `permissionsAny`, `permissionsAll`, `featureStatus`, dan `updatedAt`; projection menegakkan seluruh permission dan validator menolak metadata stale. |
| P1-F05 | P1 | Claim ledger mencakup 30/30 topik. Validator memeriksa duplicate/orphan/coverage serta keberadaan file source, test, dan report di dalam project root; negative tests mencakup seluruh failure mode. |
| P1-F06 | P1 | `docs/decision-log.md` mencatat approval Director bertanggal untuk tepat lima file tema Keycloak, validation gate, dan larangan realm/deploy/secret mutation. |
| P2-F07 | P2 | PPDB dan Kelas memakai discoverability constants bersama untuk page/sidebar/Help; Wakil Hubin, Waka Kurikulum, dan Kaprog diuji tanpa memperlebar mutation API. |
| P2-F08 | P2 | Ditambahkan kategori/topik `Hubungi Bantuan Resmi`, profil sekolah authoritative yang fail-closed, anchor duplicate-safe, dan TOC server-rendered. |
| P2-F09 | P2 | Locale memakai pola ARIA menu lengkap: child `menuitem`, roving focus melalui panah/Home/End, Escape dengan focus restore, click-outside, focusout, dan window blur. DOM fixture browser menguji perilaku aktual CSS/JavaScript theme. |
| P1-F10 | P1 | Resolver private artifact mendukung dua layout yang benar-benar digunakan: workspace web (`private/help-artifacts`) dan container standalone (`apps/web/private/help-artifacts`). Behavioral test menulis dan men-stream file melalui fungsi produksi dari `cwd` setara `/app`; fresh standalone smoke mengulang test pada output build aktual dan membersihkan artefak sintetis. |

## 6. Help and UI Implementation

### 6.1 User surfaces

- `/dashboard/panduan`: role-aware Help explorer.
- `/dashboard/panduan/[slug]`: deep-linked Help topic with steps, checklist, authority note,
  recovery, related topics, previous/next navigation, and print action.
- `/login/bantuan`: public-safe login recovery content that never exposes account, role,
  Appointment, internal source, or invented contact data.
- Sidebar utility entry and TopBar contextual Help use stable route-topic mapping.
- Loading, no-result, offline, error, not-found, pending-artifact, and retry states are distinct.

### 6.2 Login theme polish

- Institutional light theme with readable password/autofill text.
- Clear Indonesian/English locale labels.
- Locale menu closed by default and bounded in flow, not positioned over form content.
- Native keyboard operation: Enter, Space, ArrowDown, ArrowUp, Home, End, dan Escape.
- Click outside, focus leaving the control, and window blur close the menu.
- Focus returns to trigger after Escape.
- All interactive controls measured at 44px or higher on 390x844.
- First-login password policy copy documents length and character classes.

The application daily color/style behavior was deliberately preserved. No second design
system, global palette rewrite, gradient/orb decoration, or marketing-style landing page was
introduced.

## 7. Security and Privacy Decisions

- Primary roles remain the six canonical identity roles from `@smk/auth`.
- Appointment remains period-bound authority; no position role is added to Keycloak identity.
- Help projection is server-side and fail-closed on permission/Appointment/child lookup error.
- Client receives only permitted topic summaries and projected public content blocks.
- Selected-child IDs are verified against `/students/my-children` before family links preserve
  them.
- Public login Help uses authoritative school profile when available and does not invent a
  contact when unavailable.
- Artifact IDs are allowlisted; path traversal, arbitrary filename, external URL, and unsafe
  redirect are rejected.
- Private files remain outside `public`, stream from disk, and use private no-store headers.
- No PII, credential, secret, cookie, token, or final screenshot is stored in this report.

## 8. Performance Evidence

- Production build route size:
  - `/dashboard/panduan`: 3.74 kB route, 110 kB first load.
  - `/dashboard/panduan/[slug]`: 1.43 kB route, 108 kB first load.
  - `/login/bantuan`: 831 B route, 107 kB first load.
- Shared first-load JS: 103 kB.
- Search is local, deterministic, accent/case tolerant, memoized, and bounded to 24 projected
  results.
- Client chunk scan found no `topic.semester-closing`, `sourceRefs`, `screenshotId`,
  `claimLedger`, `expectedValue`, or `help-evidence` marker.
- No binary artifact is imported by a client component.
- Built standalone output contains `apps/web/private/help-artifacts/README.md`. Resolver
  memilih path tersebut dari root container, lalu standalone smoke membuka stream file melalui
  fungsi produksi yang sama dan membuktikan cleanup file sintetis.
- Artifact response uses stream/abort handling rather than loading the whole file into memory.

The baseline did not contain Help routes, so route-size comparison is new-route versus absent;
non-Help route architecture and shared chunk boundary remain unchanged by the server catalog.

## 9. Skill and Agent Outcomes

### 9.1 `ui-ux-pro-max`

Applied searches:

1. `accessible language menu keyboard dismiss focus`:
   - native control semantics;
   - visible keyboard focus;
   - close overlay before focus moves behind it.
2. `role aware help navigation hierarchy`:
   - sequential headings;
   - Help location remains consistent in shared shell;
   - hierarchy is content-first rather than card-heavy.

Applied outcomes include 44px targets, explicit expanded/hidden state, focus restore, shared
Help placement, sequential headings, no overlap, and no hover-only action.

### 9.2 `frontend-design`

Applied restrained work-focused hierarchy, existing DIIS tokens/Lucide icons, unframed list
sections, compact typography, predictable actions, and responsive constraints. Rejected a
marketing hero, decorative cards, new palette, and ornamental visuals because Help is an
operational tool.

### 9.3 Read-only agents

- Product Flow and Authority Auditor found route/API authority mismatch, broad assignment
  context, hidden catalog boundary, and missing Teaching Assignment audit metadata.
- Frontend UX and Accessibility Auditor found false-empty states, focusable collapsed UI,
  modal semantics, target size, contrast, and unavailable-feature copy issues.
- Documentation Evidence Auditor found stale identity/AI terminology, INDUSTRI overstatement,
  artifact streaming requirements, privacy/redaction rules, and evidence lifecycle gaps.

All P1/P2 findings above were handled by the Executor. P3-only cleanup was not used to widen
the scope.

## 10. Verification Evidence

### 10.1 Automated

| Gate | Result |
| --- | --- |
| Full API Jest | 66 suites pass, 1 skipped; 1,302 pass, 4 skipped |
| Full web Jest | 45 suites; 327/327 pass |
| Workspace type-check | 9/9 tasks pass |
| Workspace lint | 3/3 tasks pass; existing Next lint deprecation/plugin notices only |
| Workspace build | 6/6 tasks pass |
| Next production build | 49/49 pages generated |
| Help final-mode test | Correctly rejects pending screenshot and artifact slots |
| Client bundle boundary | No forbidden catalog/evidence marker in static chunks |
| Standalone private trace + stream smoke | PASS dari `apps/web/.next/standalone` sebagai container `cwd`; file sintetis dibersihkan |
| `git diff --check` | PASS |
| `git diff --cached --check` | PASS; no staged files |

### 10.2 Local browser QA

Browser QA used only local synthetic sessions and mock API responses. No shared staging or
real account was used.

| Scenario | Viewport | Result |
| --- | --- | --- |
| Public login Help, API unavailable | 1440x900, 390x844 | Honest recovery/contact-unavailable state; no console warning/error; no overflow |
| Keycloak locale closed/open | 1440x900, 390x844 | Default closed; click/outside/Escape/focusout close; focus restore; no form overlap |
| Login touch/readability | 390x844 | All controls >=44px; password dark on white; no horizontal overflow |
| Ordinary Guru Help | 1440x900, 390x844 | 6 authorized topics; assignment context shown; Penutupan Semester absent |
| Search and filter | 1440x900 | `pengajaran` returns exactly one `Pengajaran Saya` topic; live result count correct |
| Topic deep link dan TOC | 390x844 | Stable URL, print action, 3 anchored sections, authoritative synthetic contact, no internal metadata |
| Parent with selected child | 390x844 | Family remedial/report/finance only; teacher authoring absent; owned child query preserved |
| Parent multi-child missing/forged selection | 390x844 | Family topics fail closed with actionable selection warning and no Rapor leak |
| Active Principal Appointment | 1440x900 | Penutupan Semester menu and Help topic visible; base Guru negative remains hidden |
| Restricted metadata | 1440x900 | Valid-but-forbidden topic shows generic `Panduan DIIS` and generic unavailable body without restricted title |
| Student persona | 1440x900 | Student assessment/remedial/report visible; teacher Bank Soal instructions absent |
| Artifact handoff | 390x844 | Pending parent artifact shows preparation state and no download; route authorization is covered by executable route tests |
| Reflow equivalent to 200% zoom | 720x450 | Main document has no horizontal overflow; category strip remains deliberately scrollable and keyboard reachable |

Browser console was clean for product and Keycloak fixture pages. The loopback fixture handles
login-event and heartbeat calls, binds only to `127.0.0.1`, uses random per-run session secret,
contains synthetic identities only, and was fully stopped after QA.

## 11. Changed-File Manifest

No file is staged. Expected review manifest:

### API and tests

- `apps/api/src/__tests__/teaching-assignment.spec.ts`
- `apps/api/src/ppdb/ppdb.controller.ts`
- `apps/api/src/provisioning/dto/provision.dto.ts`
- `apps/api/src/teaching-assignment/teaching-assignment.controller.ts`
- `apps/api/src/teaching-assignment/teaching-assignment.service.ts`

### Web Help, authority, UI, and tests

- `apps/web/next.config.js`
- `apps/web/private/help-artifacts/README.md`
- `apps/web/src/__tests__/help-artifact-route.test.ts`
- `apps/web/src/__tests__/help-detail-route.test.ts`
- `apps/web/src/__tests__/help-system.test.ts`
- `apps/web/src/__tests__/keycloak-theme.test.ts`
- `apps/web/src/__tests__/mobile-nav.test.ts`
- `apps/web/src/__tests__/semester-closing-ui.test.ts`
- `apps/web/src/app/api/help/artifacts/[id]/route.ts`
- `apps/web/src/app/dashboard/panduan/page.tsx`
- `apps/web/src/app/dashboard/panduan/loading.tsx`
- `apps/web/src/app/dashboard/panduan/error.tsx`
- `apps/web/src/app/dashboard/panduan/not-found.tsx`
- `apps/web/src/app/dashboard/panduan/[slug]/page.tsx`
- `apps/web/src/app/dashboard/panduan/_components/HelpExplorer.tsx`
- `apps/web/src/app/dashboard/panduan/_components/HelpTopicContent.tsx`
- `apps/web/src/app/dashboard/panduan/_components/PrintButton.tsx`
- `apps/web/src/app/login/bantuan/page.tsx`
- `apps/web/src/lib/help/help-artifacts.ts`
- `apps/web/src/lib/help/help-authority.ts`
- `apps/web/src/lib/help/help-catalog.ts`
- `apps/web/src/lib/help/help-evidence.ts`
- `apps/web/src/lib/help/help-personas.ts`
- `apps/web/src/lib/help/help-projection.ts`
- `apps/web/src/lib/help/help-schema.ts`
- `apps/web/src/lib/help/help-search.ts`
- `apps/web/src/lib/help/help-toc.ts`
- `apps/web/src/lib/help/help-validation.ts`
- `apps/web/src/lib/navigation-authority.ts`
- `apps/web/src/app/dashboard/_components/RoleBasedHome.tsx`
- `apps/web/src/app/dashboard/akademik/_components/RingkasanGuru.tsx`
- `apps/web/src/app/dashboard/akademik/_components/SessionFlowModal.tsx`
- `apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx`
- `apps/web/src/app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx`
- `apps/web/src/app/dashboard/kalender/page.tsx`
- `apps/web/src/app/dashboard/kelas/page.tsx`
- `apps/web/src/app/dashboard/loading.tsx`
- `apps/web/src/app/dashboard/lowongan/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/dashboard/ppdb/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/components/layout/AppShell.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`
- `apps/web/src/components/layout/TopBar.tsx`
- `apps/web/src/components/layout/ViewAsBanner.tsx`
- `apps/web/src/components/layout/ViewAsSwitcher.tsx`
- `apps/web/src/components/ui/dialog.tsx`
- `apps/web/src/lib/permissions.ts`

### Login theme and architecture documentation

- `infrastructure/keycloak/themes/diis/login/messages/messages_en.properties`
- `infrastructure/keycloak/themes/diis/login/messages/messages_id.properties`
- `infrastructure/keycloak/themes/diis/login/resources/css/login.css`
- `infrastructure/keycloak/themes/diis/login/resources/js/login.js`
- `infrastructure/keycloak/themes/diis/login/theme.properties`
- `README.md`
- `docs/architecture/academic-lifecycle.md`
- `docs/architecture/system-overview.md`
- `docs/audits/WAVE9-ADOPTION-UI-READINESS-HELP-IMPLEMENTATION-2026-08-26.md`
- `docs/audits/WAVE9-ADOPTION-UI-READINESS-HELP-SOURCE-REVIEW-2026-08-26.md`
- `docs/decision-log.md`
- `scripts/qa/wave9-help-local-fixture.mjs`

Manifest kerja aktual berjumlah tepat **66 file**. Daftar ini harus dibangun kembali dari
`git ls-files --modified --others --exclude-standard` saat Git packaging; tidak ada file yang
boleh ditambahkan di luar manifest reviewer tanpa re-review.

No Prisma schema, migration, package dependency, Docker service, scheduler, base role, or
Keycloak realm role change is present.

## 12. Deferred and Residual Gates

The following are intentionally not complete at Checkpoint A:

1. Final screenshot capture and hash manifest require a frozen, independently approved exact
   staging SHA at Checkpoint B.
2. PDF and PPTX generation/render QA require the same frozen SHA and ready screenshot registry.
3. Full federated staging persona matrix, direct-route negatives, print/download runtime,
   offline/retry, and exact deployment evidence remain the post-packaging staging gate.
4. Production/main is outside this approval boundary.

No known source P0/P1/P2 remains from Executor and read-only agent review. This statement is an
Executor readiness assessment, not an independent verdict.

## 13. Reviewer Request

Please perform Independent Source Review against merge-base `origin/develop` and verify:

- server-only projection and client-bundle privacy;
- role/Appointment/assignment/wali/selected-child negative paths;
- ordinary Guru cannot see Penutupan Semester while active KS can;
- login locale behavior and mobile target/overlap evidence;
- artifact traversal/allowlist, dual-layout resolver, dan standalone stream smoke;
- catalog reference integrity and final-mode pending enforcement;
- full tests, type-check, lint, build, diff checks, and unstaged state.

Requested verdict is intentionally not predetermined. Valid reviewer verdicts remain
`FOLLOW-UP REQUIRED`, `APPROVED FOR EXPLICIT GIT PACKAGING`, or
`BLOCKED BY EXTERNAL PRECONDITION`.
