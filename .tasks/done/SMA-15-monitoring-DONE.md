# SMA-15 — Monitoring: Grafana + /metrics (W3-02) DONE

**Branch:** `feat/SMA-15-monitoring-grafana`
**Selesai:** 2026-05-30
**Dikerjakan oleh:** Claude Code

---

## File Dibuat

| File | Keterangan |
|---|---|
| `apps/api/src/metrics/counters.ts` | Singleton `smk_http_requests_total` Counter dengan guard getSingleMetric |
| `apps/api/src/metrics/metrics.service.ts` | Wrap prom-client registry, `collectDefaultMetrics` di `onModuleInit` |
| `apps/api/src/metrics/metrics.controller.ts` | `GET /metrics`, `@Public()`, Fastify reply dengan Content-Type prom-client |
| `apps/api/src/metrics/metrics.module.ts` | `@Global()` NestJS module, export MetricsService |
| `infrastructure/docker/monitoring/grafana/dashboards/nodejs.json` | Dashboard Node.js: status, req/s, CPU, memory, event loop lag |
| `infrastructure/docker/monitoring/grafana/dashboards/postgresql.json` | Dashboard PostgreSQL: status, connections, DB size, cache hit, TPS |
| `infrastructure/docker/monitoring/grafana/dashboards/redis.json` | Dashboard Redis: status, memory, commands/s, cache hit rate, clients |
| `infrastructure/docker/monitoring/grafana/dashboards/provisioning.yml` | Grafana auto-load dashboard provider config |
| `infrastructure/docker/monitoring/grafana/datasources/prometheus.yml` | Grafana datasource Prometheus (http://prometheus:9090) |

## File Diubah

| File | Perubahan |
|---|---|
| `apps/api/src/common/interceptors/logging.interceptor.ts` | Tambah `httpRequestsTotal.inc({ method })` di tap next callback |
| `apps/api/src/app.module.ts` | Import `MetricsModule` |
| `apps/api/src/main.ts` | Tambah `'metrics'` ke exclude list global prefix |
| `infrastructure/docker/monitoring/prometheus.yml` | Fix target `api:3000` → `api:3001`, tambah `scrape_interval: 15s` |
| `apps/api/package.json` | Tambah `prom-client@^14.2.0` ke dependencies |

---

## Keputusan Teknis

**prom-client langsung vs @willsoto/nestjs-prometheus:** Menggunakan `prom-client` secara langsung (bukan `@willsoto/nestjs-prometheus`) untuk kompatibilitas penuh dengan NestJS 11 + Fastify tanpa ketergantungan tambahan. Fungsionalitas identik.

**Singleton counter guard:** `counters.ts` menggunakan `register.getSingleMetric(name)` sebelum `new Counter()` untuk mencegah error "already registered" di Jest test runners yang menggunakan modul cache yang sama (multiple test files mengimpor LoggingInterceptor).

**collectDefaultMetrics di onModuleInit:** Dibungkus `try-catch` karena prom-client melempar error jika dipanggil dua kali (contoh: NestJS hot-reload, atau test environment).

**@Res() FastifyReply:** Controller menggunakan raw Fastify reply untuk set Content-Type prom-client (`text/plain; version=0.0.4; charset=utf-8`) yang tidak ditangani otomatis oleh NestJS response wrapper.

**Grafana path:** docker-compose.yml me-mount `./monitoring/grafana/dashboards → /etc/grafana/provisioning/dashboards` (bukan `./monitoring/dashboards` seperti di brief). Dashboard dibuat di path yang benar sesuai docker-compose mount.

**`/metrics` tidak bocorkan data siswa:** Endpoint hanya expose metrik teknis (CPU, heap, HTTP count per method). Label `method` hanya berisi HTTP method (GET/POST/etc.), tidak ada data user/siswa.

---

## Bukti Runtime

```
# 1) Type-check
$ cd apps/api && npx tsc --noEmit && echo "TSC OK"
TSC OK

# 2) Test suite (lama tetap hijau)
$ npx jest
Tests: 62 passed, 62 total
Snapshots: 0 total
Time: 12.481 s

# 3) JSON dashboard valid
$ for f in infrastructure/docker/monitoring/grafana/dashboards/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('OK $f')"; done
OK infrastructure/docker/monitoring/grafana/dashboards/nodejs.json
OK infrastructure/docker/monitoring/grafana/dashboards/postgresql.json
OK infrastructure/docker/monitoring/grafana/dashboards/redis.json
```

**Catatan:** `curl http://localhost:3001/metrics` tidak bisa dijalankan karena API tidak berjalan di environment lokal (berjalan di VPS). Verifikasi runtime `/metrics 200 tanpa token` harus dilakukan di VPS setelah deploy. Langkah: `curl -sf http://localhost:3001/metrics | head -20` setelah `docker compose up -d api`.

---

## Langkah Aktivasi di VPS

1. Deploy API baru: `docker compose -f infrastructure/docker/docker-compose.yml up -d --build api`
2. Verifikasi `/metrics`: `curl -sf http://localhost:3001/metrics | head -5` → harus muncul `# HELP process_cpu_user_seconds_total`
3. Restart Prometheus: `docker compose restart prometheus` (agar load config baru)
4. Restart Grafana: `docker compose restart grafana` (agar load provisioning dashboards)
5. Buka Grafana → folder "DIIS" → 3 dashboard tersedia

---

## Catatan untuk Kang Sholah

1. **Exporter belum ada:** Dashboard PostgreSQL dan Redis membutuhkan `postgres-exporter` (port 9187) dan `redis-exporter` (port 9121). Keduanya sudah ada di `prometheus.yml` sebagai scrape target tapi belum ada di `docker-compose.yml`. Panel-panel di dashboard akan menampilkan "No data" sampai exporter ditambahkan (task terpisah di Tahap 1).

2. **Dashboard Node.js langsung jalan** karena `smk-api` sudah expose `/metrics` dan Prometheus akan scrape-nya.

3. **prom-client package size:** Menambah ~500KB ke image API (tergantung tree-shaking Docker). Acceptable untuk monitoring production.
