# Panduan Setup Server VPS — DIIS Smart AI School

**Versi Dokumen:** 1.0 | 2026-05-29  
**Estimasi Waktu:** 30–60 menit (fresh VPS)  
**Target:** Ubuntu 22.04 LTS

---

## Prasyarat

### Spesifikasi Minimum VPS

| Resource | Minimum | Rekomendasi |
|----------|---------|-------------|
| CPU | 2 core | 4 core |
| RAM | 4 GB | 8 GB |
| Storage | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Network | 100 Mbps | 1 Gbps |

> **Catatan Ollama:** Jika menggunakan AI lokal (Ollama) dengan model besar (llama3 7B+), tambah 8–16 GB RAM dan 50 GB storage untuk model weights.

### Prasyarat yang Harus Tersedia Sebelum Mulai

- [ ] Akses SSH ke VPS sebagai `root` atau user dengan sudo
- [ ] Domain `smkdarussalamsubah.sch.id` sudah mengarah ke IP VPS (via Cloudflare)
- [ ] File `.env` sudah disiapkan (lihat `docs/deployment/env-variables.md`)
- [ ] Client secret Keycloak sudah digenerate (akan dikonfigurasi saat Keycloak setup)

---

## Langkah 1 — Persiapan Server

```bash
# Login ke VPS
ssh root@<IP-VPS>

# Update system
apt update && apt upgrade -y

# Install paket dasar
apt install -y \
  curl \
  wget \
  git \
  nano \
  ufw \
  fail2ban \
  htop \
  unzip
```

### Konfigurasi Firewall (UFW)

```bash
# Default policy
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (WAJIB — jangan sampai terkunci)
ufw allow 22/tcp

# Allow HTTP dan HTTPS (Nginx)
ufw allow 80/tcp
ufw allow 443/tcp

# Aktifkan firewall
ufw enable
ufw status
```

### Konfigurasi Fail2Ban

```bash
# Aktifkan proteksi SSH brute force
systemctl enable fail2ban
systemctl start fail2ban
```

---

## Langkah 2 — Install Docker dan Docker Compose v2

```bash
# Install Docker via script resmi
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Tambah user ke group docker (jika tidak pakai root)
usermod -aG docker $USER

# Verifikasi Docker
docker --version
# Output: Docker version 25.x.x, build ...

# Verifikasi Docker Compose v2
docker compose version
# Output: Docker Compose version v2.x.x

# Aktifkan Docker service
systemctl enable docker
systemctl start docker
```

---

## Langkah 3 — Clone Repository

```bash
# Tentukan direktori deployment
cd /opt
git clone https://github.com/<username>/smart-ai-school.git
cd smart-ai-school

# (Atau gunakan release tarball jika tidak ada akses GitHub di VPS)
# wget https://github.com/<username>/smart-ai-school/archive/refs/heads/main.tar.gz
# tar -xzf main.tar.gz && mv smart-ai-school-main smart-ai-school && cd smart-ai-school
```

---

## Langkah 4 — Konfigurasi Environment Variables

```bash
# Copy template
cp .env.example .env

# Edit file .env — ISI SEMUA NILAI
nano .env
```

**Variable yang WAJIB diisi sebelum deploy:**

```bash
# PostgreSQL
POSTGRES_PASSWORD=<min-20-karakter>

# Redis
REDIS_PASSWORD=<password-kuat>

# Keycloak admin
KC_ADMIN_PASSWORD=<password-kuat>

# Keycloak client secrets (akan diisi setelah Keycloak running — lihat Langkah 7)
KEYCLOAK_WEB_CLIENT_SECRET=GENERATE_DARI_KEYCLOAK_ADMIN
KEYCLOAK_API_CLIENT_SECRET=GENERATE_DARI_KEYCLOAK_ADMIN

# NextAuth
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://smkdarussalamsubah.sch.id

# n8n
N8N_BASIC_AUTH_PASSWORD=<password-kuat>
N8N_ENCRYPTION_KEY=<openssl rand -hex 32>

# Grafana
GRAFANA_ADMIN_PASSWORD=<password-kuat>

# MinIO
MINIO_ROOT_PASSWORD=<password-kuat>
```

**Generate semua secret sekaligus:**

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
echo "REDIS_PASSWORD=$(openssl rand -base64 32)"
echo "KC_ADMIN_PASSWORD=$(openssl rand -base64 32)"
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "N8N_BASIC_AUTH_PASSWORD=$(openssl rand -base64 32)"
echo "N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 32)"
echo "MINIO_ROOT_PASSWORD=$(openssl rand -base64 32)"
```

---

## Langkah 5 — Build Docker Images

```bash
cd /opt/smart-ai-school

# Build semua custom images (api + web)
docker compose -f infrastructure/docker/docker-compose.yml build

