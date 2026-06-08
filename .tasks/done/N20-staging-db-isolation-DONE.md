# N-20 Done Report — Isolasi DB Staging (`smk_staging_db`)

**Branch:** `feat/N20-staging-db-isolation` → PR ke `develop`
**PR:** https://github.com/smk-darussalam-subah/smart-ai-school/pull/75
**Tanggal:** 2026-06-09
**Executor:** Claude Code (Sonnet 4.6)

---

## Ringkasan Perubahan

| File | Aksi | Deskripsi |
|---|---|---|
| `infrastructure/docker/init-staging-db.sh` | NEW | Init script (fresh container): buat `smk_staging_db` + extensions + schemas |
| `infrastructure/docker/docker-compose.yml` | UPDATE | Mount `init-staging-db.sh` di `/docker-entrypoint-initdb.d/02-init-staging-db.sh` |
| `infrastructure/docker/docker-compose.staging.yml` | NEW | Override staging: container terpisah, port 3100/3101, `DATABASE_URL → smk_staging_db` |
| `infrastructure/docker/.env.staging.example` | NEW | Template env file staging (gitignored `smk_staging_db`, NEXTAUTH_SECRET baru) |
| `apps/api/start.sh` | UPDATE | Guardrail N-20: exit 1 jika `GUARD_STAGING_DB=1` tapi DB bukan `smk_staging_db` |
| `.github/workflows/deploy.yml` | UPDATE | Split per-branch: `main → /home/appuser/…`, `staging → /opt/diis-staging/…` |

---

## Arsitektur Solusi

```
VPS (1 server, 1 container postgres)
│
├── Stack PROD (project: smk)
│   ├── smk-postgres  ────────────────────┐  ← container postgres TUNGGAL
│   │   ├── smk_db          (prod)        │    shared via smk-network
│   │   └── smk_staging_db  (staging) ───┘
│   ├── smk-api       (port prod, via nginx)
│   ├── smk-web       (port prod, via nginx)
│   └── smk-network  (named: smk-network, explicit)
│
└── Stack STAGING (project: smk-staging)
    ├── smk-staging-api   (port 3101, DATABASE_URL → smk_staging_db)
    ├── smk-staging-web   (port 3100)
    └── smk-network  (SAMA → reach smk-postgres/redis/keycloak)
```

**Key decision:** `name: smk-network` di docker-compose.yml adalah _explicit name_ → tidak di-prefix project.
Kedua stack berbagi network yang sama → staging api bisa reach `smk-postgres` tanpa duplikasi container.

---

## Bukti Runtime Wajib (O-02)

### #1 — `docker compose config` valid, DATABASE_URL → `smk_staging_db`

```bash
$ docker-compose -p smk-staging --env-file .env.staging.test \
    -f docker-compose.yml -f docker-compose.staging.yml config \
    | grep -E "DATABASE_URL|container_name.*staging|GUARD_STAGING|3101|3100|name: smk-"

name: smk-staging
    container_name: smk-staging-api
      DATABASE_URL: postgresql://smk_admin:TestPass123@postgres:5432/smk_staging_db
      GUARD_STAGING_DB: "1"
        published: "3101"
    container_name: smk-staging-db-init
    container_name: smk-staging-web
        published: "3100"
  smk-network:
    name: smk-network
```

✅ Config valid — `DATABASE_URL` menunjuk `smk_staging_db`, bukan `smk_db`.
✅ Project name `smk-staging`, container names `smk-staging-*` (tidak konflik dengan prod).
✅ Network `name: smk-network` shared dengan prod stack.

---

### #2 & #3 — Prisma migrate + bukti smk_db tak tersentuh

> **Bukti VPS sesungguhnya** — dikumpulkan via SSH ke `appuser@204.168.242.123` setelah deploy run #27163688923 success (2026-06-08T20:10:25Z).

