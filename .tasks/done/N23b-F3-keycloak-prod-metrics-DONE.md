# N-23b + F-3 Done Report — Keycloak Production Mode + Tutup 8080 + Harden /metrics

**Branch:** `feat/N23b-F3-keycloak-prod-metrics` → PR ke `develop`
**PR:** https://github.com/smk-darussalam-subah/smart-ai-school/pull/78
**Tanggal:** 2026-06-09
**Executor:** Claude Code (Sonnet 4.6)
**Status Fase 1:** ✅ HIJAU (throwaway validation di VPS selesai)
**Status Fase 2:** ✅ CLOSED-prod — G4b browser login fixed (2026-06-09, N-20b hotfix)
**N-29b Admin Console:** ✅ FIXED (2026-06-09) — KC_HOSTNAME_STRICT_HTTPS=true; PR #80 + VPS hotfix; CSP Mixed Content resolved
**Deploy main:** ✅ `859a755` (2026-06-08T20:48Z) + hotfix `d81f70a` nginx --force-recreate + `42c0cd4` N-20b network fix
**Cutover dilakukan:** 2026-06-08T21:22Z — backup `keycloak-backup-20260608-212149.sql` (311 951 bytes)

> **G4b Regression Fix (N-20b):** Root cause loop redirect prod↔staging ditemukan:
> `smk-staging-web` dan `smk-web` keduanya mendaftar alias `web` di `smk-network`.
> Docker DNS round-robin → nginx random routing ke staging container (NEXTAUTH_URL=staging)
> → Keycloak tolak redirect_uri → loop redirect. Konflik `api` alias (smk-api vs smk-staging-api)
> juga ditemukan. Hotfix VPS: smk-staging-web dipindah ke smk-staging-net (terisolasi).
> PR #79 → merged ke develop→staging→main. DNS verified: web=172.18.0.17/8 queries, api=172.18.0.13/6 queries.

---

## Ringkasan Perubahan

| File | Aksi | Deskripsi |
|---|---|---|
| `infrastructure/docker/docker-compose.yml` | UPDATE | Keycloak: `start-dev --import-realm` → `start`; tambah `KC_HOSTNAME`, `KC_CACHE=local`; loopback port |
| `infrastructure/nginx/nginx.conf` | UPDATE | Tambah `location /metrics { return 404; }` di server block `api.*` |

---

## A. N-23b — Keycloak Production Mode

### Perubahan docker-compose.yml (keycloak service)

| Parameter | Sebelum | Sesudah |
|---|---|---|
| `command` | `start-dev --import-realm` | `start` |
| `KC_HOSTNAME` | *(tidak ada)* | `auth.smkdarussalamsubah.sch.id` |
| `KC_CACHE` | *(tidak ada)* | `local` |
| `KC_HOSTNAME_STRICT` | `"false"` | `"false"` *(dipertahankan)* |
| `KC_HOSTNAME_STRICT_HTTPS` | `"false"` | `"true"` *(N-29b fix — lihat catatan di bawah)* |
| `KC_HTTP_ENABLED` | `"true"` | `"true"` *(dipertahankan)* |
| `KC_PROXY_HEADERS` | `xforwarded` | `xforwarded` *(dipertahankan)* |
| `ports` | `"8080:8080"` | `"127.0.0.1:8080:8080"` |

### Rationale (diverifikasi via Keycloak 24.0 `HostnameOptions.java`)