# Verifikasi images berhasil dibuild
docker images | grep smk
```

---

## Langkah 6 — Jalankan Docker Compose

```bash
cd /opt/smart-ai-school/infrastructure/docker

# Start semua service
docker compose up -d

# Monitor startup (tunggu 2-3 menit)
docker compose ps

# Cek logs jika ada service yang gagal
docker compose logs keycloak
docker compose logs api
docker compose logs postgres
```

### Verifikasi Semua Service Running

```bash
docker compose ps
```

Output yang diharapkan (semua `healthy` atau `running`):

```
NAME                STATUS           PORTS
smk-postgres        healthy          5432/tcp
smk-redis           healthy          6379/tcp
smk-keycloak        healthy          0.0.0.0:8080->8080/tcp
smk-api             healthy          3001/tcp
smk-web             running          3000/tcp
smk-n8n             running          5678/tcp
smk-ollama          running          11434/tcp
smk-metabase        running          3000/tcp
smk-minio           running          9000-9001/tcp
smk-uptime-kuma     running          3001/tcp
smk-prometheus      running          9090/tcp
smk-grafana         running          3000/tcp
smk-pg-backup       running          —
smk-nginx           running          0.0.0.0:80->80/tcp
```

> Keycloak memerlukan ~2 menit startup. Jika `smk-keycloak` masih `starting`, tunggu dan cek kembali.

---

## Langkah 7 — Keycloak First-Time Setup

Langkah ini **hanya dilakukan sekali** saat deployment awal.

### 7.1 Akses Admin Console

Buka browser: `http://<IP-VPS>:8080` (sementara, sebelum DNS setup)

- Username: nilai `KC_ADMIN_USER` dari `.env` (default: `admin`)
- Password: nilai `KC_ADMIN_PASSWORD` dari `.env`

### 7.2 Import Realm

Jika realm `diis` belum otomatis diimport (via `--import-realm`):

1. Admin Console → **Create Realm**
2. Upload file: `infrastructure/keycloak/realm-diis.json`
3. Klik **Create**

Verifikasi: realm `diis` muncul di dropdown kiri atas.

### 7.3 Generate Client Secrets

**Client diis-web:**
1. Pilih realm `diis`
2. Clients → `diis-web` → Credentials
3. Klik **Regenerate** → Copy secret

**Client diis-api:**
1. Clients → `diis-api` → Credentials
2. Klik **Regenerate** → Copy secret

### 7.4 Update .env dengan Client Secrets

```bash
nano /opt/smart-ai-school/.env
# Update:
# KEYCLOAK_WEB_CLIENT_SECRET=<secret-yang-dicopy>
# KEYCLOAK_API_CLIENT_SECRET=<secret-yang-dicopy>

# Restart services yang menggunakan secrets ini
cd /opt/smart-ai-school/infrastructure/docker
docker compose restart api web
```

### 7.5 Buat Admin User DIIS

1. Realm `diis` → Users → **Add user**
2. Isi username (misal: `admin.diis`)
3. Tab Credentials → Set password → **Save**
4. Tab Role Mappings → Realm Roles → assign `SUPER_ADMIN`

---

## Langkah 8 — Konfigurasi DNS + Cloudflare

### 8.1 DNS Records (di Cloudflare)

Tambahkan A records berikut (semua mengarah ke IP VPS):

| Name | Type | Value | Proxy |
|------|------|-------|-------|
| `@` (root) | A | `<IP-VPS>` | ✅ Proxied |
| `api` | A | `<IP-VPS>` | ✅ Proxied |
| `auth` | A | `<IP-VPS>` | ✅ Proxied |
| `n8n` | A | `<IP-VPS>` | ✅ Proxied |
| `analytics` | A | `<IP-VPS>` | ✅ Proxied |
| `monitor` | A | `<IP-VPS>` | ✅ Proxied |
| `status` | A | `<IP-VPS>` | ✅ Proxied |

### 8.2 SSL Setting Cloudflare

- Cloudflare Dashboard → SSL/TLS → **Full (Strict)**
- Edge Certificates → **Always Use HTTPS**: On
- Edge Certificates → **HSTS**: Enabled (max-age 6 months)

### 8.3 Verifikasi DNS

```bash
# Dari mesin lokal atau server lain
nslookup smkdarussalamsubah.sch.id
nslookup api.smkdarussalamsubah.sch.id
curl -I https://smkdarussalamsubah.sch.id
```

---

## Langkah 9 — Verifikasi Deployment

Checklist akhir — semua harus ✅ sebelum dinyatakan production-ready:

### Cek Docker Services

```bash
cd /opt/smart-ai-school/infrastructure/docker
docker compose ps
# Semua service: Up / healthy
```

### Cek Endpoints

