# Appointment Automation Deploy Workflow Safety Remediation

Tanggal: 2026-09-02

Status: **SOURCE COMPLETE - PRODUCTION OPERATIONS HOLD**

## Tujuan dan Batas

Remediasi ini menutup tiga belas finding pada deployment workflow setelah staging delivery Appointment
Automation Sudoers:

- P1-R08: staging dapat memutasi shared ingress production;
- P1-R09: recreate dan network recovery nginx dapat fail-open;
- P2-R10: automatic stash menyembunyikan drift checkout host.
- P1-R11: deploy `main` dan `staging` belum diserialisasi;
- P2-R12: recovery evidence dapat terhapus ketika rollback gagal;
- P2-R13: authority ingress staging bergantung pada filesystem production yang mutable.
- P1-R14: `workflow_dispatch` dapat menyisipkan nama ref ke remote shell.
- P2-R15: kandidat nginx staging baru diuji syntax, belum membuktikan routing.
- P1-R16: action bercredential deployment belum dipin ke commit immutable.
- P2-R17: cleanup candidate gagal belum memiliki fault-injection proof.
- P3-R18: Docker integration harness memakai image tag mutable.
- P1-R19: empat status HTTP 200 belum membuktikan identitas tujuan route.
- P2-R20: kegagalan observability container masih dianggap sebagai candidate tidak ada.

Pekerjaan dilakukan pada branch bersih `fix/deploy-workflow-safety-20260902` dari
`origin/develop@855cc306cbb6ce3bcc1b5fffa0a827b2092ba143`. Tidak ada akses atau mutasi
production, staging deployment, credential, sudoers runtime, systemd, timer, database, Keycloak,
commit, push, maupun PR.

## Implementasi

### P1-R08 - Isolasi staging dari shared ingress production

Deployment staging sekarang hanya menjalankan preflight dan post-check read-only melalui
`diis-shared-ingress.sh`:

- tidak menyalin `nginx.conf` ke checkout production;
- tidak membuat network shared;
- tidak merecreate, menghapus, menyambungkan, atau reload container `smk-nginx`;
- mengikat authority runtime pada exact SHA, tree, dan digest `origin/main`;
- menolak checkout production yang dirty, salah branch, atau tidak cocok dengan exact main;
- menerima kandidat nginx staging yang berbeda hanya untuk syntax validation pada container
  disposable, tanpa activation;
- memverifikasi container running, keanggotaan authoritative pada `smk-staging-net`, `nginx -t`,
  digest konfigurasi yang benar-benar dibaca container, serta health web/API production dan
  staging sebelum dan sesudah deployment aplikasi.

Perubahan shared ingress hanya tersedia pada branch `main` melalui mode production yang eksplisit.

### P1-R09 - Rollout dan rollback fail-closed

Helper production melakukan:

1. validasi SHA-256 candidate dan snapshot rollback;
2. `nginx -t` terhadap candidate melalui production compose context;
3. validasi topology, runtime digest lama, dan health kedua environment sebelum mutasi;
4. maksimal tiga percobaan recreate dengan success flag eksplisit;
5. pemeriksaan network membership sebelum connect dan sesudah connect;
6. runtime `nginx -t`, exact runtime digest candidate, dan health kedua environment;
7. rollback otomatis pada command failure, health failure, interupsi, atau sinyal;
8. status khusus nonzero `90` bila rollback sendiri tidak berhasil.

Jika digest candidate sama dengan konfigurasi runtime sebelumnya, helper selesai sebagai no-op setelah
seluruh preflight lulus. Shared nginx tidak direcreate tanpa perubahan konfigurasi.

Jalur rollback juga memakai retry terbatas, mengembalikan runtime ke konfigurasi sebelumnya,
memulihkan source candidate agar checkout tetap dapat diaudit, lalu memverifikasi runtime digest dan
health kedua environment. Fallback destruktif `docker rm -f smk-nginx` dihapus.

### P2-R10 - Exact-SHA dan host drift rejection

Workflow sekarang:

- mengikat deployment pada `${{ github.sha }}`;
- memverifikasi branch checkout sesuai event branch;
- menolak seluruh tracked dan untracked drift sebelum fetch;
- memperbarui remote-tracking ref branch secara eksplisit dan memastikan nilainya masih tepat pada
  workflow SHA;