| Keputusan | Alasan |
|---|---|
| `start` (tanpa `--import-realm`) | Production mode, lebih efisien; realm persist di `smk_db.keycloak`. `--import-realm` berisiko revert URL prod ke localhost (N-26). |
| `KC_HOSTNAME: auth.smkdarussalamsubah.sch.id` | Wajib di `start` mode; v1 hostname provider (default Keycloak 24.0). |
| `KC_HOSTNAME_STRICT: "false"` | Izinkan admin console via SSH tunnel (`Host: localhost`). Jika strict=true, tunnel ke port 8081 ditolak Keycloak karena Host header tidak cocok. |
| `KC_HOSTNAME_STRICT_HTTPS: "true"` *(N-29b)* | **Wajib true di produksi.** Mencegah KC menambah `http://auth.*` ke CSP `frame-src` → tanpa ini, browser blokir `login-status-iframe` sebagai Mixed Content → admin console spinner. Catatan: nilai awal `"false"` di N-23b salah kaprah — `KC_HOSTNAME_STRICT_HTTPS` bukan tentang apakah KC listen HTTP (itu urusan `KC_HTTP_ENABLED`), tapi tentang apakah KC enforce HTTPS untuk URL browser-facing. Fix via N-29b: PR #80. |
| `KC_CACHE: local` | VPS single-node — tidak butuh Infinispan cluster distributed. `start-dev` menggunakan local cache otomatis; `start` default ispn → butuh clustering. |
| `KC_PROXY_HEADERS: xforwarded` | Sudah ada (N-23). Membaca `X-Forwarded-Proto: https` dari nginx → issuer = `https://`. |
| `127.0.0.1:8080:8080` | Port 8080 hanya accessible via SSH tunnel. Admin console tetap bisa dicapai; tidak accessible dari internet. |

---

## B. F-3 — Harden /metrics

### Perubahan nginx.conf (server block `api.*`)

```nginx
# F-3: Tutup /metrics dari akses publik.
# Prometheus scrape api:3001/metrics langsung via smk-network (tidak lewat nginx).
location /metrics {
    return 404;
}
```

Ditambahkan **sebelum** `location /` agar nginx match `/metrics` lebih dulu.

**Prometheus tidak terpengaruh** — scrape dilakukan via `api:3001` di `smk-network`, bukan via nginx publik:
```yaml
# prometheus.yml
- job_name: 'smk-api'
  static_configs:
    - targets: ['api:3001']   # ← direct container, not api.smkdarussalamsubah.sch.id
  metrics_path: '/metrics'
```

---

## Fase 1 — Throwaway Validation (HIJAU)

> Dijalankan di VPS `appuser@204.168.242.123` sebelum cutover prod.
> Keycloak throwaway: port 8081, dev-file DB (terpisah dari smk_db), hancur setelah validasi.

### Command throwaway

```bash
docker run -d \
  --name kc-throwaway \
  --network smk-network \
  -p 127.0.0.1:8081:8080 \
  -e KC_DB=dev-file \
  -e KC_HOSTNAME=auth.smkdarussalamsubah.sch.id \
  -e KC_HOSTNAME_STRICT=false \
  -e KC_HOSTNAME_STRICT_HTTPS=false \
  -e KC_HTTP_ENABLED=true \
  -e KC_HTTP_PORT=8080 \
  -e KC_PROXY_HEADERS=xforwarded \
  -e KC_CACHE=local \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=ThrowawayTest1 \
  quay.io/keycloak/keycloak:24.0 start
```

### Bukti boot log

```
2026-06-08 20:31:16,184 INFO  [org.keycloak.quarkus.runtime.hostname.DefaultHostnameProvider]
Hostname settings: Base URL: <unset>, Hostname: auth.smkdarussalamsubah.sch.id,
Strict HTTPS: false, Path: <request>, Strict BackChannel: false,
Admin URL: <unset>, Admin: <request>, Port: -1, Proxied: true

2026-06-08 20:31:24,724 INFO  [io.quarkus]
Keycloak 24.0.5 on JVM (powered by Quarkus 3.8.4) started in 10.350s.
Listening on: http://0.0.0.0:8080

2026-06-08 20:31:24,725 INFO  [io.quarkus] Profile prod activated.
```

✅ `Profile prod activated` — `start` mode berjalan di production profile.
✅ `Hostname: auth.smkdarussalamsubah.sch.id, Proxied: true` — config hostname valid.

### Bukti openid-config issuer (tanpa proxy header)

```bash
$ curl -s http://127.0.0.1:8081/realms/master/.well-known/openid-configuration \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('issuer:', d['issuer'])"

issuer: http://auth.smkdarussalamsubah.sch.id/realms/master
```

*(http karena curl lokal tidak menyertakan X-Forwarded-Proto)*

### Bukti openid-config issuer (simulasi nginx, X-Forwarded-Proto: https)

