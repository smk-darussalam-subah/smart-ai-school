# DIIS People Profile Batch A - Independent Source Re-review 4

Tanggal review: 1 Oktober 2026, 13:10 WIB  
Peran: Independent Source Reviewer  
Worktree: `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school-people-profile-batch-a-20260930`  
Branch: `feat/people-profile-batch-a-20260930`  
Baseline HEAD: `40aa671e0e283d7e499d5ab635c84ae3660a2adf`

## Verdict

**`APPROVED FOR EXPLICIT GIT PACKAGING - RUNTIME HOLD`**

Approval ini hanya berlaku untuk exact source manifest 32 path, aggregate SHA-256, dan laporan Executor Follow-up 4 yang tercantum di bawah. Approval ini bukan izin commit, push, PR, merge, deployment, staging, production, atau mutasi runtime.

## Findings First

- **P0:** tidak ada.
- **P1:** tidak ada.
- **P2:** tidak ada.
- **P3:** tidak ada.

P2-R11 dari re-review sebelumnya telah tertutup. Tidak ditemukan regresi baru pada scope Follow-up 4.

## Exact Binding

| Bukti                    | Nilai terverifikasi                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Laporan Executor         | `docs/audits/DIIS-PEOPLE-PROFILE-BATCH-A-OPERATIONAL-FOLLOWUP-4-EXECUTOR-2026-10-01.md` |
| SHA-256 laporan Executor | `26b3f9cbacd7c0de4a1f5141d09ef5d2b664bc3ed6fea4934eac28348f21cacb`                      |
| Source manifest          | `32/32` path ada dan hash cocok                                                         |
| Source aggregate SHA-256 | `ef86ea03e0c23e0bd6deefbfbdcaa00b9c32aee87e2b3da85b002541f1f33188`                      |
| Manifest mismatch        | `0`                                                                                     |
| Delta dari Follow-up 3   | tepat 4 path                                                                            |
| Staged files             | `0`                                                                                     |

Empat path yang berubah sejak Follow-up 3:

1. `apps/api/src/users/users.service.ts`
2. `apps/api/src/__tests__/users.spec.ts`
3. `apps/api/src/__tests__/keycloak-admin.spec.ts`
4. `apps/api/src/__tests__/appointment-bk-capacity-postgres.spec.ts`

Tidak ada perubahan source lain yang disisipkan pada Follow-up 4.

## Closure P2-R11

### Source reasoning

`updateRole()` melakukan empat operasi admin Keycloak pada kondisi cache role dingin:

1. resolve role baru;
2. tulis mapping role baru;
3. resolve role lama;
4. hapus mapping role lama.

Masing-masing operasi dapat memakai dua attempt berjangka waktu 10.000 ms. Dengan margin commit 15.000 ms, anggaran transaksi konservatif yang benar adalah:

`4 x (10.000 ms x 2 attempt) + 15.000 ms = 95.000 ms`

Binding source terverifikasi pada:

- `apps/api/src/users/users.service.ts:45`: `ROLE_SYNC_KEYCLOAK_CALL_COUNT = 4`;
- `apps/api/src/users/users.service.ts:469`: nilai tersebut dipakai oleh opsi transaksi `updateRole()`;
- `apps/api/src/users/user-mutation-coordination.ts:24`: timeout dihitung dari budget per call dikali `callCount`, lalu ditambah margin;
- `apps/api/src/__tests__/users.spec.ts:358` dan `:395`: kedua jalur role-sync menuntut timeout `95_000`;
- `apps/api/src/__tests__/keycloak-admin.spec.ts:280`: cold-cache proof membuktikan 8 admin attempts dan 5 token fetches;
- `apps/api/src/__tests__/appointment-bk-capacity-postgres.spec.ts:254`: transaksi PostgreSQL aktual dipertahankan melewati empat fase Keycloak bounded.

Token fetch tidak memerlukan penambahan budget terpisah di luar attempt admin: deadline attempt admin sudah dimulai sebelum token diperoleh dan tetap membatasi keseluruhan attempt. Uji cold-cache tetap menghitung fetch token secara eksplisit untuk membuktikan bentuk jalur terburuk.