- hanya menerima fast-forward ke exact SHA;
- memverifikasi HEAD, clean state, dan tree setelah checkout;
- tidak lagi menjalankan `git stash`, `git pull`, atau fallback yang mengabaikan error.

Host drift harus diselesaikan melalui prosedur operator terpisah. Workflow tidak menyembunyikan atau
memindahkannya.

### P1-R11 - Serialisasi deployment lintas environment

Workflow memakai satu GitHub concurrency group statis untuk seluruh deployment `main` dan `staging`,
dengan `cancel-in-progress: false`. Defense-in-depth di host mengambil advisory file lock sebelum
checkout, env update, build, migration, Docker, atau shared ingress diakses.

Lock host:

- memiliki timeout 300 detik dan gagal dengan exit `73` tanpa mutasi;
- mencakup seluruh remote deployment;
- tidak menghapus inode lock saat selesai;
- menyimpan metadata PII-safe berupa run ID, attempt, branch, SHA, dan waktu;
- memperbarui state menjadi released ketika proses selesai;
- tidak mengandalkan cancel atau retry diam-diam.

Behavioral harness membuktikan dua invocation paralel berjalan serial tanpa overlap. Matrix kedua
membuktikan invocation dengan timeout nol ditolak tanpa menulis mutation marker.

### P2-R12 - Recovery evidence lifecycle

Rollback snapshot sekarang diserahkan kepada helper saat rollout production dimulai. Lifecycle-nya:

- dihapus hanya setelah rollout sukses, no-op sukses, atau rollback sukses;
- dipindahkan ke recovery directory mode `0700` bila rollback gagal;
- disimpan sebagai file mode `0600`, disertai path dan SHA-256 tanpa isi file;
- memakai run ID dan run attempt pada fallback workflow agar rerun tidak menimpa bukti sebelumnya;
- tetap dipertahankan oleh cleanup workflow bila helper terputus setelah handoff.

Setiap atomic candidate memiliki nama unik per operasi dan dilacak. Candidate dibersihkan setelah
success atau rollback success; bila recovery gagal, file tidak dihapus. Fault injection membuktikan
copy failure, move failure, rollback failure, recovery marker, permission, digest, dan status khusus
`90`. Kegagalan preservation sendiri menggunakan status `91` atau mempertahankan source temp untuk
recovery manual.

### P2-R13 - Exact Git authority dan validation-only candidate

Pada deployment staging, workflow mengambil remote-tracking `origin/main` secara eksplisit, lalu
membuat authority artifact sementara langsung dari object Git:

- exact main commit SHA;
- exact main tree SHA;
- SHA-256 `infrastructure/nginx/nginx.conf` dari commit tersebut.

Helper memverifikasi checkout production clean dan persis pada branch/SHA/tree itu, lalu memastikan
runtime nginx membaca digest authoritative yang sama. Kandidat staging divalidasi menggunakan image
ID nginx runtime dan mount read-only dengan network `none`. Kandidat yang berbeda tidak diaktifkan,
tidak disalin ke production, dan tidak menyebabkan deadlock Gitflow. Hanya deployment `main` yang
memiliki mode rollout.

### P1-R14 - Dispatch ref fail-closed tanpa shell interpolation

Workflow sekarang menjalankan validator versioned sebelum job deployment dan job deployment sendiri
memiliki allowlist exact `refs/heads/main|staging`. Context GitHub diteruskan melalui environment action,
bukan disisipkan ke body remote shell. Validator dan remote preflight memeriksa pasangan ref/branch,
SHA 40 karakter lowercase hex, serta run ID/attempt numerik sebelum akses host atau lock.

Regression test mengeksekusi ref `main` dan `staging` yang sah, lalu ref sintetis berisi command
substitution. Ref terlarang berhenti dengan exit `64`, sentinel tidak dibuat, dan source contract
memastikan body remote shell tidak memuat interpolasi `${{ github.* }}`.

### P2-R15 - Disposable candidate routing validation

Staging preflight dan post-check sekarang menjalankan kandidat nginx dalam container disposable:

