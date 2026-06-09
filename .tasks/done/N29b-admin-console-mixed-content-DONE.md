# N-29b Done Report — Admin Console Mixed Content Fix

**Ticket:** N-29b (FASE 4 — diagnosis admin console "muter")
**Branch:** `feat/N-29b-admin-console-mixed-content-fix` → PR #80 → develop
**PR:** https://github.com/smk-darussalam-subah/smart-ai-school/pull/80
**Tanggal:** 2026-06-09
**Executor:** Claude Code (Sonnet 4.6)
**Status:** ✅ CLOSED-prod — VPS hotfix + PR #80 opened

---

## Gejala

Admin console Keycloak (`https://auth.smkdarussalamsubah.sch.id/admin/`) tampil
spinner tanpa henti setelah halaman SPA selesai diload. Disebut "muter" oleh Director.
Tidak ada browser login yang berhasil ke admin console.

---

## Root Cause

`KC_HOSTNAME_STRICT_HTTPS: "false"` di `docker-compose.yml` membuat Keycloak 24.0
menambahkan URL HTTP (`http://auth.smkdarussalamsubah.sch.id`) ke CSP `frame-src`:

```
# Sebelum fix — dari loopback internal:
Content-Security-Policy: frame-src 'self' http://auth.smkdarussalamsubah.sch.id; ...
```

Admin console SPA (keycloak.js) memuat `login-status-iframe.html` menggunakan URL
`http://` (bukan `https://`). Browser memblokir iframe HTTP ini sebagai **Mixed Content**
pada halaman HTTPS. Akibatnya:

1. `login-status-iframe.html` tidak pernah load
2. `keycloak.js` `check-sso` tidak mendapat balasan postMessage dari iframe
3. SPA menunggu selamanya → **spinner tanpa henti**

**Salah kaprah di N-23b:** `KC_HOSTNAME_STRICT_HTTPS` salah diartikan sebagai
"apakah Keycloak listen HTTP internal". Padahal `KC_HTTP_ENABLED: "true"` yang
mengontrol listening port HTTP. `KC_HOSTNAME_STRICT_HTTPS` hanya mengontrol apakah
Keycloak memaksa URL browser-facing (CSP, redirect, dsb) menggunakan skema HTTPS.

---

## Bukti (Evidence)

### Header internal (bypass Cloudflare) — SEBELUM fix
```
Content-Security-Policy: frame-src 'self' http://auth.smkdarussalamsubah.sch.id; frame-ancestors 'self'; object-src 'none';
```

### Header internal — SETELAH fix
```
Content-Security-Policy: frame-src 'self' https://auth.smkdarussalamsubah.sch.id; frame-ancestors 'self'; object-src 'none';
```

### Header external via Cloudflare — SETELAH fix
```
content-security-policy: frame-src 'self'; frame-ancestors 'self'; object-src 'none';
```
*(Cloudflare mengkolaps `https://auth.*` menjadi `'self'` — tidak masalah, keduanya HTTPS)*

---

## Perubahan

### `infrastructure/docker/docker-compose.yml`

```diff
- # strict-https=false: KC listen HTTP internal; TLS diterminasi nginx/Cloudflare.
- KC_HOSTNAME_STRICT_HTTPS: "false"
+ # N-29b: strict-https=true — paksa KC generate https:// untuk semua front-channel URL
+ # (CSP frame-src, login-status-iframe, dll). Tanpa ini KC menambah http:// ke
+ # frame-src → browser blokir iframe sebagai Mixed Content → admin console spinner.
+ # KC_HTTP_ENABLED=true (di bawah) tetap mengizinkan KC listen HTTP di port 8080
+ # untuk internal nginx; strict-https hanya mengontrol URL yang KC kirim ke browser.
+ KC_HOSTNAME_STRICT_HTTPS: "true"
```

---

## Verifikasi Pasca Fix

