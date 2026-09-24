# DIIS Assessment Resilience and Integrity Monitoring - Executor Report

Tanggal: 2026-09-24

Status: **SOURCE COMPLETE - INDEPENDENT RE-REVIEW REQUIRED - STAGING HOLD**

## Binding

- Checkout: `smart-ai-school-pwa-offline-shell-followup-20260923`
- Branch: `fix/pwa-offline-shell-after-logout-20260923`
- Baseline SHA: `31e9ee5582328f4c3bb3fd747b007d124b51a85d`
- Baseline tree: `300359a73eaa4ed5f807745e937ea4fc60ae48f4`
- Source manifest: 21 path
- Follow-up terakhir R16: tepat 3 path source dari manifest yang sama
- Source aggregate SHA-256: `3f82e65fe8d59670a87020637c99b40aecde1a28956e55c8a24a86c1c2ed5167`
- Algoritme aggregate: urutkan path dengan perbandingan byte ASCII case-sensitive, bentuk setiap baris sebagai `<lowercase sha256><dua spasi><path><LF>`, gabungkan sebagai UTF-8, lalu SHA-256.
- Staged files: 0
- Independent re-review yang ditindaklanjuti tetap tidak diubah; SHA-256:
  `05688dfe5e04cc7f76d562e7b5af04eafc46c73c06edb20e44055a21f61fff26`

## Keputusan Produk yang Diimplementasikan

Jawaban siswa yang tiba setelah deadline karena koneksi terputus **tidak diblokir**. Server menerima dan menguncinya sebagai `pending`, tetapi belum menjadikannya jawaban resmi dan belum menghitung nilai. Syaratnya, server sudah memiliki record pengerjaan dengan `startedAt` yang dibuat ketika siswa benar-benar memulai asesmen yang sedang dibuka.

Guru pemilik sesi atau reviewer yang sah menjadi otoritas akhir:

- **Terima**: jawaban kandidat disalin menjadi jawaban resmi dan baru kemudian dinilai.
- **Tolak**: kandidat dipertahankan sebagai bukti audit, tetapi tidak disalin ke jawaban resmi dan tidak dinilai.
- Kedua tindakan mewajibkan catatan 3-500 karakter agar hasil konfirmasi lisan dengan siswa dapat direkam.
- Keputusan dicatat dengan waktu, actor, catatan, dan integrity event.
- Kandidat `pending` atau `rejected` tidak dihitung sebagai selesai, nilai akhir, atau rata-rata kelas.

Timestamp perangkat tidak dipakai untuk menentukan apakah jawaban tepat waktu. Deadline, durasi, status penutupan sesi, waktu penerimaan, dan bukti siswa sudah mulai semuanya berasal dari server.

## Penutupan Finding Reviewer

### P1-R01 - waktu perangkat dapat memalsukan deadline

**CLOSED.** DTO submit tidak lagi menerima `queuedAt`. Server menghitung keterlambatan dari `startedAt`, `durationMinutes`, `dueAt`, `completedAt`, status sesi, dan waktu server. Submit terlambat masuk karantina `pending`; tidak auto-grade.

### P1-R02 - UI mengklaim jawaban aman saat penyimpanan lokal gagal

**CLOSED.** Jawaban hanya ditampilkan tersimpan setelah transaksi IndexedDB terenkripsi berhasil. Kegagalan penyimpanan ditampilkan sebagai kegagalan, bukan status aman palsu.

### P1-R03 - revisi sama dapat menghapus antrean submit

**CLOSED.** Pending submit memakai revision dan mutation ID monotonik. Penghapusan hanya berlaku untuk pasangan revision/mutation yang sama sehingga acknowledgement lama tidak dapat menghapus antrean yang lebih baru.

### P1-R04 - logout menyisakan jawaban atau kunci di perangkat bersama

**CLOSED.** Logout menghapus seluruh database assessment yang dikenal dan state privat. Enumeration yang tidak tersedia tidak dianggap sukses; cleanup gagal secara jujur dan logout tidak mengklaim perangkat bersih.

### P2-R05 - retry tidak otomatis setelah 5xx

**CLOSED.** Retry terjadwal memakai bounded backoff, single-flight, dan berjalan tanpa menunggu event `online` baru. Conflict/validation terminal dihentikan dan tidak diputar tanpa batas.

### P2-R06 - integrity signal hilang setelah submit

**CLOSED.** Signal yang belum terkirim disertakan pada transaksi submit. Retry mutation yang sama idempoten; signal yang datang setelah submit disimpan dengan `receivedAfterSubmit=true`.