- nama container diturunkan dari run ID/attempt tervalidasi dan port TLS host dipilih dinamis;
- config kandidat dan certificate directory hanya di-mount read-only;
- filesystem container read-only dengan tmpfs terbatas;
- candidate terhubung ke production network dan staging network tanpa mengganti `smk-nginx`;
- empat probe HTTPS memakai Host/SNI untuk web dan API production/staging;
- mapping host ke alias upstream divalidasi exact dan setiap response wajib HTTP 200;
- harness Docker mewajibkan empat body marker unik untuk membuktikan identitas tujuan;
- container candidate selalu dibersihkan pada success, failure, dan signal; cleanup failure menjadi
  status nonzero `92`.

Behavioral fault injection membuktikan upstream candidate yang gagal tidak dapat memperoleh marker
pass, candidate sehat melayani empat route, runtime shared ingress tidak berubah, dan seluruh state
disposable kembali nol.

Harness Docker terpisah disediakan untuk menjalankan nginx dan empat upstream sintetis pada dua
network disposable dengan TLS/Host/SNI nyata. Kontraknya memeriksa candidate sehat, upstream palsu,
identitas/digest shared ingress, serta cleanup container dan network hingga nol.

### P1-R16 - Immutable action supply chain

Kedua penggunaan `actions/checkout` dan action SSH yang menerima credential deployment sekarang dipin
ke full 40-character commit SHA yang sama dengan workflow Keycloak yang telah direview. Komentar versi
manusia tetap tersedia, sedangkan contract test menolak setiap `uses:` dalam workflow deploy yang tidak
berbentuk pin commit immutable.

### P2-R17 - Cleanup failure fail-closed

Cleanup candidate sekarang mencetak recovery identifier berupa nama container non-sensitive ketika
`docker rm -f` gagal. Fault injection membuktikan exit `92`, tidak ada marker routing/preflight sukses,
shared ingress tetap identik, dan retry dengan run identity yang sama tetap ditolak karena candidate
stale. Setelah fault dilepas, cleanup sempit mengembalikan state disposable ke nol.

### P3-R18 - Immutable Docker evidence image

Harness Docker memakai manifest-list digest immutable resmi `nginx` dan menolak override berupa tag
mutable. Harness juga memeriksa image ID hasil resolusi berbentuk digest SHA-256 dan hanya mencatat
digest non-sensitive tersebut.

### P1-R19 - Identity-aware route validation

Helper sekarang memvalidasi kontrak exact untuk empat pasangan host, variable proxy, alias container,
dan port sebelum kandidat dijalankan. Server block yang hilang, ganda, memakai target salah, atau memakai
proxy variable lintas-route ditolak. Setelah itu probe runtime tetap wajib HTTP 200 dan, pada harness
Docker, body harus cocok dengan satu dari empat marker unik: production web, production API, staging web,
dan staging API.

Harness Docker menukar backend production/staging dan web/API sambil mempertahankan response HTTP 200.
Keduanya ditolak karena marker tidak cocok. Pada jalur live tanpa marker aplikasi, route contract exact
ditambah runtime config digest memastikan konfigurasi yang diaktifkan tetap memiliki binding yang telah
divalidasi; health kemudian membuktikan target tersebut dapat dilayani.

### P2-R20 - Tri-state candidate observability

Keberadaan candidate tidak lagi ditentukan dari exit `docker inspect` saja. Jika inspect gagal, helper
memakai listing container exact-name sebagai konfirmasi kedua dan membedakan `present`, `confirmed absent`,
serta `observability unavailable`. State terakhir mempertahankan nama candidate, mencetak recovery
identifier non-sensitive, dan menghasilkan exit `92`.

Fault injection membuktikan kegagalan inspect dan fallback observability setelah candidate berjalan tidak
dapat menghasilkan marker sukses. Candidate tetap tercatat, shared ingress tidak berubah, dan retry dengan
run identity yang sama tetap fail-closed sampai cleanup terkonfirmasi.

### Packaging CI follow-up - Linux lock harness execution

CI packaging pertama dihentikan setelah langkah full test tidak selesai. Root cause berasal dari lock
harness yang memanggil dirinya sebagai executable, sementara file baru secara sah tersimpan dengan mode Git
`100644`. WSL pada NTFS tidak mereproduksi batas permission Linux tersebut, sehingga worker gagal mulai pada
runner Linux dan loop penunggu sebelumnya tidak berbatas.

Harness sekarang selalu memulai worker melalui `bash`, membatasi penantian event hingga lima detik, gagal
dengan alasan eksplisit bila worker berhenti sebelum event, dan membersihkan setiap PID worker melalui trap.
Perubahan ini tidak mengubah helper deployment atau runtime production; hanya membuat bukti concurrency
portable dan fail-closed pada runner Linux.

