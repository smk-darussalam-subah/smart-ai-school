# VISI MODUL MASA DEPAN — DIIS Smart AI School
> SMK Darussalam Subah · jurusan: **TKRO, TBSM, TJKT, AKL**
> Disusun: 2026-06-14 · status: visi/rujukan roadmap (belum task)
> Prinsip: bangun di atas fondasi yang sudah ada (Ollama, RAG, AI Gateway, Claude adapter, WA+BullMQ, Metabase, permission-based RBAC).

---

## 0. North Star

> **"Setiap siswa lulus membawa Paspor Kompetensi digital yang terverifikasi, terus-bertumbuh, dan langsung terbaca industri."**

DIIS bukan sekadar SIM sekolah (administrasi), tapi **mesin pertumbuhan kompetensi** yang menghubungkan: pembelajaran → bukti → pengakuan → peluang kerja. AI bukan fitur tempelan, tapi lapisan di seluruh alur.

Urutan strategis (tema, bukan jadwal kaku):
1. **Fondasi data & orang** (sekarang) — pengguna, kepegawaian, struktur organisasi, akademik.
2. **Tulang punggung kompetensi** — LMS + Skill Badge + e-Portfolio (Paspor Kompetensi).
3. **Lapisan AI** — tutor, penilai, co-pilot guru, early-warning.
4. **Jembatan DUDI** — PKL digital, TeFa, UKK/sertifikasi, BKK & tracer study.
5. **Frontier** — kredensial portabel (Open Badges/VC), talent marketplace, AR/VR praktik.

---

## 1. ⭐ FLAGSHIP — Paspor Kompetensi Digital (ide inti Kang, diperluas)

Spine yang menyatukan LMS → badge → CV/portofolio → medsos/LinkedIn → BKK/industri.

### 1.1 LMS Kompetensi & Gamifikasi
- **Checkpoint = capaian pembelajaran** yang ditarik dari **silabus/RPP/penugasan mapel** (bukan checkpoint sembarang). Tiap modul/KD punya kriteria tuntas.
- **Gamifikasi bermakna:** XP, level, streak belajar, *quest* proyek, leaderboard kelas/jurusan. Hindari gamifikasi kosong — XP harus terikat ke kompetensi nyata.
- **Bukti (evidence)-based:** checkpoint tuntas butuh bukti — penyelesaian tugas, hasil praktik/jobsheet, foto/video proyek, nilai asesmen.

### 1.2 Skill Badge ter-verifikasi
- Tiap kompetensi tuntas → **skill badge** (micro-credential).
- **Standar Open Badges 3.0 / Verifiable Credentials** → badge **portabel & bisa diverifikasi pihak luar** (anti-palsu, tetap valid walau lepas dari sekolah). Ini pembeda besar vs LMS biasa.
- Pemetaan opsional ke **SKKNI/KKNI** → badge selaras jenjang kualifikasi nasional yang diakui industri.

### 1.3 e-Portfolio / CV otomatis (= "profil siswa")
- CV **membangun dirinya sendiri**: tiap badge & bukti otomatis masuk ke profil. Tidak perlu siswa menyusun manual.
- Bagian: identitas, ringkasan AI, skill+level, proyek unggulan (galeri), riwayat PKL, sertifikat UKK/LSP, prestasi.
- **Tautan publik** (mis. `diis.sch.id/p/nama-siswa`) — siap dibagikan ke industri/kampus.

### 1.4 Integrasi LinkedIn & medsos
- Tombol **"Tambahkan ke LinkedIn"** (LinkedIn Add-to-Profile untuk sertifikasi) + share badge ke IG/TikTok/WA.
- Setiap share membawa **back-link terverifikasi** ke portofolio DIIS → personal branding siswa sejak SMK.

### 1.5 Social Learning (pembelajaran berbasis medsos)
- **Micro-content per jurusan** (reels jobsheet, tips otomotif/jaringan/akuntansi) didistribusikan via medsos sekolah, tiap konten **deep-link balik ke modul LMS** terkait.
- Siswa "belajar dari beranda medsos" → masuk LMS → checkpoint. Menjembatani kebiasaan medsos dengan pembelajaran formal.
- Konten bisa **dikurasi/di-generate AI** dari knowledge jurusan (memakai RAG yang sudah ada).

> **Catatan teknis:** modul KBM Tahap 2 (`class_sessions`, `bell_times`, dll — sudah dicadangkan di schema) adalah prasyarat data eksekusi. Paspor Kompetensi tumbuh di atasnya.

---

## 2. Lapisan AI-Native (manfaatkan Ollama + RAG + Claude yang sudah terpasang)

