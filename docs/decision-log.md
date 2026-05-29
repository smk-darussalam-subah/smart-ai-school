# Decision Log — DIIS Smart AI School

> Catatan keputusan arsitektur dan teknis yang dibuat selama development.
> Format: Tanggal | Keputusan | Konteks | Lesson Learned

---

## 2026-05-29 — React version deduplikasi via npm overrides

**Keputusan:** Paksa single React version di seluruh monorepo via `overrides` di root `package.json`.

```json
"overrides": {
  "react": "^19.1.0",
  "react-dom": "^19.1.0"
}
```

**Konteks:** `next build` gagal dengan React error #31 ("Objects are not valid as a React child — object with keys {$$typeof, type, key, ref, props}") saat prerender `/404`. Root cause: npm workspaces meng-install React 18.3.1 di root `node_modules/` (untuk memenuhi peer-deps `next-auth` v4) sementara `apps/web` meng-install React 19.2.6 di `apps/web/node_modules/`. Saat Next.js prerender worker berjalan, ia resolve React dari root (v18) sementara component bundle pakai React 19 — element shape mismatch → error #31.

**Lesson learned:** Monorepo npm workspaces bisa install versi package berbeda di tiap workspace jika tidak ada constraint eksplisit. Selalu verifikasi dengan `npm ls react` saat ada React-related build error. `/_error: /404` dalam error log adalah red herring — Next.js selalu fallback ke `/_error` worker saat ada prerender failure, bahkan di pure App Router.

---

## 2026-05-29 — SessionProvider dipindah dari root layout ke DashboardProviders

**Keputusan:** `NextAuthSessionProvider` tidak dipasang di root layout, melainkan hanya di `DashboardProviders.tsx` yang di-mount di `dashboard/layout.tsx`.

**Konteks:** Halaman publik (`/`, `/login`, `/404`) tidak membutuhkan SessionProvider. Memasang SessionProvider di root layout menambah `'use client'` boundary yang tidak perlu, mencegah halaman publik untuk di-static-generate dengan zero client JS.

**Lesson learned:** `SessionProvider` sebaiknya di-scope ke area yang membutuhkannya, bukan dipasang global di root layout. Ini juga memungkinkan `getServerSession()` di `dashboard/layout.tsx` untuk pass session sebagai prop ke `DashboardProviders` — menghindari waterfall dan loading flash di dashboard.

---

## 2026-05-28 — Auth Rate Limit pada auth endpoints

**Keputusan:** `@Throttle({ default: { ttl: 60_000, limit: 15 } })` wajib di auth endpoints.

**Konteks:** Default global throttle (100 req/menit) terlalu longgar untuk auth endpoints. Auth dibatasi 15 req/menit per IP untuk mencegah credential stuffing. (SMA-16, 2026-05-28)

---

## 2026-05-28 — Security Headers via Fastify onSend hook

**Keputusan:** Security headers di-set via Fastify `addHook('onSend')`, bukan Express helmet sebagai Fastify plugin.

**Konteks:** Express helmet tidak kompatibel langsung sebagai Fastify plugin. Header di-set via `addHook('onSend')` — fungsional equivalent, tested runtime. (SMA-16, 2026-05-28)

---

## 2026-05-26 — APP_GUARD global dengan opt-out @Public()

**Keputusan:** KeycloakGuard dipasang sebagai APP_GUARD global; endpoint yang tidak butuh auth diberi decorator `@Public()`.

**Konteks:** Security by default — endpoint baru protected tanpa perlu dekorasi eksplisit. Mencegah T-02 terulang. (SMA-23, 2026-05-26)

---

## 2026-05-26 — Zod sebagai validation library (bukan class-validator)

**Keputusan:** Zod digunakan untuk semua validasi DTO, bukan class-validator.

**Konteks:** Runtime type safety, shareable dengan frontend, compatible dengan TypeScript strict mode. (Section 10 CLAUDE.md)

---

*Dikelola oleh Cowork AI. Update setiap ada keputusan arsitektur baru.*