**Actions log — guardrail N-20 aktif (deploy run #27163082888):**
```
✅ Guardrail N-20 OK — DATABASE_URL menunjuk smk_staging_db
🔄 Running database migrations...
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "smk_staging_db", schema "public" at "postgres:5432"
9 migrations found in prisma/migrations
All migrations have been applied.
```

**VPS — SNAPSHOT SEBELUM** (2026-06-08T19:48:16Z):
```
smk_db migrations : 9
smk_db tables     : 14
```

**VPS — SNAPSHOT SESUDAH** (2026-06-08T20:10:25Z):
```bash
# smk_db: migration count
$ docker exec smk-postgres psql -U smk_admin -d smk_db -tAc 'SELECT count(*) FROM _prisma_migrations;'
9   ← SAMA, tidak bertambah ✅

# smk_db: table count
$ docker exec smk-postgres psql -U smk_admin -d smk_db -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema IN \
  ('auth','academic','student','teacher','ppdb','finance','notification','ai_knowledge');"
14  ← SAMA, tidak bertambah ✅

# smk_db: confirm current_database
$ docker exec smk-postgres psql -U smk_admin -d smk_db -tAc 'SELECT current_database(), now();'
smk_db|2026-06-08 20:10:31.044238+00  ✅

# smk_staging_db: migration count
$ docker exec smk-postgres psql -U smk_admin -d smk_staging_db -tAc 'SELECT count(*) FROM _prisma_migrations;'
9   ← 9 migrations berhasil ✅

# smk_staging_db: confirm current_database
$ docker exec smk-postgres psql -U smk_admin -d smk_staging_db -tAc 'SELECT current_database();'
smk_staging_db  ✅

# smk_staging_db: tabel di schema academic
$ docker exec smk-postgres psql -U smk_admin -d smk_staging_db -c '\dt academic.*'
                  List of relations
  Schema  |         Name         | Type  |   Owner   
----------+----------------------+-------+-----------
 academic | attendance           | table | smk_admin
 academic | classes              | table | smk_admin
 academic | grades               | table | smk_admin
 academic | schedules            | table | smk_admin
 academic | teaching_assignments | table | smk_admin
(5 rows)  ✅
```

---

### #4 — smk-staging-api healthy + env guardrail

```bash
# Health status container
$ docker inspect smk-staging-api --format '{{.State.Health.Status}}'
healthy  ✅

# Env: guardrail + DATABASE_URL confirm
$ docker inspect smk-staging-api --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E 'DATABASE_URL|GUARD_STAGING_DB'
GUARD_STAGING_DB=1
DATABASE_URL=postgresql://smk_admin:***@postgres:5432/smk_staging_db  ✅
```

---

### #5 — Guardrail: simulasi `DATABASE_URL=...smk_db` → exit 1

```bash
$ GUARD_STAGING_DB=1 \
  DATABASE_URL='postgresql://smk_admin:secret@postgres:5432/smk_db' \
  bash apps/api/start.sh 2>&1 | head -8

❌ GUARDRAIL N-20 TRIGGERED — Stack staging menunjuk DB yang salah!
   DATABASE_URL target DB: 'smk_db'
   Expected: 'smk_staging_db'

   BAHAYA: prisma migrate deploy TIDAK dijalankan.
   Periksa manual: ...

Exit code: 1  ✅
```

```bash
$ GUARD_STAGING_DB=1 \
  DATABASE_URL='postgresql://smk_admin:secret@postgres:5432/smk_staging_db' \
  bash apps/api/start.sh 2>&1 | head -2

✅ Guardrail N-20 OK — DATABASE_URL menunjuk smk_staging_db
🔄 Running database migrations...

Exit code: 0 (lanjut ke migrate deploy)  ✅
```

---

## Runbook VPS untuk Director

> Jalankan sebagai `appuser` di VPS `204.168.242.123`.
> **JANGAN jalankan sebagai `root`.**

### Langkah 0 — Persiapan (satu kali)

```bash
# Buat direktori staging
sudo mkdir -p /opt/diis-staging
sudo chown appuser:appuser /opt/diis-staging

# Clone repo di direktori staging (sebagai appuser)
cd /opt/diis-staging
git clone git@github.com:smk-darussalam-subah/smart-ai-school.git
cd smart-ai-school
git checkout staging
```

### Langkah 1 — Buat `.env.staging`

```bash
cd /opt/diis-staging/smart-ai-school/infrastructure/docker
cp .env.staging.example .env.staging
nano .env.staging
```

Isi semua nilai:
- `POSTGRES_PASSWORD` = **SAMA persis** dengan prod `.env` di `/home/appuser/smart-ai-school/infrastructure/docker/.env`
- `POSTGRES_USER` = sama dengan prod
- `NEXTAUTH_SECRET` = **BARU** (generate: `openssl rand -hex 32`)
- Kosongkan `STAGING_DATABASE_URL` dan `REDIS_URL` — akan di-generate otomatis oleh deploy.yml

### Langkah 2 — Init staging DB (satu kali)

```bash
cd /opt/diis-staging/smart-ai-school/infrastructure/docker

# Pastikan prod stack (smk-postgres) sudah running
docker inspect smk-postgres --format '{{.State.Status}}'
# → running

# Buat smk_staging_db (idempoten)
docker-compose -p smk-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml \
  run --rm db-init-staging
```

Expected output:
```
[db-init-staging] Memastikan smk_staging_db ada di smk-postgres...
[db-init-staging] Database smk_staging_db dibuat.
[db-init-staging] smk_staging_db siap (extensions + schemas) ✓
```

### Langkah 3 — Verifikasi smk_db TIDAK tersentuh (sebelum staging deploy)

```bash
# Snapshot migration count di smk_db SEBELUM deploy
docker exec smk-postgres psql -U smk_admin -d smk_db \
  -c "SELECT count(*) as migration_count FROM public._prisma_migrations;"
# Catat angkanya (mis: 8)
```

### Langkah 4 — Deploy staging pertama kali

```bash
cd /opt/diis-staging/smart-ai-school/infrastructure/docker

# Patch DATABASE_URL di .env.staging
_PW=$(grep '^POSTGRES_PASSWORD=' .env.staging | head -1 | cut -d= -f2-)
_USER=$(grep '^POSTGRES_USER=' .env.staging | head -1 | cut -d= -f2- || echo 'smk_admin')
_ENC=$(printf '%s' "$_PW" | python3 -c "import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read(),safe=''),end='')")
_STAGING_URL="postgresql://${_USER}:${_ENC}@postgres:5432/smk_staging_db"
sed -i "s|^STAGING_DATABASE_URL=.*|STAGING_DATABASE_URL=${_STAGING_URL}|" .env.staging
echo "STAGING_DATABASE_URL → postgresql://${_USER}:***@postgres:5432/smk_staging_db"

# Build images
docker-compose -p smk-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml \
  build --no-cache api web

# Deploy (tidak start postgres/redis/keycloak — sudah running dari prod)
docker-compose -p smk-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml \
  up -d --no-deps api web
```

### Langkah 5 — Verifikasi post-deploy

```bash
# Cek staging api healthy
docker inspect smk-staging-api --format '{{.State.Health.Status}}'
# → healthy

# Cek migration berhasil di smk_staging_db
docker exec smk-postgres psql -U smk_admin -d smk_staging_db \
  -c "SELECT current_database();"
# → smk_staging_db

docker exec smk-postgres psql -U smk_admin -d smk_staging_db \
  -c "\dn"
# → auth, academic, student, teacher, ppdb, finance, notification, ai_knowledge

docker exec smk-postgres psql -U smk_admin -d smk_staging_db \
  -c "\dt academic.*"
# → classes, grades, attendance, teaching_assignments, schedules
```

### Langkah 6 — Verifikasi smk_db TIDAK berubah (kritis)

```bash
# Bandingkan migration count di smk_db (harus SAMA dengan langkah 3)
docker exec smk-postgres psql -U smk_admin -d smk_db \
  -c "SELECT count(*) as migration_count FROM public._prisma_migrations;"
# → SAMA dengan angka di langkah 3 (mis: 8) ✅

# Tidak ada tabel baru di smk_db dari staging
docker exec smk-postgres psql -U smk_admin -d smk_db \
  -c "SELECT current_database(), now() as checked_at;"
# → smk_db | <timestamp> ✅
```

### Langkah 7 — Teardown staging (bila perlu)

```bash
# Stop dan hapus container staging TANPA menyentuh prod
docker-compose -p smk-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml \
  down --no-deps --remove-orphans
# → hanya smk-staging-api dan smk-staging-web yang di-stop
# → smk-postgres, smk-redis, smk-keycloak TIDAK tersentuh ✅
```

---

## Trade-off & Catatan

| Aspek | Keputusan | Alasan |
|---|---|---|
| 1 postgres container | Shared `smk-postgres` + DB logis berbeda | Hemat resource VPS; postgres sudah support multi-DB dengan izin berbeda |
| Network | `smk-network` shared (explicit name) | Staging api perlu akses ke keycloak/redis yang sama |
| Working directory | `/opt/diis-staging/` terpisah dari `/home/appuser/` | Mencegah `git checkout staging` menimpa working-tree prod |
| NEXTAUTH_SECRET | Baru untuk staging | Isolasi session — token staging tidak valid di prod |
| `--no-deps` | Dipakai di deploy | Menghindari start ulang infra prod dari project staging |
| `init-staging-db.sh` | Untuk fresh containers | Idempoten; untuk VPS existing pakai `db-init-staging` service |
| Guardrail | Check nama DB di `start.sh` | Fail-hard sebelum `prisma migrate deploy` — cegah nyasar ke prod |

---

## Definition of Done — Checklist

- [x] `smk_staging_db` terbentuk idempoten + schema via `migrate deploy` (bukan baseline)
- [x] `docker-compose.staging.yml` dengan container terpisah, port 3100/3101, guardrail aktif
- [x] `.env.staging.example` + `.gitignore` sudah cover `.env.staging`
- [x] `deploy.yml` split per-branch: `staging → /opt/diis-staging/`, `main → /home/appuser/`
- [x] Guardrail anti-salah-target di `start.sh` (exit 1 jika DB bukan `smk_staging_db`)
- [x] Bukti runtime terlampir — VPS snapshot SEBELUM+SESUDAH (smk_db=9/14, smk_staging_db=9 migrations)
- [x] `smk-staging-api` healthy, env GUARD_STAGING_DB=1, DATABASE_URL → smk_staging_db
- [x] Runbook VPS lengkah-demi-langkah untuk Director
- [x] PR ke `develop` (bukan staging/main) — PR #75 merged, hotfix NODE_ENV PR #77 merged
- [x] **N-20 CLOSED-prod** — deploy run #27163688923 success (2026-06-08T20:08:43Z)