| Modul | Apa | Kenapa penting |
|---|---|---|
| **AI Tutor jurusan** | Asisten belajar 24/7 berbasis RAG atas silabus + jobsheet + knowledge jurusan; gaya Socratic (memandu, bukan kasih jawaban) | Pemerataan: siswa dapat "guru privat" kapan saja; kurangi beban guru untuk pertanyaan berulang |
| **AI penilai praktik/proyek** | Skoring berbasis rubrik + umpan balik personal untuk tugas/jobsheet/proyek | Konsistensi penilaian + feedback cepat mempercepat penguasaan |
| **AI co-pilot guru** | Bantu susun modul ajar/RPP, bank soal, analisis butir soal, rapor naratif | Hemat waktu guru → fokus mendampingi siswa (RPP pipeline sudah ada, tinggal diperdalam) |
| **AI early-warning** | Deteksi dini siswa berisiko (DO/akademik/kehadiran turun) dari pola data | Intervensi BK/Kesiswaan sebelum terlambat |
| **AI career advisor** | Cocokkan skill siswa ↔ peluang DUDI/jalur lanjut; sarankan learning path | Menghubungkan portofolio dengan masa depan nyata |

---

## 3. Vokasi & DUDI (pembeda khas SMK)

| Modul | Apa | Catatan |
|---|---|---|
| **PKL/Prakerin digital** | End-to-end: penempatan/matching, **logbook mobile**, monitoring 2 pembimbing (sekolah + industri), asesmen → feed portofolio | Menautkan langsung ke role INDUSTRI yang sudah ada |
| **Teaching Factory (TeFa)** | Unit produksi siswa: servis TKRO/TBSM, jasa TJKT, praktik AKL — mini-ERP order/job/income | Pembelajaran berbasis produksi nyata + potensi pendapatan sekolah |
| **Uji Kompetensi (UKK/LSP-BNSP)** | Jadwal, asesor, penilaian, penerbitan sertifikat → otomatis masuk portofolio | Sertifikasi = nilai jual lulusan SMK |
| **DUDI CRM + MoU** | Basis data mitra industri, perjanjian, kuota PKL/rekrutmen | Fondasi Hubin (di bawah Humas) |
| **BKK Job Board** | Lowongan dari DUDI ↔ talenta lulusan terverifikasi (modul `lowongan` sudah ada sebagai benih) | BKK naik kelas jadi talent marketplace |
| **Tracer Study alumni** | Lacak keterserapan lulusan (kerja/wirausaha/kuliah) | **Wajib** untuk akreditasi & pelaporan; data berharga utk evaluasi |

---

## 4. Orang Tua & Komunitas

- **Super-app orang tua:** kehadiran/nilai/SPP/perilaku realtime, **rapor naratif AI**, **ucapan ulang tahun otomatis** (ide Kang — pakai `birthDate`), RSVP acara, izin online.
- **WA conversational bot:** tanya-jawab ortu via AI (sudah ada WA notif + BullMQ) — "nilai anak saya?", "tagihan SPP?".
- **Kanal prestasi:** orang tua melihat & ikut membagikan pencapaian anak.

---

## 5. Operasional & Tata Kelola

| Modul | Apa | Untuk |
|---|---|---|
| **Sarpras & inventaris** | Aset bengkel/lab, jadwal maintenance, peminjaman alat/ruang | Wakasek Sarpras |
| **Keuangan lanjutan** | SPP online (payment gateway), pelaporan BOS, beasiswa, koperasi | Bendahara/TU |
| **Sinkron Dapodik** | Kurangi entri ganda; ekspor/sinkron data resmi | Operator Dapodik |
| **Kurikulum Merdeka / P5** | Pelacakan projek penguatan profil pelajar Pancasila | Kebutuhan kurikulum nasional |
| **SPMI / Akreditasi** | Bukti mutu terkumpul otomatis dari sistem → dashboard kesiapan akreditasi | KS & tim mutu |
| **Analitik eksekutif prediktif** | Tren + prediksi (sudah ada Metabase) + insight AI | KS/Yayasan |

---

## 6. Frontier (pembeda jangka panjang)

- **Kredensial portabel (Open Badges 3.0 / Verifiable Credentials)** — kompetensi lulusan diverifikasi siapa pun tanpa hubungi sekolah.
- **Talent marketplace** — industri menelusuri lulusan berdasar skill terverifikasi; BKK jadi pasar talenta.
- **AR/VR simulasi praktik** — latihan otomotif/jaringan yang aman & murah sebelum alat nyata.
- **Pembelajaran adaptif** — jalur belajar menyesuaikan kecepatan & gaya tiap siswa (didukung data LMS).
- **Lifelong learning & alumni** — alumni tetap update skill + jejaring; sekolah jadi simpul karier seumur hidup.

---

## 7. Mengapa urutan ini

1. **Data dulu** — Paspor Kompetensi tak berguna tanpa data orang, akademik, dan eksekusi KBM yang rapi. (Sedang dikerjakan: pengguna/kepegawaian/struktur organisasi.)
2. **Tulang punggung kompetensi sebelum AI canggih** — AI butuh konten/kompetensi terstruktur sebagai bahan bakar.
3. **DUDI mengikuti portofolio** — portofolio terverifikasi membuat PKL/BKK/tracer jauh lebih bernilai.
4. **Frontier paling akhir** — standar portabel & marketplace baru bermakna setelah volume data & badge memadai.

---

*Dokumen visi — untuk diskusi & persetujuan Kang Sholah. Setiap modul akan dipecah jadi sprint tersendiri saat tiba waktunya, dengan pola konsep → mockup → approval.*
