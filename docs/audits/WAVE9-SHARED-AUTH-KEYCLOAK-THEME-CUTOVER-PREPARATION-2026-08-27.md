# Wave 9 Shared Auth Keycloak Theme Cutover Preparation

Tanggal: 2026-08-27

Branch kerja: `fix/wave9-shared-auth-theme-cutover-prep-20260827`

Baseline: `origin/develop@fd1e25f41e063ce346dd108edadd5f7479c2e95c`

Status: **READY FOR INDEPENDENT RE-REVIEW**

## Executor Readiness Assessment

Gate A Opsi A dan follow-up P1-R01 sampai P1-R03 telah diselesaikan pada source dan
Keycloak disposable. Existing `apply-kc-theme` workflow kini memiliki exact-SHA
preflight, exact-tree manifest lima file, production environment gate, redacted runtime
verification, bounded health, serta automatic containment yang diuji secara perilaku.
`login.js` diperbaiki secara sempit untuk fokus keyboard deterministik dan aset SVG lama
yang tidak digunakan dihapus agar deployed tree sama persis dengan manifest.

Tidak ada commit, push, PR, merge, deploy, workflow dispatch, shared Keycloak mutation,
realm production/staging mutation, atau branch-protection change pada pekerjaan ini.

## Baseline dan Containment

- `origin/develop`: `fd1e25f41e063ce346dd108edadd5f7479c2e95c`
- `origin/staging`: `e13c1c4ba6217efc9a1ca918e0f690d3b8aa9f32`
- `origin/main`: `c8c0440dd92af0b31cc01a430c9eaa67b0bc8e61`
- Tree `develop` dan `staging`: `3309da2e4677698c3f9a3e934d3288637769c7fa`
  dan identik.
- Deploy staging terakhir: run `33033520601`, sukses pada `e13c1c4...`.
- Open PR: 0.
- Classic protection `develop`, `staging`, dan `main`: satu approval, admin enforced,
  serta tiga required checks.
- Ruleset `Protect Staging` dan `Protect main`: aktif.
- Environment `production`: satu reviewer dan hanya menerima branch `main`.

## Root Cause yang Ditutup

Shared `smk-keycloak` memakai bind mount read-only dari checkout production
`/home/appuser/smart-ai-school/infrastructure/keycloak/themes/diis`. Deploy aplikasi
staging tidak mengubah mount tersebut. Akibatnya, source Wave 9 sudah benar di staging,
tetapi runtime shared auth masih memakai CSS lama dan tidak memiliki `login.js`.

Perbaikan ini menyiapkan satu jalur source-controlled melalui workflow existing. Tidak
ada jalur SSH manual kedua dan tidak ada penyalinan file langsung ke VPS.

## Explicit Gate A Manifest

1. `.github/workflows/apply-kc-theme.yml`
2. `apps/web/src/__tests__/keycloak-theme.test.ts`
3. `infrastructure/keycloak/diis-login-theme.sha256`
4. `infrastructure/keycloak/scripts/apply-theme-cutover-remote.sh`
5. `infrastructure/keycloak/scripts/test-theme-containment.sh`
6. `infrastructure/keycloak/scripts/test-theme-cutover.sh`
7. `infrastructure/keycloak/scripts/verify-theme-bundle.sh`
8. `infrastructure/keycloak/scripts/verify-theme-cutover-preflight.sh`
9. `infrastructure/keycloak/themes/diis/login/resources/img/logo-diis.svg` (deleted)
10. `infrastructure/keycloak/themes/diis/login/resources/js/login.js`
11. `docs/audits/WAVE9-SHARED-AUTH-KEYCLOAK-THEME-CUTOVER-PREPARATION-2026-08-27.md`

Tiga dokumen Wave 9 yang sudah untracked sebelum Gate A tetap dipertahankan dan tidak
dimasukkan secara diam-diam ke manifest ini. Laporan independent reviewer yang memicu
follow-up juga tetap reviewer-owned dan berada di luar manifest Executor. Tidak ada file
staged.

## Approved Theme Manifest