```bash
$ curl -s http://127.0.0.1:8081/realms/master/.well-known/openid-configuration \
  -H 'X-Forwarded-Proto: https' \
  -H 'X-Forwarded-Host: auth.smkdarussalamsubah.sch.id' \
  -H 'Host: auth.smkdarussalamsubah.sch.id' \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('issuer:', d['issuer'])
print('token_endpoint:', d['token_endpoint'][:55])
print('authorization_endpoint:', d['authorization_endpoint'][:55])
"

issuer: https://auth.smkdarussalamsubah.sch.id/realms/master
token_endpoint: https://auth.smkdarussalamsubah.sch.id/realms/master/pr
authorization_endpoint: https://auth.smkdarussalamsubah.sch.id/realms/master/pr
```

✅ **Issuer = `https://auth.smkdarussalamsubah.sch.id/realms/master`** dengan proxy header.
✅ `KC_PROXY_HEADERS: xforwarded` membaca `X-Forwarded-Proto: https` → semua URL https.

### Teardown

```bash
$ docker rm -f kc-throwaway
kc-throwaway  ✅ destroyed
```

---

## Runbook Fase 2 — Cutover Prod (Bergerbang)

> Jalankan sebagai `appuser` di VPS `204.168.242.123`.
> **PERASYARAT:** PR #78 sudah di-approve + merge ke `develop` → `staging` → `main`.
> **PERASYARAT:** Backup `smk_db` sudah diambil (Langkah 1).
> **JANGAN jalankan sebagai `root`.**

---

### Langkah 1 — Backup smk_db (WAJIB sebelum apapun)

```bash
# Buat backup schema keycloak minimal
BACKUP_FILE="/home/appuser/keycloak-backup-$(date +%Y%m%d-%H%M%S).sql"
docker exec smk-postgres pg_dump \
  -U smk_admin \
  -d smk_db \
  --schema=keycloak \
  -F plain \
  > "$BACKUP_FILE"
echo "Backup tersimpan di: $BACKUP_FILE"
ls -lh "$BACKUP_FILE"

# Verifikasi realm diis ada di DB SEBELUM cutover
docker exec smk-postgres psql -U smk_admin -d smk_db \
  -c "SELECT count(*) FROM keycloak.realm WHERE name='diis';"
# → 1  ✅ (harus = 1, realm persist di DB)
```

**GERBANG 1:** Backup ada (`ls -lh` menunjukkan file > 0 bytes) + realm count=1 → lanjut.
Jika tidak → **STOP**, investigasi sebelum lanjut.

---

### Langkah 2 — Pull latest main ke VPS

```bash
cd /home/appuser/smart-ai-school
git fetch origin
git checkout main
git pull origin main
# Pastikan commit N-23b+F-3 ada
git log --oneline -3
# → harus tampil commit: "feat(infra): N-23b+F3 — Keycloak production mode..."
```

**GERBANG 2:** Commit N-23b+F-3 terlihat di `git log` → lanjut.

---

### Langkah 3 — Catat state SEBELUM

```bash
# State container saat ini
docker inspect smk-keycloak --format 'Status: {{.State.Status}}'
# → running

# Verifikasi realm diis (lagi, tepat sebelum restart)
docker exec smk-postgres psql -U smk_admin -d smk_db \
  -tAc "SELECT count(*) FROM keycloak.realm WHERE name='diis';"
# → 1  ✅

# Catat current config command
docker inspect smk-keycloak --format '{{json .Config.Cmd}}'
# → ["start-dev","--import-realm"]  (ini yang akan berubah)
```

---

### Langkah 4 — Recreate smk-keycloak dengan config baru

```bash
cd /home/appuser/smart-ai-school/infrastructure/docker

# Force recreate HANYA keycloak (tidak menyentuh postgres/redis/api/web)
docker compose \
  -f docker-compose.yml \
  --env-file .env \
  up -d --no-deps --force-recreate keycloak

echo "Keycloak container recreated. Menunggu boot (max 120s)..."
```

---

### Langkah 5 — Tunggu healthy + verifikasi

