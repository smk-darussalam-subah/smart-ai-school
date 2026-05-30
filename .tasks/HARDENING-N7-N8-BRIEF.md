# HARDENING MENDESAK — Brief Siap-Eksekusi (Insiden 30 Mei 2026)

> **Untuk:** Claude Code · **Sumber kebenaran status:** `.tasks/queue.md`
> **Latar:** 30 Mei 2026 situs sempat **down (521)** setelah reboot VPS. Akar masalah:
> nginx reverse proxy **tidak ada di docker-compose** → tidak naik otomatis. Dipulihkan
> sementara dengan `docker run` manual (`smk-nginx`). Brief ini mengubah tambalan itu jadi
> solusi permanen di git. **Patuh O-02: bukti runtime sebelum ✅.**
>
> Konteks VPS: folder `/home/appuser/smart-ai-school`, compose dir `infrastructure/docker`,
> network = network milik service `smk-api`. Cloudflare saat ini mode **Flexible** (sementara).

---

## ▶ N-8 — Kodifikasi nginx ke docker-compose (Model: Sonnet 4.5+ · ~45 mnt)

**Branch:** `fix/N8-nginx-in-compose`

### Masalah
`infrastructure/nginx/nginx.conf` ada, tapi **tidak ada service `nginx`** di
`infrastructure/docker/docker-compose.yml`. Akibatnya proxy tidak dikelola compose, tanpa
restart policy, dan hilang tiap reboot → Single Point of Failure yang menjatuhkan seluruh situs.

### Yang dikerjakan
1. Tambah service `nginx` di `infrastructure/docker/docker-compose.yml`:
   ```yaml
   nginx:
     image: nginx:alpine
     container_name: smk-nginx
     restart: unless-stopped
     ports:
       - "80:80"
       # - "443:443"   # diaktifkan di N-7 setelah origin cert siap
     volumes:
       - ../nginx/nginx.conf:/etc/nginx/nginx.conf:ro
       # - ../nginx/certs:/etc/nginx/certs:ro   # untuk N-7
     depends_on:
       - web
       - api
       - keycloak
       - n8n
       - metabase
       - grafana
       - uptime-kuma
     networks:
       - smk-network        # samakan dengan network service lain di file ini
   ```
   Catatan: cek nama network yang dipakai service `api`/`web` di file ini dan samakan persis.
2. Perbaiki web server block di `infrastructure/nginx/nginx.conf`:
   ganti `proxy_set_header X-Forwarded-Proto $scheme;` → `proxy_set_header X-Forwarded-Proto https;`
   (di belakang Cloudflare, TLS selalu diterminasi di edge — mencegah redirect-loop saat nanti Full Strict).
3. Hapus atribut `version:` usang di atas file (memunculkan warning compose) — opsional, kalau ada.

### Constraint
- JANGAN ubah service lain, port lain, atau nginx.conf di luar baris X-Forwarded-Proto.
- JANGAN commit secret/cert.

### Runtime Verification (WAJIB — jalankan di VPS, tempel output)
```bash
# 0) Validasi compose
cd /home/appuser/smart-ai-school/infrastructure/docker && docker compose config >/dev/null && echo "COMPOSE OK"
# 1) TRANSISI ANTI-BENTROK: hapus nginx manual dulu (port 80 dipakai dia)
docker rm -f smk-nginx
# 2) Buat nginx versi compose
docker compose up -d nginx
docker ps | grep smk-nginx          # harus Up, 0.0.0.0:80->80
# 3) Bukti proxy hidup
curl -s -o /dev/null -w "web=%{http_code}\n"  -H "Host: smkdarussalamsubah.sch.id" http://localhost/login
curl -s -o /dev/null -w "api=%{http_code}\n"  -H "Host: api.smkdarussalamsubah.sch.id" http://localhost/health
# 4) Bukti SURVIVE: simulasikan kondisi reboot
docker compose down && docker compose up -d && sleep 15 && docker ps | grep smk-nginx
# nginx harus otomatis Up tanpa intervensi manual
```
Target: web=200, api=200, dan setelah `down`+`up` nginx **otomatis hidup**.

### Definition of Done
- [ ] Service nginx ada di compose; `docker compose down && up` → nginx otomatis Up (bukti di laporan).
- [ ] curl web/api 200 via proxy. Cek juga `https://smkdarussalamsubah.sch.id` dari luar tetap hidup.
- [ ] `.tasks/done/N8-nginx-compose-DONE.md` + update queue.md (tutup N-8).

---

## ▶ N-7 — TLS origin (Cloudflare Origin Cert + Full Strict) (Model: Sonnet · ~1 jam)

**Branch:** `fix/N7-origin-tls`  ·  **Kerjakan SETELAH N-8 merged.**

### Masalah
Origin hanya melayani HTTP :80; Cloudflare dipaksa **Flexible** → trafik CF↔origin **tidak
terenkripsi**. Tidak layak untuk data siswa (relevan UU PDP / temuan R-01).

### Yang dikerjakan
1. **(Manual, oleh Kang Sholah di dashboard Cloudflare)** SSL/TLS → Origin Server →
   Create Certificate → simpan `origin.pem` + `origin.key` ke VPS `infrastructure/nginx/certs/`
   (folder ini di-gitignore — JANGAN commit key).
2. Tambah server block `listen 443 ssl;` di nginx.conf untuk tiap subdomain (web, api, auth, dst),
   `ssl_certificate /etc/nginx/certs/origin.pem; ssl_certificate_key /etc/nginx/certs/origin.key;`
   plus redirect `listen 80` → 443.
3. Aktifkan `- "443:443"` + mount `certs` di service nginx compose (komentar dari N-8).
4. **(Manual)** Set Cloudflare SSL/TLS mode → **Full (Strict)**.

### Constraint
- `infrastructure/nginx/certs/` WAJIB masuk `.gitignore`. Private key tidak boleh ke git.

### Runtime Verification (WAJIB)
```bash
docker compose up -d nginx
# origin layani TLS 443
curl -sk -o /dev/null -w "%{http_code}\n" -H "Host: smkdarussalamsubah.sch.id" https://localhost/login   # 200
# dari luar setelah Cloudflare Full Strict
curl -s -o /dev/null -w "%{http_code}\n" https://smkdarussalamsubah.sch.id        # 200/307
curl -s -o /dev/null -w "%{http_code}\n" https://api.smkdarussalamsubah.sch.id/health  # 200
```

### Definition of Done
- [ ] Origin melayani 443 dengan origin cert; Cloudflare Full (Strict); situs tetap hijau.
- [ ] `certs/` tergitignore; tidak ada key di repo (`git log -p | grep -i "BEGIN.*PRIVATE KEY"` → kosong).
- [ ] `.tasks/done/N7-origin-tls-DONE.md` + update queue.md (tutup N-7).

---

## Pencegahan agar tidak terulang
- Tambah Uptime Kuma monitor untuk `https://smkdarussalamsubah.sch.id` + alert (sudah ada service uptime-kuma).
- Pertimbangkan healthcheck pada service nginx di compose.
- Setelah N-7, jadwalkan reboot maintenance (pesan "System restart required" masih ada) — verifikasi situs auto-pulih.

*Disusun System Analyst — 30 Mei 2026. Akar insiden 521 = N-8.*
