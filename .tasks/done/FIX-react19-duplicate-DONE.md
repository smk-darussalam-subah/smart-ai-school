# DONE — Fix React error #31 saat `next build` (duplikasi React 18 vs 19)

**Selesai oleh:** Claude Code
**Tanggal:** 2026-05-29
**Skema:** Bugfix build infrastruktur
**Scope:** `apps/web` build pipeline + root workspace dependency resolution

---

## Ringkasan

`npx next build` di `apps/web` gagal dengan React error #31
("Objects are not valid as a React child — object with keys
{$$typeof, type, key, ref, props}") saat prerender `/404`.

Root cause: dua copy React di-install paralel di monorepo.

- `apps/web/node_modules/react@19.2.6` (versi yang diminta `apps/web/package.json`)
- `node_modules/react@18.3.1` (versi hoisted ke root untuk memenuhi peer-deps
  `react-dom@18.3.1` yang ter-pin oleh next-auth 4 / next 15 peer-deps yang
  menerima `^17.0.2 || ^18 || ^19`)

Selama build, `next` (yang berada di root `node_modules/next`) resolve
React dari root → React 18, sementara komponen `apps/web` di-bundle pakai
React 19. Dua copy berbeda di proses yang sama → element shape tidak dikenali
satu sama lain → React 19 melihat element React 18 sebagai "POJO dengan keys
$$typeof, type, key, ref, props" dan coba render sebagai text node → error #31.

---

## Fix

### 1. `package.json` (root) — tambah `overrides`

```json
{
  "overrides": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  }
}
```

Memaksa `react` dan `react-dom` resolve ke single version (^19.1.0) di
seluruh workspace, termasuk peer-deps auto-install di root.

### 2. Reinstall

```powershell
cd C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school
Remove-Item -Recurse -Force node_modules\react,node_modules\react-dom,node_modules\scheduler
Remove-Item package-lock.json
npm install
```

Hasil: hanya **satu** React 19.2.6 ter-install di `node_modules/react`
(root). `apps/web/node_modules/react` hilang (tidak dibutuhkan — root sudah
sesuai). Dependency `next` dan `next-auth` keduanya resolve ke React 19
yang sama.

### 3. Comment cleanup

Update komentar di 5 file yang sebelumnya mengkambinghitamkan
"next-auth v4 + React 19 incompatibility" — penyebab sebenarnya adalah
duplikasi React, bukan next-auth. Arsitektur per-segment SessionProvider
(via `DashboardProviders.tsx`) tetap dipertahankan karena tetap valid
untuk alasan berbeda: meminimalkan client JS di halaman publik.

File ter-update:
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/not-found.tsx`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/dashboard/layout.tsx`
- `apps/web/src/components/providers/Providers.tsx`

### 4. `CLAUDE.md` Section 10

Tambah keputusan arsitektur baru: "React Version Pinning via
`overrides` di root `package.json`" — supaya regression ini tidak terulang.

---

## Bukti Runtime

### Build sukses — `npx next build` di `apps/web`

```
   ▲ Next.js 15.5.18
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully in 7.8s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/7) ...
   Generating static pages (1/7)
   Generating static pages (3/7)
   Generating static pages (5/7)
 ✓ Generating static pages (7/7)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ○ /                                      133 B         103 kB
├ ○ /_not-found                            133 B         103 kB
├ ƒ /api/auth/[...nextauth]                133 B         103 kB
├ ƒ /dashboard                             133 B         103 kB
├ ○ /health                              1.02 kB         104 kB
└ ○ /login                                 934 B         112 kB
+ First Load JS shared by all             103 kB

ƒ Middleware                             55.7 kB
```

### TypeScript check — `npx tsc --noEmit` di `apps/web`

```
(0 errors, no output)
```

### Resolusi React — verifikasi single version

```bash
$ node -e "console.log(require.resolve('react', { paths: ['./node_modules/next'] }))"
C:\Users\USER\...\smart-ai-school\node_modules\react\index.js

$ cat node_modules/react/package.json | grep version
  "version": "19.2.6",

$ ls apps/web/node_modules/react
ls: cannot access — tidak ada (sudah di-dedupe ke root)
```

---

## Diagnosis Methodology

Untuk arsip — proses isolasi root cause:

1. Reproduksi error dengan build mentah — fail di `/404`
2. Stripping `not-found.tsx` ke "hello world" — masih fail
3. Stripping `layout.tsx` ke minimal Server Component — masih fail
4. Stripping semua page + remove middleware + remove `[...nextauth]` route — masih fail
5. Karena error muncul dengan "hello world" Server Components, problem
   bukan di user code → cek `node_modules`
6. `find node_modules -name "package.json" -path "*/react/*"` → 2 copies React
7. Lockfile inspection: `node_modules/react@18.3.1` peer-installed untuk
   memenuhi `react-dom@18.3.1` peer pin
8. Fix: `overrides` + fresh install

Indikasi error message yang mengarah ke duplikasi React:

> `object with keys {$$typeof, type, key, ref, props}`

Format ini adalah React 18 element shape (key + ref di element).
React 19 mengubah ini — key sekarang di props, ref tidak ada di element
runtime (hanya di JSX). Ketika React 19 renderer menerima React 18 element,
ia tidak mengenalinya sebagai element valid dan mencoba render sebagai text.

---

## Yang Perlu Perhatian Kang

- **Lockfile dihapus dan di-regenerasi.** `package-lock.json` baru sudah
  commit-ready. Tidak ada perubahan versi semantik selain pruning React 18.
- **Tidak ada dependency baru.** `overrides` adalah constraint, bukan deps.
- **Arsitektur SessionProvider per-segment dipertahankan** — masih jadi best
  practice (less client JS di halaman publik), meski alasan asli (workaround
  error #31) tidak lagi valid.
- **Verifikasi runtime di environment Docker/CI direkomendasikan** sebelum
  push ke staging — karena hoisting npm bisa berperilaku berbeda di environment
  yang berbeda. `overrides` di root harus menjamin konsistensi, tapi sanity
  check di CI bagus.
