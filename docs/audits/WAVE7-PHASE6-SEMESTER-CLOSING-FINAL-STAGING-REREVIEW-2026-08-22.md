# Wave 7 Phase 6 Semester Closing - Final Staging Re-review

Tanggal: 2026-08-22

Target: `staging`

Deployed SHA: `03c57303365ba7f6d49f02a55f0987448f6999f9`

Peran: independent reviewer, review-only

## Verdict

**FOLLOW-UP REQUIRED BEFORE FINAL STAGING SIGN-OFF**

Tidak ditemukan P0/P1/P2 baru pada source produk. Delivery PR #551/#552, deploy,
branch containment, dan G1 KAPROG dapat diterima. Final sign-off masih ditahan oleh
satu finding evidence-integrity yang memengaruhi klaim positive-close G2 dan satu
finding evidence-permanence.

Follow-up ini tidak memerlukan Prompt Architect baru dan tidak membuka kembali scope
implementasi Wave 7.

## Delivery Integrity

Reviewer memverifikasi:

- PR #551 merged ke `develop` dengan source head
  `2e5cdad6e5834271dcebd83e1676bf2afb3c1c19` dan merge commit
  `45c33ab59de52ce19a571f361400e46a4fc9dce9`;
- PR #552 merged ke `staging` dengan merge commit
  `03c57303365ba7f6d49f02a55f0987448f6999f9`;
- deploy run `32556638311` sukses pada exact staging SHA tersebut;
- `origin/staging` menunjuk ke exact deployed SHA;
- `origin/main` tetap `23e93af414a3b71ff0114ad43f78b833cefaa132`;
- tidak ada PR terbuka;
- required approvals `develop`, `staging`, dan `main` masing-masing kembali `1`.

Status: **PASS**.

## Accepted Evidence

### G1 - KAPROG major-only

Status: **PASS**.

Evidence menunjukkan Appointment `KAPROG` aktif untuk `QAAKL`, aktivasi scheduler
idempotent, tampilan hanya memuat scope `QAAKL`, form final close tersembunyi, dan
tidak ada label/data `QATKJ`, `QABDP`, atau school-wide pada sesi KAPROG.

### G2 - Historical snapshot, print, dan CSV

Status: **PARTIAL PASS**.

Evidence yang dapat diterima:

- satu `SemesterClosure` tersedia pada database disposable;
- detail historis menampilkan periode, aktor, hash, periode berikutnya, metric,
  heatmap kelas/jurusan, KKTP, dan CP/TP/ATP;
- `window.print()` terpanggil;
- CSV period-bound berhasil dan memuat snapshot kelas, jurusan, mapel, KKTP, dan
  curriculum map;
- shared staging tidak ditutup;
- disposable runtime dan credential sementara telah dibersihkan.

Evidence ini membuktikan pembacaan snapshot/export, tetapi belum cukup membuktikan
positive-close browser action pada run yang sama.

## Findings

### P1-E01 - Artefak G2 tidak membuktikan transisi positive-close pada run yang sama

Finding ini adalah blocker evidence, bukan bukti bug produk.

Evidence:

- `.tmp/wave7-g2-before-close.png` dan
  `.tmp/wave7-g2-after-close.png` memiliki SHA-256 identik
  `7F1DA5F204320B4773CD88EAD9D7468A9DE04DF3945FC91DF431DABE125F8FE7`;
- kedua nama file merujuk ke gambar yang sama, yaitu state sesudah Semester 1
  ditutup: halaman sudah berada pada Semester 2 dan menampilkan blocker periode baru;
- `.tmp/wave7-g2-evidence.json` mencatat `initial.ready=true` sekaligus
  `initial.alreadyClosed=true`;
- field `close.hasSuccessOrHistory=true` hanya membuktikan success/history text
  tersedia, bukan bahwa klik final-close dan respons sukses terjadi pada run ini.

Closure row, detail historis, print, dan CSV membuktikan bahwa closure pernah dibuat,
tetapi tidak mengikat secara audit bahwa browser run ini dimulai dari closure count `0`,
melakukan final close, lalu menghasilkan closure count `1`.

Required narrow follow-up:

1. jalankan ulang G2 pada disposable exact-image/SHA yang sama atau SHA docs-only yang
   application tree-nya ekuivalen;
2. sebelum klik, rekam periode Semester 1, `ready=true`, form close terlihat, dan
   closure count `0`;
3. rekam network/action result final-close sukses tanpa secret/PII;
4. sesudah klik, rekam success handoff, Semester 2 aktif, dan closure count `1`;
5. ulangi satu refresh untuk membuktikan state bertahan;
6. detail/print/CSV tidak perlu diuji mendalam ulang bila snapshot hash yang sama dapat
   ditautkan; bila fixture baru menghasilkan hash baru, ulangi sanity check ketiganya;
7. beri nama artefak sesuai state dan catat hash file dalam laporan.

### P2-E02 - Laporan dan evidence final belum permanen

Laporan G1/G2 serta laporan reviewer masih untracked. `.tmp` memang tidak boleh
dikomit, tetapi evidence keputusan harus tersedia secara PII-safe dalam laporan yang
tracked pada `develop` dan `staging` sebelum menjadi baseline promosi `main`.

Required fix:

1. perbarui laporan G1/G2 dengan hasil rerun P1-E01 dan hash artefak lokal;
2. jangan commit token, cookie, secret, credential, atau screenshot yang mengandung
   data sensitif;
3. commit laporan QA dan final reviewer report melalui explicit file list;
4. merge docs evidence ke `develop`, promote ke `staging`, dan pastikan CI/deploy docs
   hijau;
5. verifikasi application tree tetap ekuivalen dengan SHA yang diuji;
6. hapus `.tmp` evidence setelah laporan permanen dan reviewer tidak lagi
   membutuhkannya.

## Non-findings

- Favicon `404` pada disposable `localhost:4300` bukan endpoint/data failure dan tidak
  memblokir sign-off.
- Tidak diperlukan perubahan source, schema, migration, dependency, Keycloak,
  appointment model, atau shared staging database.
- Tidak ada izin untuk merge `staging -> main` atau deploy production pada verdict ini.

## Next Gate

Kirim follow-up langsung ke Executor. Setelah P1-E01 dan P2-E02 ditutup, reviewer hanya
perlu memeriksa delta evidence, exact SHA/tree equivalence, dan permanence report. Tidak
perlu mengulang source review atau seluruh role matrix.

Final approval dapat diberikan bila:

- G2 browser close transition terbukti konsisten pada satu disposable run;
- G1 tetap PASS;
- laporan final tracked pada `origin/staging`;
- tidak ada unreviewed application source delta;
- `main`/production tetap tidak berubah.

## Confidence

- Delivery integrity: **99%**.
- G1 KAPROG: **97%**.
- Historical snapshot/export behavior: **98%**.
- Positive-close action evidence saat ini: **70%**.
- Verdict follow-up: **99%**.