| Path | SHA-256 |
| --- | --- |
| `messages/messages_en.properties` | `7f413e5282d37bb39d3481bb0c11fa5f1c7d3fe5ea4021d48cf82b6ab9c08c00` |
| `messages/messages_id.properties` | `51bd0d75a3867efecd4baaf2643a713984c9769ee1f9feef5f4f8caa55e59888` |
| `resources/css/login.css` | `2ea123a3057543fc59011457d581688ceb529f5f9b70e21ea46dde5efc1599bd` |
| `resources/js/login.js` | `4d1ab55a352a4ee23d0376d0b80bf23c2a27e6a5430d296425607723ad22eaf2` |
| `theme.properties` | `d74d763df51aeaf00b43949ece8a902a68903240cb8e7c89855fc9e478df83cf` |

Manifest SHA-256:
`9360cf14d7d9cff6bbc998e5f5188efbe95cf01b5febbba4b2494dda3760f43b`.

Verifier menerima tepat empat direktori resmi dan lima regular file dalam urutan
tersebut. Ia menolak entry tambahan, tipe entry yang salah atau symlink, path tidak
aman, file hilang, dan hash yang tidak cocok. Negative matrix mencakup extra FTL,
JavaScript, CSS, symlink, serta aset SVG historis.

## Workflow dan Cutover Contract

Workflow sekarang:

- hanya `workflow_dispatch` dengan `expected_sha`, `previous_production_sha`, dan
  confirmation phrase exact;
- checkout action dan SSH action dipin ke full commit SHA;
- menolak ref selain `main`, SHA bukan lowercase penuh, dirty checkout, missing source,
  previous SHA yang bukan ancestor/first parent, atau confirmation mismatch;
- menjalankan job mutasi hanya melalui environment `production`;
- memanggil script cutover dari checkout production exact-SHA;
- memverifikasi source hash, container image ID, initial health, mount source/destination
  read-only, realm theme, runtime hash, `login.js`, OIDC issuer, login page, dan bounded
  post-cutover log;
- merekreasi hanya service `keycloak` dengan `--no-deps --force-recreate`;
- mengambil admin credential hanya dari environment container, memakai temporary
  `kcadm` config, `set +x`, dan menghapus config melalui trap;
- jika post-check gagal setelah mutation, mengembalikan realm ke previous login theme
  atau built-in `keycloak`, memverifikasi public auth, dan tetap menggagalkan workflow;
- menyatakan source rollback harus melalui Gitflow terhadap recorded previous SHA.

## Automated Verification

| Gate | Hasil |
| --- | --- |
| Theme focused Jest | 1 suite, 5/5 pass |
| Web type-check | pass |
| Web lint | pass; hanya warning deprecation/plugin Next yang sudah dikenal |
| Web production build | pass, 49/49 halaman |
| Shell syntax | `bash -n` pass untuk seluruh script baru |
| Shell negative/contract tests | 16/16 pass |
| Automatic containment behavioral tests | 4/4 pass |
| Workflow parse | pass melalui `js-yaml` |
| Bundle verifier | lima file dan manifest hash exact |

Negative tests mencakup missing source/tree entry, extra FTL/JS/CSS/SVG, symlink,
wrong hash, wrong target SHA, dirty worktree, wrong branch, previous SHA bukan first
parent, redacted output, required workflow input/environment, controlled script,
explicit confirmation forwarding, dan recreate yang dibatasi ke Keycloak.

Harness containment mengeksekusi script remote aktual dengan Docker/curl hermetic dan
membuktikan: kegagalan sebelum mutasi tidak melakukan recreate atau theme update;
kegagalan setelah mutasi mengembalikan previous non-`diis`; previous `diis` jatuh ke
built-in `keycloak`; public auth diverifikasi ulang; temporary kcadm config dihapus;
exit tetap nonzero; secret marker tidak bocor; kegagalan containment menghasilkan
`operator_action_required=true`; dan hanya service Keycloak yang ditargetkan.

`shellcheck` tidak tersedia pada host ini. Coverage shell tetap memakai `bash -n`,
behavioral negative tests, dan disposable runtime proof; reviewer diminta mengulang
`shellcheck` bila tersedia pada lingkungan review.

## Disposable Keycloak Exact-SHA Proof

Runtime disposable:

- image: `quay.io/keycloak/keycloak:24.0`;
- container: `diis-wave9-kc-qa-keycloak`;
- network: `diis-wave9-kc-qa-net`;
- bind: source `themes/diis` ke `/opt/keycloak/themes/diis`, read-only;
- port: hanya `127.0.0.1:58092`;
- realm dan user: sintetis disposable;
- theme cache: disabled hanya pada runtime disposable;
- tidak memakai secret, database, role, client, atau PII staging/production.

Runtime proof:

- runtime tree berisi tepat empat direktori resmi dan lima regular file manifest;
- kelima runtime SHA-256 sama dengan approved source manifest;
- `login.js` ada di container dan respons asset HTTP berhasil;
- OIDC discovery HTTP 200 dan issuer realm disposable benar;
- realm login theme `diis`;
- bounded Keycloak log error count: 0;
- tidak ada credential marker pada log.

## Browser Evidence

Browser nyata pada disposable Keycloak membuktikan:

- locale menu hidden pada initial state;
- click membuka; second click, click-outside, dan Escape menutup;
- `aria-expanded` dan `aria-hidden` mengikuti state;
- Escape mengembalikan fokus ke locale trigger;
- Enter/Space membuka menu dan locale selection bekerja; Home/End ditutup oleh
  behavioral source test;
- Tab maju dari item bahasa memindahkan fokus ke `username`; Shift+Tab memindahkan
  fokus ke locale trigger; keduanya menutup menu, mempertahankan `:focus-visible`,
  `aria-expanded=false`, dan `aria-hidden=true`;
- Bahasa Indonesia dan English copy benar;
- password input terbaca; show/hide tidak mengubah dimensi input;
- desktop 1440x900, mobile 390x844, 200% reflow, dan reduced motion tidak overflow;
- mobile locale menu tidak menutupi password/form;
- fresh OIDC login sintetis berhasil;
- console warning/error: 0.

Screenshot disposable hanya dipakai sementara untuk inspeksi dan tidak dimasukkan ke
Git atau artefak Checkpoint B.

## Cleanup Proof

- Browser QA hanya memakai loopback lokal tanpa profile atau state fixture persisten;
  final proof tab ditutup dan port fixture sudah tidak tersedia.
- Container `diis-wave9-kc-qa-*`: 0.
- Network `diis-wave9-kc-qa-*`: 0.
- Listener port 58092: tidak ada.
- Docker server kembali sehat pada versi `29.4.3`.
- Pengaturan lokal Docker AI dikembalikan ke nilai awal `true`.
- Realm, user, temporary `kcadm` config, dan credential disposable hilang bersama
  container.
- Tidak ada screenshot, credential file, secret, atau `.tmp` fixture di worktree.

Docker Desktop 4.74 sempat gagal restart karena stale Windows Unix-socket reparse
points miliknya sendiri. Recovery dilakukan dengan menghentikan Docker, mengarsipkan
direktori socket lokal secara literal, menonaktifkan model runner hanya selama recovery,
dan memulai satu instance. Pengaturan `EnableDockerAI` sudah dikembalikan ke nilai awal
`true`; engine final sehat. Recovery ini tidak mengubah repo, image, volume data, shared
infrastructure, atau acceptance proof di atas.

## Security and Scope Confirmation

- Tidak ada secret/value credential dalam source, output, atau report.
- Tidak ada schema, migration, dependency, service, role, client, mapper, atau flow baru.
- Perubahan tema dibatasi pada `login.js` untuk keyboard focus dan penghapusan aset SVG
  historis yang tidak direferensikan; empat file manifest lain tidak berubah.
- Tidak ada akses/mutasi shared Keycloak, realm production/staging, atau production app.
- Tidak ada branch protection/ruleset yang diubah.
- Workflow belum pernah didispatch.

## Reviewer Request

Independent Reviewer diminta memeriksa diff dan mengulang minimal:

1. manifest/verifier dan 16 negative/contract tests;
2. workflow YAML, pinned actions, production environment, dan no-secret boundary;
3. disposable Keycloak source/runtime hash serta login behavior;
4. empat skenario containment behavioral dan Gitflow rollback contract;
5. cleanup serta exact changed-file manifest;
6. Tab/Shift+Tab/Enter/Space/Escape focus traversal pada Chrome.

Gate berikutnya hanya boleh dibuka setelah verdict independent reviewer. Commit, push,
PR, promotion, production deployment, workflow dispatch, dan shared Keycloak cutover
tetap **HOLD**.
