# N-15 — start.sh: fail-hard tanpa auto-baseline — DONE

**Status:** ✅ CLOSED (smoke-test closed 2026-06-04)  
**Tanggal:** 2026-06-02 | **Smoke-test hardening:** 2026-06-04  
**Branch:** `fix/N15-startsh-no-autobaseline`  
**Commit:** (lihat git log)  
**Model:** Sonnet 4.6

---

## Ringkasan

Cabang auto-baseline di `apps/api/start.sh` (baris 16–30 lama) dihapus seluruhnya.
Loop `for m in prisma/migrations/*/; do prisma migrate resolve --applied ...` — yang menjadi
akar masalah N-14 — tidak ada lagi di script.

### Perubahan

**Sebelum (berbahaya):**
```sh
if ! $PRISMA migrate deploy; then
  # ... auto-baseline semua migration tanpa jalankan SQL ...
  for m in prisma/migrations/*/; do
    $PRISMA migrate resolve --applied "$name" 2>/dev/null || true
  done
  $PRISMA migrate deploy   # selalu hijau → tabel tak pernah dibuat
fi
```

**Sesudah (aman):**
```sh
if ! $PRISMA migrate deploy; then
  echo "❌ migrate deploy GAGAL — JANGAN auto-baseline ..."
  echo "   Periksa manual: P3005 (DB bersama)? ..."
  exit 1
fi
```

### Skenario

**Sukses (normal):** `migrate deploy` jalan tanpa error → server start via `exec node dist/main.js`.

**Gagal (P3005 / conflict / apapun):** `migrate deploy` exit non-zero → script cetak pesan jelas dengan
petunjuk pemulihan (lihat INCIDENT-N14) → `exit 1` → container restart/CrashLoopBackOff → **alarm visible**,
tidak ada jalur baseline otomatis.

### Bukti POSIX sh

```
sh -n apps/api/start.sh
SYNTAX OK
```

Script menggunakan `#!/bin/sh`, `set -e`, `if ! cmd; then ... exit 1; fi` — semua POSIX kompatibel,
tanpa bash-isms.

### Smoke-test domain schema (CLOSED 2026-06-04)

Smoke-test `SELECT 1 FROM auth.users LIMIT 1` diimplementasikan via `prisma db execute --stdin`
(psql tidak ada di Alpine). Blok berjalan SETELAH `migrate deploy` sukses, SEBELUM `exec node`.

Skenario gagal: tabel `auth.users` tidak ada → non-zero exit → `if !` trap →
cetak pesan jelas rujuk INCIDENT-N14 → `exit 1` → container crash (visible alarm).
`set -e` dipertahankan; `if ! cmd` adalah cara POSIX-safe mencegah `set -e` memotong
sebelum error message tercetak.

**Invocation final:**
```sh
echo "SELECT 1 FROM auth.users LIMIT 1;" | $PRISMA db execute --stdin --schema=prisma/schema.prisma > /dev/null 2>&1
```

**DoD terpenuhi:**
- [x] `migrate deploy` gagal → exit 1 (dari sesi N-15 awal)
- [x] Tabel domain tidak ada → exit 1 (smoke-test, sesi ini)

---

## Lessons reinforced

- Auto-baseline pada P3005 = anti-pattern di shared DB — deployment harus gagal nyaring.
- "Deploy hijau" bukan bukti skema terbentuk; container yang crash lebih aman dari container
  yang berjalan dengan skema tidak lengkap.