### P2-R07 - race signal dan submit memberi status menyesatkan

**CLOSED.** Server memberi label berdasarkan urutan penerimaan otoritatif. Dashboard guru membedakan insiden yang diterima setelah submit dan tidak menyatakannya otomatis sebagai kecurangan.

### P1-R08 - koreksi esai melewati keputusan submit terlambat

**CLOSED.** Endpoint koreksi esai menolak respons terlambat berstatus `pending` maupun `rejected`. Sinkronisasi Grade dan analisis hasil juga hanya menerima respons biasa atau respons terlambat yang sudah `accepted`.

### P1-R09 - completion berlomba dengan review/submit

**CLOSED.** `completeSession`, submit siswa, keputusan guru, dan koreksi esai memakai advisory transaction lock yang sama per sesi. Setiap jalur membaca ulang status setelah lock. Jika completion menang lebih dulu, review/koreksi melakukan rekonsiliasi Grade dan outbox dalam transaksi yang sama; jika submit menang lebih dulu, completion melihat skor tersebut. Dua interleaving dibuktikan pada PostgreSQL disposable dengan hasil Grade/outbox tepat satu.

### P2-R10 - lebih dari 100 sinyal memblokir submit

**CLOSED.** Sinyal diurutkan deterministik. Kelebihan di atas batas 100 dikirim satu per satu melalui endpoint idempoten dan hanya dihapus setelah acknowledgement; 100 sinyal terakhir tetap ikut transaksi submit. Kegagalan acknowledgement atau penghapusan menghentikan submit dan mempertahankan jawaban lokal untuk retry.

### P2-R11 - kegagalan baca antrean dianggap kosong

**CLOSED.** Pembacaan dan dekripsi antrean kini menghasilkan outcome eksplisit `ok|unavailable`. Outcome `unavailable` menahan submit, mempertahankan draft, menjadwalkan retry, dan menampilkan peringatan integritas; tidak lagi dapat berubah diam-diam menjadi antrean kosong.

### P1-R12 - kegagalan gabungan draft dan antrean mengunci jawaban semu

**CLOSED.** Kegagalan membaca atau menyiapkan antrean sinyal tetap menahan request submit. Jika draft sudah tersimpan secara durable, antrean submit dipertahankan dan retry otomatis tetap berjalan. Jika draft juga gagal atau stale, UI tidak mengunci jawaban, tidak menyatakan aman, dan tidak membuat pending submit palsu; jawaban tetap dapat diedit di memori tab dengan instruksi eksplisit agar siswa tidak menutup layar dan menekan submit kembali.

### P2-E01 - race proof belum memakai service dan tabel produksi

**CLOSED.** Harness PostgreSQL kini membuat fixture pada 48 migrasi aktual, menginstansiasi `AssessmentService` dan `AcademicPeriodService` aktual, serta memanggil `completeSession`, `reviewLateSubmission`, dan `submitResponse` secara konkuren. Instrumentasi hanya menahan lock pertama untuk membentuk urutan deterministik; advisory lock produksi tetap dijalankan. Kedua interleaving membuktikan tepat satu `academic.grades`, satu outbox `grade.submitted`, dan satu outbox `assessment.completed`. Tidak ada proof table.

### P1-R13 - percobaan baru diproyeksikan sudah terkirim setelah reload

**CLOSED.** Dashboard siswa sekarang menentukan status dari `submittedAt`, bukan dari keberadaan response atau skor. Response yang sudah memiliki `startedAt` tetapi belum memiliki `submittedAt` tetap diproyeksikan sebagai `pending`, sehingga siswa dapat membuka kembali percobaan dan melanjutkan jawaban. Response yang benar-benar sudah dikirim tetap `submitted`, termasuk esai yang belum diberi skor.

### P1-R14 - submit offline tidak dapat dipulihkan setelah sesi diselesaikan guru

**CLOSED.** `startResponse` sekarang lebih dulu memeriksa response milik siswa. Response existing yang sudah dimulai dan belum dikirim dapat dilanjutkan ketika sesi masih `active` maupun sudah `completed`; peserta baru tetap ditolak setelah completion. UI memuat draft lokal berdasarkan response tersebut dan langsung mencoba ulang pending submit yang durable, sehingga jalur server-authoritative late submission tetap tercapai.

### P2-E02 - digest gabungan tidak sesuai algoritme yang dideklarasikan

