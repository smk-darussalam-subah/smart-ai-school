# Compliance Gate — DIIS Tahap 1

> **Tujuan:** Memastikan sistem DIIS memenuhi kewajiban regulasi dan hukum sebelum memulai Tahap 2 (Core Build / Go-Live terbatas). Semua 4 kriteria harus lulus sebelum data pengguna nyata (siswa, orang tua, guru) dimasukkan ke sistem produksi.
>
> **Sumber:** Laporan System Analyst DIIS, Bab 7 & Bab 8 (R-01, R-02, R-03) | Tanggal: 2026-05-26
> **Deadline:** Sebelum mulai Tahap 2 (target: Desember 2026)
> **Referensi hukum:** UU PDP No.27/2022, UU ITE, Permendikbud terkait data siswa

---

## Kriteria Kelulusan

### ✅ / ❌ Kriteria 1 — DPIA (Data Protection Impact Assessment) Selesai (R-01)
**Pernyataan:** Dokumen DPIA telah dibuat yang menilai risiko pemrosesan data pribadi siswa, guru, dan orang tua sesuai UU PDP No.27/2022. Dokumen mencakup identifikasi data sensitif, tujuan pemrosesan, dasar hukum, dan mitigasi risiko.

**Bukti yang harus dilampirkan:**
- [ ] File `docs/compliance/dpia-2026.md` atau `.docx` sudah ada dan diisi lengkap
- [ ] DPIA telah di-review oleh minimal satu pihak kompeten (bisa konsultan hukum atau Dinas Pendidikan)
- [ ] Identifikasi data kategori khusus: tidak ada data medis/biometrik siswa yang disimpan tanpa persetujuan eksplisit

**Status saat ini:** ❌ OPEN — masuk roadmap Tahap 1
**Diverifikasi oleh:** —
**Tanggal verifikasi:** —

---

### ✅ / ❌ Kriteria 2 — Consent Flow Terimplementasi (R-01, R-02)
**Pernyataan:** Terdapat mekanisme persetujuan (consent) yang jelas untuk:
- Siswa (atau wali jika di bawah umur) menyetujui penggunaan data mereka
- Penggunaan AI generatif dengan disclaimer risiko misinformasi

**Bukti yang harus dilampirkan:**
- [ ] Halaman consent/privacy di `apps/web` sudah ada dan tampil sebelum user bisa menggunakan fitur utama
- [ ] Consent tersimpan di database dengan timestamp dan versi policy
- [ ] Fitur AI untuk siswa memiliki disclaimer: "Output AI bisa salah. Verifikasi dengan guru/sumber resmi."

**Status saat ini:** ❌ OPEN — masuk roadmap Tahap 1-2
**Diverifikasi oleh:** —
**Tanggal verifikasi:** —

---

### ✅ / ❌ Kriteria 3 — Anonimisasi Data Embedding (R-03)
**Pernyataan:** Data embedding siswa yang disimpan di pgvector telah dianonimisasi atau dipseudonymisasi — tidak ada nama, NIS, atau identifier langsung yang disimpan bersama vector embedding.

**Bukti yang harus dilampirkan:**
- [ ] Schema `ai_knowledge.documents` tidak menyimpan PII bersama embedding (atau jika ada, terenkripsi)
- [ ] Dokumen `docs/compliance/embedding-data-policy.md` menjelaskan pendekatan anonimisasi
- [ ] Query ke pgvector tidak bisa secara langsung mengembalikan identitas siswa tanpa join ke tabel terproteksi

**Status saat ini:** ❌ OPEN — akan diimplementasi saat fitur AI siswa dibangun (Tahap 2)
**Diverifikasi oleh:** —
**Tanggal verifikasi:** —

---

### ✅ / ❌ Kriteria 4 — Kebijakan Privasi & Syarat Penggunaan Dipublikasikan (R-01)
**Pernyataan:** Kebijakan Privasi dan Syarat Penggunaan sistem DIIS telah dipublikasikan dan dapat diakses pengguna sebelum mendaftar/login. Dokumen mencantumkan: data apa yang dikumpulkan, bagaimana digunakan, hak pengguna, dan cara menghapus data.

**Bukti yang harus dilampirkan:**
- [ ] URL `https://diis.smkdarussalamsubah.sch.id/privacy` dapat diakses dan berisi kebijakan yang valid
- [ ] URL `https://diis.smkdarussalamsubah.sch.id/terms` dapat diakses
- [ ] Kebijakan mencantumkan nama pengelola data (SMK Darussalam Subah) dan kontak DPO (Data Protection Officer) jika ada

**Status saat ini:** ❌ OPEN — masuk roadmap Tahap 1
**Diverifikasi oleh:** —
**Tanggal verifikasi:** —

---

## Sign-Off

Gate ini dinyatakan **LULUS** apabila semua 4 kriteria di atas berstatus ✅ dan bukti terlampir.

| | |
|---|---|
| **Director** | Kang Sholah (Ahmad Sholahuddin) |
| **Tanggal Sign-Off** | _(diisi saat lulus)_ |
| **Catatan** | _(diisi saat lulus)_ |
| **Berlaku untuk** | Izin mulai Tahap 2 — Core Build / Go-Live terbatas |

---

*File ini dikelola oleh Cowork AI. Update status setiap kali temuan di-close.*
*Terakhir diupdate: 2026-05-26*
