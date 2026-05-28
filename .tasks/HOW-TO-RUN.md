# Cara Menjalankan Claude Code — Panduan Kang Sholah

## Rutinitas Harian (30 detik)

```powershell
# 1. Buka PowerShell, masuk ke project
cd C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school

# 2. Jalankan Claude Code
claude

# 3. Paste prompt ini (sudah cukup, tidak perlu tambahan apapun):
```

```
Baca CLAUDE.md dan .tasks/current.md, lalu kerjakan task yang ada.
Jangan tanya konfirmasi untuk operasi file dan TypeScript.
Tanya konfirmasi hanya untuk: perubahan docker-compose, git push, atau hapus file.
Laporkan hasilnya di akhir session.
```

---

## Kapan Kang Perlu Approve

Claude Code akan tanya izin untuk:
- ✅ Perubahan `docker-compose.yml`
- ✅ `git push` atau `git commit`
- ✅ Hapus file permanen
- ✅ Install dependency baru

Untuk hal lain (buat file, edit kode, type-check, test) — **Claude Code jalan sendiri.**

---

## Laporan Hasil

Setelah Claude Code selesai, copy hasil laporannya dan kirim ke Cowork (chat ini).
Cowork akan update Linear, siapkan task berikutnya, dan update `.tasks/current.md`.

---

## Jika Ada Error / Blocked

Kirim pesan ke Cowork: *"Claude Code blocked di [task], errornya: [paste error]"*
Cowork akan analisis dan berikan instruksi fix.
