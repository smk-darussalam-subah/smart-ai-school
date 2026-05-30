# N-7 — TLS Origin (Cloudflare Origin Cert + Full Strict) DONE

**Branch:** `fix/N7-origin-tls`
**Selesai:** 2026-05-30

---

## Perubahan

| File | Perubahan |
|---|---|
| `.gitignore` | Tambah `infrastructure/nginx/certs/` — key tidak boleh masuk git |
| `infrastructure/nginx/nginx.conf` | 7 server block dipecah: 80→redirect, 443 ssl→proxy. `ssl_certificate` sekali di `http{}`. Semua `X-Forwarded-Proto` = `https`. |
| `infrastructure/docker/docker-compose.yml` | Aktifkan `- "443:443"` dan `- ../nginx/certs:/etc/nginx/certs:ro` |

## Langkah Manual di VPS (Kang Sholah)

1. **Cloudflare:** SSL/TLS → Origin Server → Create Certificate → pilih validity 15 tahun
   - Hostnames: `smkdarussalamsubah.sch.id`, `*.smkdarussalamsubah.sch.id`
   - Simpan `origin.pem` dan `origin.key`

2. **VPS:** Upload ke folder yang benar
   ```bash
   mkdir -p /home/appuser/smart-ai-school/infrastructure/nginx/certs
   # upload origin.pem + origin.key ke folder ini via scp/sftp
   chmod 600 /home/appuser/smart-ai-school/infrastructure/nginx/certs/origin.key
   chmod 644 /home/appuser/smart-ai-school/infrastructure/nginx/certs/origin.pem
   ```

3. **Deploy:** pull + restart nginx
   ```bash
   cd /home/appuser/smart-ai-school
   git pull origin main
   cd infrastructure/docker
   docker compose up -d --no-deps nginx
   docker exec smk-nginx nginx -s reload
   ```

4. **Cloudflare:** SSL/TLS → Overview → ubah mode ke **Full (Strict)**

## Runtime Verification (wajib — jalankan di VPS setelah langkah manual selesai)

```bash
# Origin melayani 443
curl -sk -o /dev/null -w "https-local=%{http_code}\n" \
  -H "Host: smkdarussalamsubah.sch.id" https://localhost/login

# Dari luar (setelah Cloudflare Full Strict aktif)
curl -s -o /dev/null -w "web=%{http_code}\n"  https://smkdarussalamsubah.sch.id
curl -s -o /dev/null -w "api=%{http_code}\n"  https://api.smkdarussalamsubah.sch.id/health

# Redirect HTTP → HTTPS
curl -s -o /dev/null -w "redirect=%{http_code}\n" http://smkdarussalamsubah.sch.id

# Tidak ada key di repo
git log -p | grep -i "BEGIN.*PRIVATE KEY"   # harus kosong
```

Target: `https-local=200/307`, `web=200/307`, `api=200`, `redirect=301`, grep kosong.

## Verifikasi Lokal (sudah dilakukan)

```
certs/ di .gitignore         ✓
443:443 di compose           ✓
docker compose config exit=0 ✓
X-Forwarded-Proto https (7×) ✓
listen 80 redirect (7×)      ✓
listen 443 ssl (7×)          ✓
```
