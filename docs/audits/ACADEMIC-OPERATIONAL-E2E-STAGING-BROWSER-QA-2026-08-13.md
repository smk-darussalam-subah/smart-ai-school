# Academic Operational E2E Staging Browser QA

Tanggal: 2026-08-13  
Target: `staging`  
Verdict: **APPROVED FOR STAGING SIGN-OFF**  
Production promotion: **NOT PART OF THIS QA**

## Binding Release Evidence

- Source delivery: PR #486, merge SHA `6f0040e20b578e29d3e9ebd9dae013f890232976`.
- Initial staging promotion: PR #487, SHA `72fbd9590d7a38c2e9167826ccf1bf01b9df15b9`.
- Report-section ownership fix: PR #488 and PR #489.
- Staging media provisioning fix: PR #490 and PR #491.
- Final tested staging SHA: `aeb72bff3b7c755118c3eee21c30c43905a42630`.
- Final deployment run: `31677625244`, successful.
- Production remained unchanged at `3b42efc38c71d5c79e5fea8b168efbbbc900e6de`.
- `develop` and `staging` required approvals were temporarily changed from 1 to 0 only for authorized merges and restored to 1 after every merge.

## Source Gates

- Reviewer final verdict before packaging: no remaining P0/P1/P2.
- Focused API: 57/57 passed before packaging.
- Focused web: 14/14 passed before packaging.
- Full source baseline: API 1,195/1,195 and web 186/186 passed.
- Runtime privacy follow-up: focused report/activity suite 59/59 passed.
- Runtime privacy follow-up: full API 60 suites, 1,197/1,197 passed.
- API type-check, lint, and build passed after the privacy follow-up.
- Media deployment contract: 5/5 passed; workflow formatting and diff checks passed.
- All required GitHub CI checks passed for PR #488 through PR #491.

## Runtime Findings Closed During QA

### Report Section Ownership

The first deployed candidate returned HTTP 200 when a SISWA requested another
student's distributed `official-sections` resource. The route `studentId` had
overwritten the ownership predicate.

The fix now intersects route context with role ownership. Post-deploy proof:

| Actor | Own record | Other student/child |
|---|---:|---:|
| SISWA | 200 | 403 |
| ORANG_TUA | 200 | 403 |

Each family account listed exactly one distributed report belonging to it.

### Private Class-Activity Media

The initial candidate returned HTTP 503 because staging had no private media
credentials or bucket. Deployment now provisions:

- isolated bucket `diis-class-activities-staging`;
- dedicated least-privilege MinIO user;
- bucket-scoped get, put, delete, location, and list rights;
- anonymous access set to none;
- persisted service credentials without printing secret values.

Post-deploy proof:

- valid PNG upload: 200;
- invalid MIME upload: 400;
- anonymous API media read: 401;
- authenticated Wali, SISWA, ORANG_TUA, KS, TU, and WAKA_KESISWAAN read: 200;
- response `Content-Type: image/png`;
- response `Cache-Control: private, no-store, max-age=0, no-transform`;
- response `X-Content-Type-Options: nosniff`;
- media delete: 200, subsequent read: 404;
- activity delete: 200.

## Browser QA Matrix

### Super Admin

- Academic hub, Jadwal, Rapor, Kegiatan Kelas, and Review Modul Ajar loaded at 1440x900.
- Academic assignment table, filters, pagination, and add/edit affordances rendered.
- Rapor displayed explicit Super Admin assistance mode.
- SA could assist `publish` and `distribute`, using the real SA audit identity.
- SA was denied `generate`, homeroom notes, `check`, and `return` with 403.
- Mobile 390x844 showed no horizontal page overflow and retained access to all five Academic destinations.

### Kepala Sekolah

- Academic assignment and Jadwal pages rendered without mutation controls.
- Rapor showed `Terbitkan` only for checked reports and did not show Waka return controls.
- KS final approval for a Waka-recommended Modul Ajar succeeded.

### Tata Usaha

- Academic page exposed assignment creation/edit controls and pagination.
- Jadwal page exposed `Tambah Slot` and schedule edit controls.
- Rapor exposed distribution but not publish controls.
- TU distribution completed successfully.

### Guru and Wali Kelas

- A TeachingAssignment without a schedule still exposed class/subject context and `Buat Modul Ajar`.
- Pembelajaran exposed create, edit, submit, LMS, and status actions.
- Wali generated two reports, wrote notes with version CAS, corrected a returned report, and resubmitted it.
- Wali could create Kegiatan Kelas and upload private media.
- No KS/Waka/TU report action leaked into the Wali UI.

### Waka Kurikulum

- Rapor displayed `Tandai diperiksa` for draft reports and `Kembalikan` for checked reports.
- Check, return with reason, and re-check completed successfully.
- Waka publish attempt was denied with 403.
- Modul Ajar review displayed a specific decision dialog and recommendation to KS completed successfully.

### Waka Kesiswaan

- Kegiatan Kelas showed cross-class activity visibility.
- `Catat kegiatan`, edit, and delete controls were available.
- The private image rendered through the authenticated application route.

### Kaprog

- Academic and Review Modul Ajar pages loaded under appointment-derived authority.
- RPP list returned no records outside the active major scope.
- Cross-major RPP detail failed closed with 404.

### Siswa and Orang Tua

- Before distribution, each account saw zero QA reports.
- After distribution, each account saw only its own/child report and no workflow mutation action.
- Direct cross-student and cross-child official-section requests returned 403.
- The Kegiatan Kelas private image rendered for the student's class on desktop and mobile.
- Direct navigation to the teacher Academic path rendered the student workspace and no teacher authoring controls.

## Workflow and Concurrency Proof

- Rapor: Wali draft -> Waka check -> Waka return -> Wali correction -> Waka re-check -> KS/SA publish -> TU/SA distribute.
- Report notes used optimistic concurrency; source proof covers same-version collision.
- TeachingAssignment create: 201; update: 200.
- Schedule create against the same assignment: 201; update: 200.
- Deleting an assignment while referenced by a schedule: 409.
- Schedule delete: 200; assignment delete after dependency removal: 200.
- Modul Ajar: Guru submit -> Waka recommend -> KS final approve.

## Database and Deployment Proof

- Deploy targeted PostgreSQL database `smk_staging_db`.
- Staging database initialization, extensions, and schemas completed.
- Prisma reported `No pending migrations to apply`.
- Final API container reached healthy status.
- Public staging API health and staging login returned 200.
- Production API health and production login also returned 200 without production mutation.

## Fixture Cleanup

- Four temporary appointment records were ended.
- Original Kepala Sekolah and Waka Kurikulum incumbents were resumed successfully.
- Ten temporary role/family users were deactivated.
- The synthetic class was deactivated.
- Temporary schedule and assignment records were deleted.
- Private media object and activity record were deleted.
- No production data, account, appointment, or configuration was changed.

## Final Assessment

The Academic operational package is ready for staging sign-off. The browser and
runtime QA covered authority, ownership, lifecycle transitions, responsive UI,
private media, deployment configuration, dependency protection, audit actors,
and cleanup. The two issues discovered only at runtime were fixed in the same
delivery batch and revalidated on the final staging SHA.

Promotion to `main` remains a separate approval and production-readiness gate.