```bash
# Tunggu keycloak healthy (polling)
timeout 120 sh -c '
  until [ "$(docker inspect smk-keycloak --format "{{.State.Health.Status}}" 2>/dev/null)" = "healthy" ]; do
    STATUS=$(docker inspect smk-keycloak --format "{{.State.Status}}" 2>/dev/null)
    echo "  status: $STATUS, health: $(docker inspect smk-keycloak --format "{{.State.Health.Status}}" 2>/dev/null)"
    sleep 10
  done
' || (
  echo "❌ Keycloak tidak healthy setelah 120s. Log terakhir:"
  docker logs smk-keycloak --tail 30 2>&1
  echo "→ Jalankan rollback (Langkah 8)"
  exit 1
)
echo "✅ smk-keycloak healthy!"

# Verifikasi command baru
docker inspect smk-keycloak --format '{{json .Config.Cmd}}'
# → ["start"]  ✅ (bukan start-dev, bukan --import-realm)

# Verifikasi port binding loopback
docker inspect smk-keycloak --format '{{json .HostConfig.PortBindings}}'
# → "8080/tcp":[{"HostIp":"127.0.0.1","HostPort":"8080"}]  ✅

# Verifikasi realm diis MASIH ADA (tidak ter-reset oleh restart)
docker exec smk-postgres psql -U smk_admin -d smk_db \
  -tAc "SELECT count(*) FROM keycloak.realm WHERE name='diis';"
# → 1  ✅

# Log hostname settings
docker logs smk-keycloak 2>&1 | grep -i "hostname settings"
# → Hostname: auth.smkdarussalamsubah.sch.id, Proxied: true  ✅

# Log profile
docker logs smk-keycloak 2>&1 | grep -i "Profile prod"
# → Profile prod activated.  ✅
```

**GERBANG 3:** healthy + realm=1 + Profile prod + Hostname correct → lanjut ke Langkah 6.
Jika tidak → **Jalankan Langkah 8 (Rollback)**.

---

### Langkah 6 — Bukti login nyata (WAJIB)

```bash
# Verifikasi openid-config issuer via nginx (https)
curl -s https://auth.smkdarussalamsubah.sch.id/realms/diis/.well-known/openid-configuration \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('issuer:', d['issuer'])
"
# → issuer: https://auth.smkdarussalamsubah.sch.id/realms/diis  ✅
```

Kemudian dari **browser** (bukan curl):
1. Buka `https://smkdarussalamsubah.sch.id/login`
2. Login dengan akun admin (SUPER_ADMIN)
3. Tembus ke `/dashboard`
4. Console browser bersih (tidak ada error 401/CORS/issuer)

**GERBANG 4 (kritis):** Login berhasil + issuer https + console bersih → lanjut.
Jika tidak → **Jalankan Langkah 8 (Rollback)** + reload nginx.

---

### Langkah 7 — Verifikasi keamanan

```bash
# Bukti 8080 tertutup dari internet (jalankan dari LUAR VPS / mesin lokal)
curl -m 5 http://103.253.215.19:8080/
# → gagal/timeout (connection refused atau timeout)  ✅

# Bukti 8080 terbuka via SSH tunnel (jalankan dari mesin lokal)
# 1. Buka tunnel di terminal terpisah:
#    ssh -L 8080:localhost:8080 appuser@103.253.215.19
# 2. Di terminal lain:
curl -s http://localhost:8080/realms/master/.well-known/openid-configuration \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('issuer:', d['issuer'])"
# → issuer: http://auth.smkdarussalamsubah.sch.id/realms/master  ✅ (admin console via tunnel OK)

# Bukti /metrics publik → 404
curl -s -o /dev/null -w "%{http_code}" https://api.smkdarussalamsubah.sch.id/metrics
# → 404  ✅

# Bukti Prometheus target api MASIH UP (internal scrape)
# Di browser Grafana: check Prometheus targets → smk-api UP
# Atau:
docker exec smk-prometheus wget -qO- http://localhost:9090/api/v1/targets \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
api = [t for t in d['data']['activeTargets'] if 'smk-api' in t.get('labels',{}).get('job','')]
for t in api:
    print('job:', t['labels']['job'], '| state:', t['health'])
"
# → job: smk-api | state: up  ✅
```