## Behavioral Proof

Contract harness menjalankan helper canonical dengan Docker, Git, curl, copy, move, dan sleep stub
terkontrol. Matrix ingress berikut lulus pada Git Bash dan WSL/Linux shell:

1. staging preflight/post-check tidak melakukan mutasi;
2. kandidat staging yang berbeda divalidasi tanpa activation;
3. binding production/staging yang tertukar ditolak sebelum container dijalankan;
4. binding web/API yang tertukar ditolak sebelum container dijalankan;
5. kandidat dengan upstream gagal ditolak dan dibersihkan tanpa shared mutation;
6. sinyal saat validasi kandidat menghasilkan exit `143` dan cleanup;
7. kegagalan menghapus candidate menghasilkan exit `92`, recovery identifier, dan retry fail-closed;
8. kegagalan inspect/fallback observability menghasilkan exit `92` dan retry fail-closed;
9. checkout production dirty ditolak;
10. main SHA mismatch ditolak;
11. runtime digest stale ditolak;
12. invalid candidate config ditolak sebelum recreate;
13. tiga kegagalan recreate menghasilkan failure dan rollback;
14. kegagalan reconnect menghasilkan failure dan rollback;
15. kegagalan post-change health menghasilkan failure dan rollback;
16. sinyal saat mutasi menghasilkan exit `143` dan rollback;
17. kegagalan rollback menghasilkan exit `90`, tidak pernah success;
18. copy failure mempertahankan recovery evidence;
19. move failure mempertahankan recovery evidence dan atomic candidate;
20. candidate tanpa perubahan menghasilkan no-op tanpa recreate atau reconnect;
21. rollout sehat menghasilkan marker success hanya setelah seluruh verifikasi lulus.

Host lock harness Linux menambahkan dua proof: deployment paralel terserialisasi dan bounded timeout
ditolak tanpa mutation.

Harness juga membuktikan runtime kembali ke konfigurasi sebelumnya setelah rollback, source candidate
tetap dapat diverifikasi, dan marker rollout success tidak muncul pada seluruh jalur gagal.

## Verifikasi

### Focused

- Shell syntax helper dan harness: pass pada Git Bash dan WSL.
- Deploy-context behavioral proof: `main` dan `staging` diterima; ref command-substitution yang juga
  valid menurut `git check-ref-format` ditolak dengan exit `64` dan tidak membuat sentinel.
- Ingress behavioral harness: 21/21 pass pada Git Bash dan 21/21 pass pada WSL.
- Kontrak empat route pada `infrastructure/nginx/nginx.conf` aktual: pass pada Git Bash dan WSL.
- Permission recovery `0700/0600` dibuktikan pada WSL/Linux yang setara target VPS; Git Bash
  menjalankan matrix perilaku yang sama tetapi tidak dipakai untuk klaim mode POSIX pada NTFS.
- Host lock behavioral harness: 2/2 pass pada WSL/Linux.
- Docker candidate routing integration: script lulus syntax check, tetapi run lokal tidak diklaim.
  Docker Desktop gagal start pada stale `dockerInference` reparse-point di luar workspace; Docker AI
  dikembalikan ke nilai awal `true` dan seluruh proses Docker dihentikan. Closure source memakai
  behavioral matrix canonical 21/21; integration Docker nyata tetap tersedia untuk re-review atau
  staging gate.
- Default image memakai OCI index digest immutable yang diverifikasi melalui registry resmi; override
  mutable `nginx:latest` ditolak sebelum akses Docker daemon dengan exit `64`.
- Jest deployment workflow safety: 1 suite / 6 test pass.
- Prettier workflow dan test: pass.
- `git diff --check`: pass.

### Regression

- Full API: 72 suite pass, 1 suite skipped; 1.355 test pass, 7 test skipped.
- Full Web: 52 suite / 372 test pass.
- Workspace type-check: 9/9 task pass.
- Workspace lint: 3/3 task pass.
- Workspace build: 6/6 task pass; Next.js 49/49 halaman.
- Direct API type-check, lint, dan build: pass.