| Gate | Hasil |
|---|---|
| G1: CMD=start, healthy | ✅ `["start"]`, `healthy` |
| G2: issuer HTTPS | ✅ `https://auth.smkdarussalamsubah.sch.id/realms/diis` |
| G3b: port 8080 eksternal timeout | ✅ curl exit=28 (timeout) |
| G5: /metrics → 404 | ✅ HTTP 404 |
| CSP internal: frame-src https | ✅ `frame-src 'self' https://auth.*` |
| CSP external (via CF): frame-src self | ✅ `frame-src 'self'` |

---

## VPS Hotfix (dieksekusi 2026-06-09)

```bash
# Patch docker-compose.yml di VPS
sed -i 's/KC_HOSTNAME_STRICT_HTTPS: "false"/KC_HOSTNAME_STRICT_HTTPS: "true"/' docker-compose.yml

# Recreate KC container dengan env baru
docker compose --env-file .env up -d --no-deps --force-recreate keycloak

# Hasil: healthy dalam ~30s
```

---

## Catatan Keamanan Tambahan

### 1. Duplicate security headers (nginx + Keycloak)
Response external menunjukkan header duplikat:
```
x-frame-options: SAMEORIGIN   ← dari Keycloak
x-frame-options: SAMEORIGIN   ← dari nginx (add_header global)
```
Keduanya nilai sama → tidak ada konflik. Namun sebaiknya nginx menggunakan
`proxy_hide_header X-Frame-Options` di blok auth.* untuk menghindari duplikasi.
**Prioritas rendah** — tidak mempengaruhi keamanan atau fungsi. Backlog item.

### 2. Cloudflare injection: `speculation-rules`
Response dari Cloudflare mengandung:
```
speculation-rules: "/cdn-cgi/speculation"
```
Cloudflare menyuntikkan skrip speculative-prefetch ke halaman HTML (CF Speed Brain).
Untuk SPA hash-based routing seperti admin console Keycloak, ini berpotensi
mengganggu navigasi. **Rekomendasi:** buat Cloudflare Page Rule untuk
`auth.smkdarussalamsubah.sch.id/*` → Speed → CF Speed Brain: OFF.
Atau set `auth.*` ke DNS Only (gray-cloud) jika TLS di nginx sudah cukup.

### 3. Admin console akses publik
`https://auth.smkdarussalamsubah.sch.id/admin/` dapat diakses dari internet.
Ini merupakan attack surface untuk brute-force master realm.
**Rekomendasi jangka panjang:** batasi via nginx `allow/deny` + IP allowlist,
atau gunakan port 8080 via SSH tunnel secara eksklusif.

---

## Arsitektur Pasca N-29b

```
Browser (HTTPS)
  │
  ▼
Cloudflare → nginx → Keycloak (HTTP internal, port 8080 loopback)
                          │
                          ├── KC_HOSTNAME_STRICT_HTTPS: true
                          │   → CSP frame-src 'self' https://auth.*
                          │
                          └── login-status-iframe → https:// ✅
                                                    (tidak diblokir Mixed Content)
```

---

## Definition of Done

- [x] Root cause teridentifikasi: `KC_HOSTNAME_STRICT_HTTPS: false` → http:// dalam CSP
- [x] Fix diterapkan di `docker-compose.yml`: nilai diubah ke `"true"`
- [x] VPS hotfix dieksekusi — KC healthy, CSP verified HTTPS
- [x] PR #80 dibuka: `feat/N-29b-admin-console-mixed-content-fix` → develop
- [x] Semua G1–G5 (N-23b) re-verified setelah KC restart
- [x] N-23b done report diperbarui (rationale KC_HOSTNAME_STRICT_HTTPS dikoreksi)
- [ ] PR #80 di-merge develop → staging → main (menunggu approval + CI)
- [x] Browser test admin console pasca fix — ✅ dikonfirmasi Director 2026-06-09: admin console Keycloak berhasil load dan bisa login.
- [ ] Cloudflare Speed Brain Page Rule (rekomendasi, backlog)
- [ ] nginx proxy_hide_header cleanup (rekomendasi, backlog)
