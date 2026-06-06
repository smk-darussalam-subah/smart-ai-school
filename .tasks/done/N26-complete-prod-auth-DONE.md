# N26 — Complete Prod Auth Config — DONE

**Tanggal:** 2026-06-07
**Branch:** `fix/N26-complete-prod-auth`
**PR:** → develop
**Severity:** BLOCKER PRODUKSI (bundel 3 fix VPS yang belum ter-formalisasi ke repo)

---

## Konteks

PR #67 (N-24) membenahi `next.config.js` env-baking, tapi repo masih kurang 3 fix
yang sudah diterapkan manual di VPS. Tanpa formalisasi ini, `git pull` pada deploy
penuh akan menimpa konfigurasi VPS dan mematikan login kembali.

---

## N-23 — KC_PROXY_HEADERS (docker-compose.yml)

**Root cause:** Keycloak di belakang Nginx (reverse proxy). Tanpa `KC_PROXY_HEADERS: xforwarded`,
Keycloak mengabaikan `X-Forwarded-Proto: https` dari Nginx → issuer URL ber-skema `http://`
(bukan `https://`) → next-auth gagal validasi token issuer → login broken.

**Fix:** Tambah ke `environment:` service `keycloak`:
```yaml
KC_PROXY_HEADERS: xforwarded
```

---

## N-25 — Nginx proxy buffer web (nginx.conf)

**Root cause:** Next.js mengirim response header besar (CSP nonce per-request +
`set-cookie` session JWT). Buffer default Nginx (4k/8k) tidak cukup →
"upstream sent too big header" → 502 Bad Gateway.

**Fix:** Tambah ke `location /` server block `smkdarussalamsubah.sch.id`:
```nginx
proxy_buffer_size 128k;
proxy_buffers 4 256k;
proxy_busy_buffers_size 256k;
```

---

## N-26 — realm-diis.json localhost → production URL

**Root cause:** `realm-diis.json` masih menggunakan `http://localhost:3000` di 6 field
client `diis-web`. Keycloak menggunakan file ini sebagai referensi untuk validasi
redirect URI dan post-logout redirect. Pada saat deploy fresh (volume reset), login
akan rusak lagi meski VPS sudah dipatch manual.

**Fix:** Semua `localhost:3000` diganti ke `https://smkdarussalamsubah.sch.id`:

| Field | Sebelum | Sesudah |
|-------|---------|---------|
| `rootUrl` | `http://localhost:3000` | `https://smkdarussalamsubah.sch.id` |
| `adminUrl` | `http://localhost:3000` | `https://smkdarussalamsubah.sch.id` |
| `baseUrl` | `http://localhost:3000` | `https://smkdarussalamsubah.sch.id` |
| `redirectUris` | `["http://localhost:3000/*", "https://.../*"]` | `["https://smkdarussalamsubah.sch.id/*"]` |
| `webOrigins` | `["http://localhost:3000", "https://..."]` | `["https://smkdarussalamsubah.sch.id"]` |
| `post.logout.redirect.uris` | `http://localhost:3000/*` | `https://smkdarussalamsubah.sch.id/*` |

**Bonus — HOSTNAME: "0.0.0.0" (web service):**
Next.js standalone default bind ke `127.0.0.1` — tidak terjangkau dari container nginx.
`HOSTNAME: "0.0.0.0"` memaksa listen di semua interface Docker network.

---

## Bukti Verifikasi (pre-merge)

```
# 0 localhost di realm-diis.json
grep "localhost" infrastructure/keycloak/realm-diis.json → NONE

# KC_PROXY_HEADERS ada
grep "KC_PROXY_HEADERS" infrastructure/docker/docker-compose.yml → KC_PROXY_HEADERS: xforwarded

# HOSTNAME web ada
grep "HOSTNAME" infrastructure/docker/docker-compose.yml → HOSTNAME: "0.0.0.0"

# proxy_buffer di web block
grep "proxy_buffer" infrastructure/nginx/nginx.conf → baris 79-81 (web) + 118-119 (keycloak existing)
```

---

## Security Checklist

- [x] Tidak ada secret di-commit (tetap `${}`)
- [x] Tidak ada pelonggaran CSP (middleware tidak diubah)
- [x] `KC_PROXY_HEADERS: xforwarded` — nilai standar Keycloak untuk Nginx

---

## DoD Checklist

- [x] `KC_PROXY_HEADERS: xforwarded` di compose keycloak service
- [x] `HOSTNAME: "0.0.0.0"` di compose web service
- [x] `proxy_buffer_size/buffers/busy_buffers` di nginx web block
- [x] 0 `localhost` di realm-diis.json
- [x] Done report ini
- [ ] Cowork review line-by-line
- [ ] CI hijau setelah merge
- [ ] Staging: login → redirect Keycloak → dashboard (verifikasi end-to-end)
- [ ] Main: promote setelah staging verified
