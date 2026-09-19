# W10-D Writer Compatibility Hash-Chain Follow-up

- Tanggal: 2026-09-14, Asia/Jakarta
- Peran: Executor, bukan Independent Reviewer
- Baseline: `57c95976d48e6dce1e8a99290125948f0180c180`
- Baseline tree: `f79ba17f186bd05f3f76a70cf9cbc4759c319dfd`
- Status: `SOURCE COMPLETE - INDEPENDENT REVIEW REQUIRED - PR659 AND OPERATIONS HOLD`

## Ringkasan

CI PR #659 berhenti secara fail-closed karena perubahan sah pada
`infrastructure/docker/scripts/backup-lib.sh` belum diteruskan ke tiga consumer
writer-compatibility. Source closure menemukan satu mismatch, kemudian seluruh 11
transaction capacity menolak writer attestation sebelum mutasi. Tidak ada backup, restore,
Drive, credential, image, n8n, staging, VPS, atau production yang disentuh.

Follow-up ini memperbarui satu hash chain, bukan perilaku backup:

1. wrapper legacy mengikat SHA-256 library baru;
2. installer immutable mengikat library dan wrapper aktual;
3. deploy gate mengikat pasangan yang sama dan menghasilkan artifact identity baru;
4. source regression menolak dua hash lama;
5. successor handoff mengikat exact failed head PR #659, packet D2 sebelumnya, dan packet
   round-trip 21 path tanpa mengubah evidence historis.

## Binding writer

| Komponen | SHA-256 |
| --- | --- |
| `backup-lib.sh` | `a2a665af38a5e187a351397c7d0adf7082205c59c1fd97dbf0dac706cc5edb86` |
| `legacy-backup-compatibility.sh` | `ceba770caa09446a83f09ce7dc72d317782d26e2c06121e7730f0bc07042c326` |
| artifact writer compatibility | `001f40b7c1cdcfca4b5e623bedd646bd86e997e6683faa0245df4102883148ca` |

Hash library lama `bf881caf...` dan wrapper lama `70cf649c...` ditolak oleh regresi.
Validasi tetap fail-closed sebelum lock atau producer dijalankan bila source, attestation,
mount, installer artifact, atau runtime digest berbeda.

## Handoff integrity

Successor validator menjalankan validator D2 lama dari exact Git bytes, bukan dari file
working tree. Hasil predecessor tetap `6 source / 6 rebinding / 59 historical inputs`;
delapan input packet D2 dihitung sebagai histori tervalidasi. Packet round-trip juga
diverifikasi dari delta exact `2d6d053... -> 57c95976...`: tepat 21 path, source manifest
10/10, report/evidence, receipt manifest, proof payload, dan tujuh receipt. Total historical
input yang dibuktikan successor adalah 88.

Negative controls menolak source byte berubah, evidence hilang, baseline salah, manifest
atau rebinding kurang, extra path, status tidak sah, hash writer stale, predecessor
round-trip salah, failed test, dan klaim bahwa evidence historis diedit.

## Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| Python syntax | PASS |
| Source closure contract | `45/45 PASS` |
| Capacity lifecycle contract | `55/55 PASS` |
| Integrated closure contract | `25/25 PASS` |
| Staging readiness contract | `49/49 PASS` |
| Canonical successor handoff | `6 source / 6 rebinding / 88 historical inputs` |
| D2 predecessor exact Git bytes | `67 inputs PASS` |
| Round-trip predecessor exact Git bytes | `21 paths PASS` |
| Diff, whitespace, conflict marker, secret scan | PASS |

Backup contract `47/47` dan round-trip `7/7` tidak dijalankan ulang karena seluruh input
pengujiannya byte-identik dengan exact head PR #659. Follow-up ini tidak mengubah formula,
backup implementation, n8n workflow, receipt, ataupun synthetic payload sebelumnya.

## Source manifest

Aggregate SHA-256 menggunakan path ASCII terurut dan format
`<sha256><dua spasi><path><LF>`:

`2d60466603ce885a8d682fc303c8a93f3eda431f76234a9b344dc6efba09e0a0`

| Path | SHA-256 |
| --- | --- |
| `infrastructure/deploy/install-w10d-writer-compatibility.py` | `4c8b2e2a81b333ea39076da6adedd7ce83c34c6e0c360d4489e0a4f7394ff8fb` |
| `infrastructure/deploy/legacy-backup-compatibility.sh` | `ceba770caa09446a83f09ce7dc72d317782d26e2c06121e7730f0bc07042c326` |
| `infrastructure/deploy/staging-application-deploy.py` | `f6d2db539862066e88284ad5a3decefd8d79507b5388349990fff953c9a4ddcb` |
| `infrastructure/deploy/tests/integrated-closure-contract.py` | `4065943748fa13d04a3307fbdd4341554bd4706e6c310d362662cbc48fff47d4` |
| `infrastructure/deploy/tests/source-closure-contract.py` | `411dabdf99da6dc03f17d643018dd3758c9caea6653783c250864b8b94c038e3` |
| `infrastructure/deploy/verify-integrated-handoff.py` | `41c6cfa39defb6ab6b3e1fc10aa53375a4a23a5b7f3a5fb4218cd509b19f2840` |

Literal manifest final adalah delapan path: enam source di atas, laporan ini, dan
`docs/audits/W10D-WRITER-COMPATIBILITY-HANDOFF-EVIDENCE-2026-09-14.json`.

## Batas dan tindak lanjut

PR #659 tidak diubah pada gate ini. Commit, push, force-push, PR update, merge, relaksasi
protection, build/tag/publication D2, credential, Drive, backup/restore operasional,
cleanup host, n8n, staging, VPS, D3-D6, dan production tetap HOLD.

Tindak lanjut berikutnya adalah independent source review sempit terhadap delapan path dan
chain predecessor-successor. Setelah approved, diperlukan otorisasi baru untuk mengganti
head PR atau membuat PR follow-up; CI Ubuntu exact-head tetap menjadi bukti akhir.

## Rekomendasi model

Task berikutnya: independent review atas integrity handoff dan writer hash chain.

Model / effort: GPT-5.6 Sol (`gpt-5.6-sol`) / high.

Alasan: delta kecil tetapi berada pada supply-chain, attestation, dan historical evidence
binding. Jika tidak ada finding, packaging/PR follow-up berikutnya cukup GPT-5.6 Terra /
medium.

Sesi laporan ini: model dan effort aktual tidak diverifikasi.