```bash
# Web utama
curl -I https://smkdarussalamsubah.sch.id
# Expected: HTTP/2 200

# API health
curl https://api.smkdarussalamsubah.sch.id/health
# Expected: {"status":"ok"}

# Keycloak JWKS (auth)
curl https://auth.smkdarussalamsubah.sch.id/realms/diis/protocol/openid-connect/certs
# Expected: {"keys":[...]}
```

### Cek Security Headers

```bash
curl -I https://smkdarussalamsubah.sch.id | grep -i "x-frame\|x-content\|content-security"
# Expected: X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff, Content-Security-Policy: ...
```

### Cek Backup

```bash
# Lihat log backup (cron berjalan 02:00 WIB, test manual)
docker exec smk-pg-backup sh /backup.sh
docker exec smk-minio ls /data/diis-backup/
```

### Cek Login

1. Buka `https://smkdarussalamsubah.sch.id`
2. Klik **Masuk dengan Akun Sekolah**
3. Login dengan user yang dibuat di Langkah 7.5
4. Harus masuk ke `/dashboard`

---

## Langkah 10 — Setup Autostart & Monitoring

### Autostart saat Reboot VPS

```bash
# Buat systemd service untuk docker compose
cat > /etc/systemd/system/diis.service << 'EOF'
[Unit]
Description=DIIS Smart AI School
Requires=docker.service
After=docker.service

[Service]
Restart=always
WorkingDirectory=/opt/smart-ai-school/infrastructure/docker
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable diis
systemctl start diis
```

### Setup Uptime Kuma (status monitoring)

1. Buka `https://status.smkdarussalamsubah.sch.id`
2. Buat akun admin pertama kali
3. Tambahkan monitor untuk setiap service:
   - Web: `https://smkdarussalamsubah.sch.id`
   - API: `https://api.smkdarussalamsubah.sch.id/health`
   - Auth: `https://auth.smkdarussalamsubah.sch.id`
4. Konfigurasi notifikasi (WhatsApp via Fonnte, atau email)

---

## Operasional Rutin

### Update Aplikasi

```bash
cd /opt/smart-ai-school

# Pull kode terbaru
git pull origin main

# Rebuild dan restart
cd infrastructure/docker
docker compose build api web
docker compose up -d api web
```

### Melihat Logs

```bash
cd /opt/smart-ai-school/infrastructure/docker

# Semua service
docker compose logs -f

# Service tertentu
docker compose logs -f api
docker compose logs -f web
docker compose logs -f keycloak

# Log dengan timestamp
docker compose logs --timestamps api
```

### Restart Service

```bash
cd /opt/smart-ai-school/infrastructure/docker

# Restart satu service
docker compose restart api

# Restart semua
docker compose restart
```

### Cek Resource Usage

```bash
# Resource per container
docker stats

# Disk usage Docker
docker system df
```

---

## Troubleshooting

### Keycloak tidak start

```bash
docker compose logs keycloak
# Kemungkinan: POSTGRES_PASSWORD salah, atau postgres belum healthy
docker compose ps postgres  # cek postgres healthy dulu
```

### API gagal start

```bash
docker compose logs api
# Kemungkinan: DATABASE_URL atau KEYCLOAK_* salah
# Cek env validation error di log
```

### Web tidak bisa login

```bash
# 1. Cek NEXTAUTH_SECRET sudah diset
# 2. Cek KEYCLOAK_CLIENT_SECRET sesuai dengan yang di Keycloak console
# 3. Cek KEYCLOAK_ISSUER menggunakan URL publik (https://auth.*) bukan internal
docker compose logs web
```

### PostgreSQL connection refused

```bash
# PostgreSQL tidak expose port ke host — HANYA aksesibel dari Docker network
# Untuk akses lokal saat development, gunakan docker-compose.dev.yml:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# Atau SSH tunnel ke VPS:
ssh -L 5432:localhost:5432 root@<IP-VPS>
```

### Backup tidak berjalan

```bash
# Cek log backup
docker exec smk-pg-backup cat /var/log/backup.log

# Test backup manual
docker exec smk-pg-backup sh /backup.sh
```

---

## Referensi

- `docs/architecture/system-overview.md` — Arsitektur lengkap sistem
- `docs/deployment/env-variables.md` — Referensi semua environment variable
- `.env.example` — Template environment variable
- `infrastructure/docker/docker-compose.yml` — Docker Compose definition
- `infrastructure/nginx/nginx.conf` — Nginx reverse proxy config
- `CLAUDE.md` — Brief teknis dan keputusan arsitektur

---

*Dokumen ini adalah panduan untuk fresh deployment. Untuk restore database dari backup, lihat `docs/deployment/restore-database.md` (belum dibuat — Tahap 1).*
