# Aktivasi draft dan impor Smart Scheduling

API menerima dua pengaturan runtime dari service `api` di Compose dasar. Compose
staging mewarisi pemetaan yang sama; tidak perlu menyalin pemetaan ke override
staging atau menambah file Compose ad hoc.

| Pengaturan | Fungsi | Default |
|---|---|---|
| `SMART_SCHEDULER_ENABLED` | Fondasi draft | `false` |
| `SMART_SCHEDULER_IMPORT_ENABLED` | Impor CSV/XLSX ke draft | `false` |

Hanya string persis `true` yang mengaktifkan fitur. Nilai hilang/kosong memakai
default `false`; nilai lain tidak melewati policy API. Impor membutuhkan **kedua**
pengaturan `true`. Aktivasi bukan pengganti permission, ownership, revision,
idempotency, atau validasi data. Tidak mengaktifkan solver, worker, atau publish.

## Environment terpisah, konfigurasi bertahan

Jalur standar `compose-application.sh` memilih file berikut, relatif terhadap
`infrastructure/docker/` pada checkout lingkungan yang bersangkutan:

- `staging`: `.env.staging`, project `smk-staging`, Compose dasar + staging.
- `main`: `.env`, Compose dasar. Aktivasi staging tidak mengubah file production.

Setelah memperoleh izin aktivasi **untuk lingkungan tersebut**, operator menyimpan
dua baris berikut di file environment yang dipilih, bukan hanya di shell atau
runtime override:

```dotenv
SMART_SCHEDULER_ENABLED=true
SMART_SCHEDULER_IMPORT_ENABLED=true
```

Workflow standar memperbarui key koneksi/VAPID yang ditentukan secara terarah;
tidak membuat ulang file environment atau menimpa dua pengaturan ini. Dengan
pemetaan Compose yang sudah tersedia, nilai tersimpan terbawa ke konfigurasi API
pada deployment berikutnya. Perubahan file tidak mengubah container berjalan:
recreate API/deployment tetap memerlukan izin runtime dan exact candidate.

Jangan commit file `.env`/`.env.staging` atau menyalin konfigurasi staging ke
production. Compose memberikan prioritas pada variabel shell; hindari export
global dua flag saat menjalankan operasi untuk lingkungan berbeda. Periksa dua
nilai efektif saja; jangan mempublikasikan hasil Compose config lengkap yang
dapat memuat rahasia.

## QA dan handoff dari mitigasi PR #712

Tes `apps/api/src/__tests__/scheduling-feature-flags-deploy.spec.ts` menjalankan
Compose `config` asli dengan environment sintetis. Tidak ada build/up/run,
container baru, akses staging/production, atau pembacaan env operasional.

Sebelum menutup runtime finding P2-SCH-DEPLOY-F01:

1. Review dan rilis kandidat source yang memuat pemetaan ini sesuai gate DIIS.
2. Simpan aktivasi yang sudah disetujui pada `.env.staging` milik host staging.
3. Gunakan **jalur deploy standar tanpa override** pada exact kandidat yang
   disetujui; verifikasi API menerima dua nilai `true` dan target DB tetap staging.
4. Uji ulang terarah draft/impor, provenance/idempotency dan zero-write jadwal aktif.
5. Setelah jalur standar terbukti, runtime override
   `/opt/diis-staging/runtime/pr712-smart-scheduler.yml` dapat dihentikan/dihapus
   dalam cleanup yang diotorisasi. Jangan menghapusnya sebelum sumber aktivasi
   pengganti dan rollout standar telah terbukti.

Untuk menonaktifkan, simpan `false` lalu jalankan recreate/deploy yang diotorisasi.
Draft/history tidak dihapus. Source fix atau hasil config lokal tidak membuktikan
redeploy staging sudah dilakukan dan tidak memberi izin promosi production.