### Behavioral proof

- Focused API: **5 suite, 181/181 test PASS**.
- Cold-cache negative proof: **8 admin attempts + 5 token fetches PASS**.
- PostgreSQL disposable: **49/49 migration**, **12/12 test PASS**.
- Proof empat fase selesai tanpa `P2028`.
- Race/lock regression reset, role, status, archive, dan restore tetap lulus.
- Container PostgreSQL disposable setelah cleanup: **0**.

Percobaan PostgreSQL reviewer pertama ditolak sebelum test karena nama database buatan reviewer tidak memenuhi pola disposable milik harness. Container percobaan tersebut dibersihkan. Reviewer mengulang dari awal dengan nama, marker, confirmation, dan localhost binding yang benar; hasil final adalah 12/12 PASS. Ini adalah koreksi invocation reviewer, bukan defect source.

## Verification Matrix

| Pemeriksaan                   | Hasil                                         |
| ----------------------------- | --------------------------------------------- |
| Focused API                   | `181/181 PASS`                                |
| PostgreSQL integration        | `12/12 PASS`                                  |
| Prisma migrations disposable  | `49/49 applied`                               |
| API type-check                | PASS                                          |
| API lint                      | PASS                                          |
| API production build          | PASS                                          |
| Prettier source yang didukung | `31/31 PASS`                                  |
| Migration SQL                 | tervalidasi melalui migrasi PostgreSQL aktual |
| `git diff --check`            | PASS                                          |
| `git diff --cached --check`   | PASS                                          |
| High-confidence secret scan   | `0` temuan                                    |
| Source manifest               | `32/32 MATCH`                                 |
| Staged files                  | `0`                                           |
| Disposable container residue  | `0`                                           |

Full Web dan full API tidak diulang. Follow-up 4 hanya mengubah empat path API/test yang disebutkan di atas; focused API, build API, dan PostgreSQL aktual memberi cakupan langsung pada defect. Evidence broad suite sebelumnya dapat digunakan kembali karena seluruh byte di luar empat path tersebut tetap identik terhadap manifest Follow-up 3.

## Residual Boundaries

- Tidak dilakukan pengujian terhadap Keycloak live, staging, production, atau data nyata.
- Tidak dilakukan commit, push, PR, merge, deployment, maupun perubahan protection.
- Review ini tidak mengubah penerimaan risiko operasional yang sudah ada dan tidak memberi approval runtime.
- Kegagalan proses setelah efek eksternal Keycloak tetapi sebelum commit database tetap merupakan batas distributed transaction yang telah diketahui; perubahan ini memperbaiki kepemilikan dan timeout, bukan mengklaim atomic commit lintas Keycloak/PostgreSQL.

## Packaging Gate

Packager berikutnya harus:

1. membangun paket literal dari exact 32 source path di manifest Follow-up 4;
2. menyertakan laporan Executor Follow-up 4 dan laporan review ini sebagai handoff yang terikat hash;
3. mengecualikan laporan reviewer historis atau file lokal lain yang tidak diotorisasi;
4. membuktikan blob index/commit identik, `git diff --cached --check` bersih, dan CI exact-head hijau;
5. berhenti sebelum merge dan seluruh mutasi runtime.

## Rekomendasi model untuk tindak lanjut

Task berikutnya: Executor melakukan Git packaging literal untuk exact 32 source path plus dua handoff, lalu berhenti pada independent exact-PR review; runtime tetap HOLD.  
Model / effort: GPT-5.6 Terra (`gpt-5.6-terra`) / medium.  
Alasan: keputusan semantik dan race telah ditutup dengan proof aktual; pekerjaan berikutnya bersifat mekanis pada manifest, blob, tree, dan CI.  
Syarat kualitas: aggregate dan seluruh blob harus identik dengan approval ini, paket tidak boleh memuat laporan historis yang tidak diotorisasi, dan deployment count harus nol.  
Eskalasi bila: hash, path, tree, atau CI tidak cocok -> GPT-5.6 Sol (`gpt-5.6-sol`) / high untuk investigasi sebelum tindakan lain.  
Sesi laporan ini: model/effort aktual tidak terverifikasi.