Type-check awal memakai dependency junction lama dan gagal karena package/Prisma output stale. Bukti
tersebut tidak dipakai. Dependency kemudian dipasang bersih dengan lockfile yang ada, Prisma client
dan package internal dibangun ulang, lalu seluruh pemeriksaan di atas lulus. `package-lock.json` dan
dependency declarations tidak berubah. `npm ci` melaporkan 22 audit finding baseline; remediasi
dependency berada di luar scope dan tidak disamarkan sebagai closure.

`shellcheck` tidak tersedia pada host dan tidak diklaim lulus. Sebagai pengganti yang tersedia, kedua
script lulus `bash -n`, dua runtime shell, behavioral failure matrix, dan Jest contract pada source
yang sama.

## Negative Controls

- Tidak ada staging path yang menulis ke checkout atau compose context production.
- Tidak ada `${{ github.* }}` atau secret interpolation pada body remote shell; context dan VAPID
  dikirim sebagai environment, lalu ref/branch/SHA/run identity divalidasi sebelum host access.
- Manual dispatch di luar exact branch `main|staging` gagal sebelum job SSH.
- Seluruh action pada workflow deploy dipin ke full commit SHA; action bercredential tidak memakai tag.
- `main` dan `staging` berbagi satu GitHub queue serta satu bounded host lock.
- Tidak ada `git stash`, broad clean/reset, atau ignored checkout failure.
- Tidak ada force-remove shared `smk-nginx`, best-effort reconnect, atau success message setelah retry
  habis.
- Network missing, membership salah, config invalid, digest mismatch, health failure, signal, dan
  rollback failure semuanya nonzero.
- Public health mencakup web dan API pada production serta staging.
- Kandidat staging yang berbeda hanya melalui disposable validation dan tidak mengubah runtime.
- Candidate routing memakai container auto-remove, nama/port unik, resource bounds, empat probe
  Host/SNI, dan cleanup fail-closed pada success, upstream failure, serta signal.
- Empat binding host/variable/alias/port diverifikasi exact; empat marker Docker yang unik menolak
  pertukaran production/staging dan web/API meskipun seluruh response berstatus 200.
- Cleanup removal failure menghasilkan exit `92`, recovery identifier non-sensitive, tanpa marker
  sukses; retry tetap fail-closed sampai candidate stale dibersihkan secara terukur.
- Inspect dan fallback listing yang sama-sama gagal juga menghasilkan exit `92`; state candidate tidak
  dikosongkan tanpa bukti bahwa container benar-benar absent.
- Harness Docker menolak image tag mutable dan mencatat hanya resolved image digest.
- Rollback snapshot serta atomic candidate dipertahankan ketika recovery gagal.
- Output hanya memuat status dan digest konfigurasi; tidak memuat credential, env value, PII, atau
  payload bisnis.

## Explicit Manifest

Manifest Executor untuk gate berikutnya tepat delapan file:

1. `.github/workflows/deploy.yml`
2. `apps/api/src/__tests__/deploy-workflow-safety.spec.ts`
3. `infrastructure/deploy/diis-shared-ingress.sh`
4. `infrastructure/deploy/tests/shared-ingress-contract.sh`
5. `infrastructure/deploy/tests/deploy-lock-contract.sh`
6. `infrastructure/deploy/tests/candidate-routing-docker-contract.sh`
7. `infrastructure/deploy/validate-deploy-context.sh`
8. `docs/audits/APPOINTMENT-AUTOMATION-DEPLOY-WORKFLOW-SAFETY-REMEDIATION-2026-09-02.md`

Dilarang menggunakan `git add .`, `git add -A`, broad glob, atau memasukkan laporan reviewer lama
secara implisit.

## Residual Risk dan Gate Berikutnya

`smk-nginx` tetap shared ingress production-owned yang melayani dua environment. Remediasi ini
menghilangkan mutation path dari staging dan membatasi perubahan runtime ke main, tetapi deployment
production masih harus melalui approval, exact-SHA review, dan safe runtime proof tersendiri.

Laporan Independent Reviewer tetap reviewer-owned dan tidak termasuk manifest Executor secara
otomatis.

Gate berikutnya adalah Independent Source Review atas manifest delapan file. Setelah review hijau,
explicit Git packaging dan CI tetap gate terpisah. Bootstrap sudoers production, rehearsal,
reaktivasi timer, dan scheduled-run sign-off tetap **HOLD** dan tidak boleh disimpulkan dari bukti
source ini.
