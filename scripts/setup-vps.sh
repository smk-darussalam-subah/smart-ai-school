#!/bin/bash
# =============================================================================
# SETUP VPS — Smart AI School (SMK Darussalam Subah)
# Target: Hetzner VPS, Ubuntu 22.04 LTS
# Domain: smkdarussalamsubah.sch.id
# Jalankan sebagai root setelah VPS pertama kali aktif
# =============================================================================

set -euo pipefail  # Exit on error, unset var, pipe failure

# --- Warna output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()   { echo -e "${YELLOW}[⚠]${NC} $1"; }
error()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
section(){ echo -e "\n${BLUE}══════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}══════════════════════════════════════${NC}"; }

# =============================================================================
# STEP 1: UPDATE SISTEM
# =============================================================================
section "STEP 1: Update Sistem"
apt update && apt upgrade -y
apt install -y curl wget git vim ufw htop net-tools unzip
log "Sistem berhasil diupdate"

# =============================================================================
# STEP 2: INSTALL DOCKER
# =============================================================================
section "STEP 2: Install Docker Engine"

# Hapus versi lama jika ada
apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Install dari repo resmi Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verifikasi instalasi
docker --version && log "Docker terinstall: $(docker --version)"
docker compose version && log "Docker Compose terinstall: $(docker compose version)"

# =============================================================================
# STEP 3: BUAT USER NON-ROOT 'appuser'
# =============================================================================
section "STEP 3: Buat User 'appuser'"

if id "appuser" &>/dev/null; then
    warn "User 'appuser' sudah ada, skip pembuatan"
else
    useradd -m -s /bin/bash appuser
    usermod -aG docker appuser
    usermod -aG sudo appuser

    # Set password — GANTI PASSWORD INI!
    echo "appuser:SmkDarussalamAI2026!" | chpasswd
    warn "Password default appuser: SmkDarussalamAI2026! — SEGERA GANTI setelah login!"
    log "User 'appuser' berhasil dibuat"
fi

# =============================================================================
# STEP 4: SETUP SSH KEY UNTUK appuser
# =============================================================================
section "STEP 4: Setup SSH"

# Nonaktifkan login SSH dengan password untuk root
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Setup direktori SSH untuk appuser
mkdir -p /home/appuser/.ssh
chmod 700 /home/appuser/.ssh
chown appuser:appuser /home/appuser/.ssh

log "SSH root login dinonaktifkan"
warn "Pastikan Anda sudah punya SSH key sebelum logout!"
warn "Tambahkan public key ke /home/appuser/.ssh/authorized_keys sebelum restart SSH"

# =============================================================================
# STEP 5: KONFIGURASI FIREWALL (UFW)
# =============================================================================
section "STEP 5: Konfigurasi Firewall UFW"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Izinkan SSH, HTTP, HTTPS saja
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Port internal Docker (TIDAK diexpose ke publik)
# 5432 (PostgreSQL), 6379 (Redis), 8080 (Keycloak), 5678 (n8n)
# Semua diakses lewat Docker network internal

ufw --force enable
ufw status verbose
log "Firewall UFW aktif — hanya port 22, 80, 443 terbuka"

# =============================================================================
# STEP 6: INSTALL & KONFIGURASI FAIL2BAN
# =============================================================================
section "STEP 6: Install Fail2Ban (Anti Brute-Force)"

apt install -y fail2ban

# Konfigurasi jail lokal
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
logpath  = %(sshd_log)s
maxretry = 3
bantime  = 7200
EOF

systemctl enable fail2ban
systemctl restart fail2ban
log "Fail2Ban aktif — SSH max 3 percobaan, ban 2 jam"

# =============================================================================
# STEP 7: SETUP DIREKTORI APLIKASI
# =============================================================================
section "STEP 7: Setup Direktori Aplikasi"

APP_DIR="/home/appuser/smart-ai-school"
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/logs"
mkdir -p "$APP_DIR/backups"
mkdir -p "$APP_DIR/data/postgres"
mkdir -p "$APP_DIR/data/redis"
mkdir -p "$APP_DIR/data/n8n"
mkdir -p "$APP_DIR/data/ollama"
mkdir -p "$APP_DIR/data/keycloak"

chown -R appuser:appuser /home/appuser/smart-ai-school
log "Direktori aplikasi dibuat di $APP_DIR"

# =============================================================================
# STEP 8: INSTALL NGINX (sebagai reverse proxy)
# =============================================================================
section "STEP 8: Install Nginx"

apt install -y nginx
systemctl enable nginx
log "Nginx terinstall dan aktif"

# =============================================================================
# STEP 9: SETUP SWAP (berguna untuk VPS 4GB RAM)
# =============================================================================
section "STEP 9: Setup Swap Memory"

if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    log "Swap 2GB ditambahkan"
else
    warn "Swap sudah ada, skip"
fi

# =============================================================================
# STEP 10: INSTALL CERTBOT (untuk SSL jika tidak pakai Cloudflare)
# =============================================================================
section "STEP 10: Install Certbot"
apt install -y certbot python3-certbot-nginx
log "Certbot terinstall (backup SSL jika Cloudflare tidak digunakan)"

# =============================================================================
# STEP 11: OPTIMASI SISTEM
# =============================================================================
section "STEP 11: Optimasi Sistem"

# Tingkatkan limit file descriptor
cat >> /etc/security/limits.conf << 'EOF'
* soft nofile 65536
* hard nofile 65536
EOF

# Optimasi TCP
cat >> /etc/sysctl.conf << 'EOF'
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
EOF

sysctl -p
log "Optimasi sistem selesai"

# =============================================================================
# SELESAI
# =============================================================================
section "SETUP VPS SELESAI!"

echo ""
echo -e "${GREEN}✅ Semua langkah berhasil diselesaikan!${NC}"
echo ""
echo -e "${YELLOW}LANGKAH SELANJUTNYA (lakukan secara manual):${NC}"
echo "1. Tambahkan SSH public key ke /home/appuser/.ssh/authorized_keys"
echo "2. Ganti password appuser: passwd appuser"
echo "3. Arahkan domain smkdarussalamsubah.sch.id ke IP VPS ini via Cloudflare"
echo "4. Clone repo: cd /home/appuser && git clone [repo-url] smart-ai-school"
echo "5. Copy .env.production ke /home/appuser/smart-ai-school/.env"
echo "6. Jalankan: docker compose up -d"
echo ""
echo -e "${BLUE}IP Server ini: $(curl -s https://api.ipify.org)${NC}"
echo -e "${BLUE}Catat IP ini untuk konfigurasi Cloudflare DNS!${NC}"