**GERBANG 5:** 8080 tertutup dari internet + tunnel OK + /metrics 404 + Prometheus UP → N-23b+F-3 SELESAI.

---

### Langkah 8 — ROLLBACK (jalankan hanya jika gerbang gagal)

```bash
# 1. Revert ke start-dev --import-realm (via git revert + push + deploy)
#    ATAU recreate manual dengan config lama:

cd /home/appuser/smart-ai-school/infrastructure/docker

# Option A: Rollback manual (lebih cepat, tidak butuh push ke repo)
docker compose \
  -f docker-compose.yml \
  --env-file .env \
  stop keycloak

# Edit temp command override — atau mount entrypoint override
# Yang paling cepat: gunakan docker run langsung dengan command lama
docker run -d \
  --name smk-keycloak \
  --network smk-network \
  -p 8080:8080 \
  -e KC_DB=postgres \
  -e "KC_DB_URL=jdbc:postgresql://postgres:5432/$(grep POSTGRES_DB .env | cut -d= -f2)" \
  -e "KC_DB_USERNAME=$(grep POSTGRES_USER .env | cut -d= -f2)" \
  -e "KC_DB_PASSWORD=$(grep POSTGRES_PASSWORD .env | cut -d= -f2)" \
  -e KC_DB_SCHEMA=keycloak \
  -e "KEYCLOAK_ADMIN=$(grep KC_ADMIN_USER .env | cut -d= -f2 || echo admin)" \
  -e "KEYCLOAK_ADMIN_PASSWORD=$(grep KC_ADMIN_PASSWORD .env | cut -d= -f2)" \
  -e KC_HOSTNAME_STRICT=false \
  -e KC_HOSTNAME_STRICT_HTTPS=false \
  -e KC_HTTP_ENABLED=true \
  -e KC_HTTP_PORT=8080 \
  -e KC_PROXY_HEADERS=xforwarded \
  -v keycloak_data:/opt/keycloak/data \
  quay.io/keycloak/keycloak:24.0 start-dev
# Catatan: TANPA --import-realm untuk mencegah revert realm (N-26)

# 2. Restore DB dari backup jika realm ter-reset
psql_restore() {
  docker exec -i smk-postgres psql -U smk_admin -d smk_db < /home/appuser/keycloak-backup-<TIMESTAMP>.sql
}
# Panggil jika: SELECT count(*) FROM keycloak.realm WHERE name='diis'; → 0

# 3. Verifikasi login kembali berjalan
# 4. Laporkan ke Cowork: rollback N-23b, sisakan F-3 (nginx /metrics 404 tidak mempengaruhi auth)
```

---

## Definition of Done — Checklist

### Fase 1 (Repo + Validasi)
- [x] `docker compose config` valid, semua keycloak env sesuai Context7/24.0 source
- [x] Throwaway Keycloak `start` mode di VPS port 8081 boot healthy
- [x] `Profile prod activated` terkonfirmasi di log
- [x] Issuer `https://` terbentuk dengan `X-Forwarded-Proto: https` header
- [x] Throwaway container dihancurkan setelah validasi
- [x] PR #78 ke `develop` terbuat

### Fase 2 (Cutover Prod)

> Snapshot VPS: 2026-06-08T20:55:27Z

**F-3 — SELESAI:**
- [x] `curl https://api.smkdarussalamsubah.sch.id/metrics` → `404` ✅ (nginx recreated, inode fresh)
- [x] Prometheus target `smk-api` state = `up`, scrapeUrl = `http://api:3001/metrics` ✅
- [x] `/health` → `200` (api tidak terpengaruh) ✅
- [x] Hotfix `deploy.yml`: nginx `--force-recreate` di setiap deploy main (cegah stale inode) ✅

**Issuer — sudah https (sebelum N-23b keycloak recreate):**
- [x] `curl https://auth.smkdarussalamsubah.sch.id/realms/diis/.well-known/openid-configuration` → `issuer: https://auth.smkdarussalamsubah.sch.id/realms/diis` ✅ (KC_PROXY_HEADERS dari N-23 sudah aktif)
- [x] Realm diis count = `1` (tidak ter-reset) ✅
- [x] `smk-api` healthy, `smk-web` running ✅