**CLOSED.** Aggregate manifest dihitung menggunakan urutan byte ASCII case-sensitive yang eksplisit, bukan `Sort-Object` PowerShell yang culture/case-insensitive. Setelah delta R16, seluruh 21 hash individual dan aggregate `3f82e65fe8d59670a87020637c99b40aecde1a28956e55c8a24a86c1c2ed5167` direkonsiliasi ulang dengan algoritme yang sama.

### P1-R15 - start baru dapat lolos bersamaan dengan completion

**CLOSED.** Pembuatan attempt baru sekarang mengambil advisory transaction lock sesi yang sama dengan `completeSession`, membaca ulang status sesi dan response setelah lock, lalu mengambil `startedAt` hanya setelah keputusan start sah. Jika completion menang, status reread adalah `completed` dan tidak ada response baru. Jika start menang, tepat satu response dibuat sebelum completion dan response tersebut tetap dapat di-resume setelah sesi menjadi `completed`. Concurrent start yang kalah memakai response existing di bawah lock, bukan membuat duplikat; response existing hanya dapat diteruskan bila status otoritatif sesi tetap `active` atau `completed`.

### P1-R16 - pembatalan remedial dapat disusul pembuatan response baru

**CLOSED.** `cancelRemedialSession` kini mengambil advisory lock sesi yang sama sebelum lock tahun ajaran. `startResponse` memutuskan resume atau create sepenuhnya di bawah lock tersebut, membaca ulang status sesi, response, serta kelayakan peserta remedial dalam transaksi. Pembuatan response baru hanya diizinkan untuk peserta `assigned`, dan perubahan peserta ke `in_progress` wajib memengaruhi tepat satu row atau seluruh transaksi dibatalkan. Proof PostgreSQL service aktual membuktikan cancel-first menolak start dan menghasilkan nol response; start-first menghasilkan tepat satu response, lalu cancellation menutup sesi dan peserta secara konsisten tanpa deadlock.

## Implementasi Teknis

### Server dan database

- Menambahkan status `pending|accepted|rejected`, jawaban kandidat, revision/mutation ID, waktu submit/review, reviewer, dan catatan review pada `AssessmentResponse`.
- Constraint database menolak nilai status di luar tiga state tersebut; index sesi/status mendukung daftar review guru.
- Submit terlambat, integrity signals, dan event `offline_submit_review_required` disimpan dalam satu transaksi.
- Endpoint review memakai row lock PostgreSQL dan compare-and-set `pending`, sehingga hanya satu keputusan dapat menang.
- Advisory transaction lock per sesi menyerialisasi completion, submit, keputusan terlambat, dan koreksi esai pada batas otoritatif yang sama.
- Penerimaan remedial memperbarui participant; penerimaan sesi reguler yang sudah selesai menyinkronkan nilai melalui jalur existing.
- Dashboard dan SSE menghitung `pending` terpisah dari selesai serta tidak memasukkannya ke rata-rata.

### Pengalaman siswa

- Draft jawaban tetap terenkripsi dan tersimpan lokal saat koneksi lambat atau mati.
- Submit yang belum mendapat acknowledgement tetap ada di antrean dan retry otomatis.
- Setelah server menerima submit terlambat, UI menampilkan `Menunggu keputusan guru` dan draft lokal dihapus karena receipt server sudah ada.
- Jika guru menolak, siswa melihat status keputusan secara jujur; aplikasi tidak mengubahnya menjadi sukses atau nilai.

### Pengalaman guru

- Monitoring menampilkan jumlah kandidat terlambat dan status tiap siswa.
- Tombol **Terima** dan **Tolak** tersedia hanya pada kandidat `pending`.
- Modal keputusan mewajibkan catatan audit sebelum tindakan dikirim.
- Status koneksi, jumlah insiden, insiden terakhir, dan penanda insiden terlambat tetap tersedia sebagai konteks, bukan vonis otomatis.

## Bukti Runtime dan Verifikasi

