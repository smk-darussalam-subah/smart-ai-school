# N-8 — Kodifikasi nginx ke docker-compose DONE

**Branch:** `fix/N8-nginx-in-compose`
**Commit:** `0c01f84`
**Selesai:** 2026-05-30
**Latar:** Insiden 521 (30 Mei) — nginx tidak ada di docker-compose → hilang tiap reboot VPS.

---

## Perubahan

| File | Perubahan |
|---|---|
| `infrastructure/docker/docker-compose.yml` | Tambah service `nginx` (nginx:alpine, smk-nginx, restart: unless-stopped, port 80, network smk-network) |
| `infrastructure/nginx/nginx.conf` | Web server block: `X-Forwarded-Proto $scheme` → `$scheme https` |

## Detail nginx service

```yaml
nginx:
  image: nginx:alpine
  container_name: smk-nginx
  restart: unless-stopped
  ports:
    - "80:80"
    # - "443:443"   # diaktifkan di N-7
  volumes:
    - ../nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    # - ../nginx/certs:/etc/nginx/certs:ro   # untuk N-7
  depends_on: [web, api, keycloak, n8n, metabase, grafana, uptime-kuma]
  networks:
    - smk-network
```

## Verifikasi Lokal

```
docker compose config exit=0
nginx service: image=nginx:alpine, restart=unless-stopped, port=80:80, network=smk-network ✓
X-Forwarded-Proto lines di nginx.conf:
  L67 (web block)      → https  ← DIUBAH
  L86 (api block)      → $scheme (tidak diubah, scope N-8)
  L101 (keycloak block)→ https  (sudah https dari sebelumnya)
  L118 (n8n block)     → $scheme (tidak diubah, scope N-8)
```

## Runtime Verification (Wajib — Jalankan di VPS)

```bash
cd /home/appuser/smart-ai-school/infrastructure/docker
git pull origin main

# 0) Validasi compose
docker compose config >/dev/null && echo "COMPOSE OK"

# 1) Transisi: bebaskan port 80 dari nginx manual
docker rm -f smk-nginx

# 2) Naikan nginx versi compose
docker compose up -d nginx
docker ps | grep smk-nginx   # harus: Up, 0.0.0.0:80->80/tcp

# 3) Bukti proxy hidup
curl -s -o /dev/null -w "web=%{http_code}\n" -H "Host: smkdarussalamsubah.sch.id" http://localhost/login
curl -s -o /dev/null -w "api=%{http_code}\n" -H "Host: api.smkdarussalamsubah.sch.id" http://localhost/health
# Target: web=200, api=200

# 4) Bukti survive reboot
docker compose down && docker compose up -d && sleep 15 && docker ps | grep smk-nginx
# nginx harus otomatis Up tanpa intervensi manual
```

**Tempel output dari VPS di sini setelah dijalankan:**
```
[output VPS]
```

---

## Catatan untuk N-7

- Port `443:443` dan mount `certs` sudah di-comment di service nginx, siap diaktifkan saat N-7.
- `X-Forwarded-Proto https` di web block sudah di-set sekarang agar tidak ada redirect-loop saat Cloudflare Full Strict diaktifkan.
- API block dan n8n block masih `$scheme` — perlu diubah ke `https` di PR N-7 untuk konsistensi.