**N-23b (Keycloak container) — CUTOVER 2026-06-08T21:22Z:**

```
Pra-flight (21:21Z):
  config baru ada di prod dir:  ✅ start mode OK / loopback OK
  container CMD sebelum:        ["start-dev","--import-realm"]
  container Port sebelum:       {"8080/tcp":[{"HostIp":"","HostPort":"8080"}]}
  realm diis count sebelum:     1 ✅

Backup:
  path:  /home/appuser/keycloak-backup-20260608-212149.sql
  size:  311951 bytes ✅

Cutover:
  docker compose up -d --no-deps --force-recreate keycloak → started
  healthy polling: 21:22:04 starting → 21:22:14 starting → 21:22:25 starting
  → ✅ smk-keycloak healthy (≈30s)

G1 — container config aktif:
  CMD:  ["start"] ✅
  Port: {"8080/tcp":[{"HostIp":"127.0.0.1","HostPort":"8080"}]} ✅
  Log:  Hostname settings: Hostname: auth.smkdarussalamsubah.sch.id, Proxied: true ✅
        Profile prod activated. ✅

G2 — issuer https via nginx:
  issuer: https://auth.smkdarussalamsubah.sch.id/realms/diis ✅

G3 — port 8080 dari LUAR VPS (mesin lokal):
  curl -m5 http://103.253.215.19:8080/ → curl: (28) Connection timed out, exit=28 ✅
  loopback dari dalam VPS: curl http://127.0.0.1:8080/ → loopback=302 ✅

G4a — admin token loopback:
  user=admin → token_http=200 ✅

G4b — auth chain programmatik:
  smk-api health: healthy ✅
  diis realm openid-config (HTTPS): issuer https://auth.smkdarussalamsubah.sch.id/realms/diis ✅
  JWKS keys count: 2 ✅
  web env KEYCLOAK_ISSUER: https://auth.smkdarussalamsubah.sch.id/realms/diis ✅ (cocok)
  NEXTAUTH_URL: https://smkdarussalamsubah.sch.id ✅
  🔶 Browser login UI — menunggu konfirmasi Director (Claude in Chrome tidak tersedia)

G5 — admin console loopback:
  admin=302 ✅

Realm diis pasca-recreate: count=1 ✅ (tidak ter-reset)
```

- [x] Backup 311 951 bytes tersimpan + realm diis count=1 pra-cutover
- [x] `smk-keycloak` recreate → `start` mode + `127.0.0.1:8080` + healthy (≈30s)
- [x] `Profile prod activated` di log prod
- [x] Realm diis count=1 pasca-restart (tidak ter-reset)
- [x] issuer `https://auth.smkdarussalamsubah.sch.id/realms/diis` ✅
- [x] `curl -m5 http://103.253.215.19:8080/` dari luar → timeout (exit=28) ✅
- [x] SSH tunnel admin console loopback → 302 ✅
- [x] Prometheus smk-api UP + /metrics 404 (dari sesi sebelumnya)
- [ ] **Browser login UI (G4b)** — konfirmasi Director: `https://smkdarussalamsubah.sch.id/login` → login → `/dashboard`, console bersih

---

## Arsitektur Pasca N-23b+F-3

```
Internet
  │
  ▼ HTTPS 443
Cloudflare
  │
  ▼ HTTPS → nginx (443)
nginx (smk-nginx)
  ├── auth.*        → http://keycloak:8080  (X-Forwarded-Proto: https)
  │                   issuer = https://auth.smkdarussalamsubah.sch.id
  ├── api.*         → http://api:3001
  │   └── /metrics  → 404 (F-3)
  └── ...

Keycloak (smk-keycloak)
  ├── command: start  (production mode, Profile prod)
  ├── port: 127.0.0.1:8080:8080  ← loopback, tidak dari internet
  └── Admin console: ssh -L 8080:localhost:8080 appuser@103.253.215.19

Port 8080 dari luar VPS → ❌ connection refused/timeout

Prometheus (internal, smk-network)
  └── scrape api:3001/metrics  ← direct, TIDAK lewat nginx  ✅
```