- Follow-up R16 API unit: 1 suite / 57 test lulus.
- Focused PostgreSQL behavior: 1 suite / 8 test lulus pada 48 migrasi. Enam regresi R15 tetap lulus; dua test baru memanggil `startResponse` dan `cancelRemedialSession` aktual pada tabel produksi untuk urutan cancel-first dan start-first.
- Cancel-first menghasilkan nol response serta status sesi/peserta `cancelled`. Start-first menghasilkan tepat satu response sebelum cancellation, lalu status sesi/peserta akhir tetap `cancelled` tanpa deadlock.
- Rekonsiliasi cleanup disposable: session, response, remedial participant, grade, dan outbox fixture seluruhnya nol; 48 migration tercatat; container dihapus dan residu container nol.
- API type-check: lulus.
- Scoped ESLint pada tepat tiga path follow-up: lulus tanpa error.
- Focused Web tidak dijalankan ulang karena seluruh input Web byte-identik dengan re-review R13/R14 yang lulus `21/21`.
- Full API, Full Web, build, database type-check, Prisma validation, dan pemeriksaan Web **tidak dijalankan ulang** pada follow-up sempit ini. Hasil sebelumnya tetap dicatat sebagai evidence historis, bukan klaim rerun saat ini.
- Diff/whitespace check: lulus.
- Secret scan: tidak menemukan pola credential pada delta.
- Staged files: 0.

## Batas Teknis Jujur

- PWA browser tidak dapat memblokir Alt+F4, Task Manager, aplikasi OS lain, atau perangkat kedua secara mutlak. DIIS mencatat sinyal dan menyajikannya untuk pemeriksaan guru.
- Penguncian OS mutlak memerlukan managed-device kiosk/exam browser, yang bukan scope patch ini.
- Re-review source tetap dibutuhkan karena perubahan menyentuh migrasi, transaksi nilai, race lintas tab, privasi perangkat bersama, dan otoritas guru.
- Belum ada commit, push, PR, staging, installed-PWA QA, atau deployment dalam gate ini.

## Manifest Literal 21 Path

1. `apps/api/src/__tests__/assessment-resilience-postgres.spec.ts`
2. `apps/api/src/__tests__/assessment-u2.spec.ts`
3. `apps/api/src/__tests__/student-dashboard.spec.ts`
4. `apps/api/src/assessment/assessment.controller.ts`
5. `apps/api/src/assessment/assessment.service.ts`
6. `apps/api/src/assessment/dto/assessment.dto.ts`
7. `apps/api/src/student-dashboard/student-dashboard.service.ts`
8. `apps/web/src/__tests__/academic-operational-ui.test.ts`
9. `apps/web/src/__tests__/assessment-offline.test.ts`
10. `apps/web/src/__tests__/pwa-runtime-security.test.ts`
11. `apps/web/src/__tests__/siswa-modul-progress.test.ts`
12. `apps/web/src/app/dashboard/akademik/_components/PenilaianSesiModal.tsx`
13. `apps/web/src/app/dashboard/akademik/_components/siswa/TaskDetailModal.tsx`
14. `apps/web/src/app/dashboard/akademik/_components/siswa/siswa-types.ts`
15. `apps/web/src/app/dashboard/akademik/actions.ts`
16. `apps/web/src/app/dashboard/akademik/page.tsx`
17. `apps/web/src/lib/assessment-offline.ts`
18. `apps/web/src/lib/pwa-logout.ts`
19. `apps/web/src/lib/pwa-preferences.ts`
20. `packages/database/prisma/migrations/20260923000001_assessment_resilience_monitoring/migration.sql`
21. `packages/database/prisma/schema.prisma`

## Gate Berikutnya

Lakukan independent re-review sempit terhadap delta 3 path R16, manifest 21 path, aggregate terbaru, dan evidence JSON ini. Reviewer perlu membuktikan kedua urutan cancel-versus-start pada service/tabel aktual, memastikan cancel-first menghasilkan nol response, start-first paling banyak satu response, status sesi/peserta akhir konsisten, serta regresi R15 tetap lulus. Git packaging, staging, installed-PWA QA, serta deployment tetap **HOLD** sampai review hijau.

Rekomendasi model untuk tindak lanjut
Task berikutnya: Independent Reviewer memeriksa exact 3-path delta R16 dan proof PostgreSQL dua urutan dalam manifest 21 path; Git packaging dan staging tetap HOLD.
Model / effort: GPT-5.6 Sol (`gpt-5.6-sol`) / xhigh.
Alasan: perubahan menyentuh serialisasi transaksi pada batas otoritatif start/cancel remedial setelah finding race berulang, dengan proof service aktual yang kini tersedia.
Syarat kualitas: cancel-first nol response; start-first paling banyak satu response dengan sesi/peserta akhir konsisten, tanpa deadlock atau duplicate attempt; regresi R15 tetap lulus.
Eskalasi bila: re-review menemukan lock ordering baru, deadlock, atau perbedaan antara proof dan service produksi -> GPT-6 Astra / high.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
