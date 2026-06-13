#!/usr/bin/env npx ts-node
// =============================================================================
// test-wa-rate.ts — Uji rate Fonnte via antrian BullMQ
//
// ENV-gated: harus set WA_RATE_TEST=1 untuk berjalan (cegah eksekusi tidak sengaja).
// Kirim N pesan uji ke SATU nomor Director via antrian BullMQ existing.
// Ukur: sukses / throttle / latency end-to-end.
//
// Penggunaan (manual oleh Director):
//   WA_RATE_TEST=1 WA_TEST_TO=628xxxxxxxxxx FONNTE_API_KEY=xxx \
//     REDIS_URL=redis://:pass@localhost:6379 \
//     npx ts-node --project apps/api/tsconfig.json scripts/test-wa-rate.ts
//
// Env wajib:
//   WA_RATE_TEST  = "1"  (guard — JANGAN di CI)
//   WA_TEST_TO    = nomor WhatsApp tujuan (format E.164, mis. 6281234567890)
//   FONNTE_API_KEY = API key Fonnte
//   REDIS_URL     = URL Redis BullMQ
//
// Env opsional:
//   WA_RATE_N     = jumlah pesan (default 50)
//   WA_RATE_DELAY = jeda antar-enqueue dalam ms (default 200)
// =============================================================================

import { Queue, QueueEvents } from 'bullmq';

// ── Guard ENV ─────────────────────────────────────────────────────────────────

if (process.env.WA_RATE_TEST !== '1') {
  console.error('[test-wa-rate] ERROR: Set WA_RATE_TEST=1 untuk menjalankan skrip ini.');
  console.error('  JANGAN jalankan di CI atau production tanpa koordinasi Director.');
  process.exit(1);
}

const WA_TO = process.env.WA_TEST_TO ?? '';
const FONNTE_KEY = process.env.FONNTE_API_KEY ?? '';
const REDIS_URL_RAW = process.env.REDIS_URL ?? 'redis://localhost:6379';
const N = parseInt(process.env.WA_RATE_N ?? '50', 10);
const DELAY_MS = parseInt(process.env.WA_RATE_DELAY ?? '200', 10);

if (!WA_TO) {
  console.error('[test-wa-rate] ERROR: WA_TEST_TO harus di-set (nomor tujuan uji)');
  process.exit(1);
}

if (!FONNTE_KEY) {
  console.error('[test-wa-rate] ERROR: FONNTE_API_KEY harus di-set');
  process.exit(1);
}

// ── Parse Redis URL ───────────────────────────────────────────────────────────

function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '6379', 10),
    password: u.password ? decodeURIComponent(u.password) : undefined,
  };
}

const redisConn = parseRedisUrl(REDIS_URL_RAW);

// ── Main ──────────────────────────────────────────────────────────────────────

type NotifJob = {
  logId: string;
  channel: 'whatsapp' | 'email';
  to: string;
  body: string;
  subject?: string;
};

const QUEUE_NAME = 'notification';

async function main() {
  console.log(`\n=== UJI RATE FONNTE ===`);
  console.log(`Target    : ${WA_TO}`);
  console.log(`Jumlah    : ${N} pesan`);
  console.log(`Jeda enqueue: ${DELAY_MS} ms`);
  console.log(`Redis     : ${redisConn.host}:${redisConn.port}`);
  console.log(`Dimulai   : ${new Date().toISOString()}\n`);

  const queue = new Queue<NotifJob>(QUEUE_NAME, { connection: redisConn as never });
  const queueEvents = new QueueEvents(QUEUE_NAME, { connection: redisConn as never });

  const jobIds: string[] = [];
  const startMs = Date.now();

  // ── Enqueue pesan ──────────────────────────────────────────────────────────

  console.log('[1/3] Enqueue pesan...');
  for (let i = 1; i <= N; i++) {
    const job = await queue.add('send', {
      logId: `wa-rate-test-${Date.now()}-${i}`,
      channel: 'whatsapp',
      to: WA_TO,
      body: `[DIIS UJI RATE #${i}/${N}] Pesan ini adalah bagian dari pengujian rate Fonnte. Abaikan. (${new Date().toISOString()})`,
    }, {
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 3600 },
    });
    jobIds.push(job.id!);
    if (i % 10 === 0) process.stdout.write(`  Enqueue ${i}/${N}...\n`);
    if (DELAY_MS > 0) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const enqueueMs = Date.now() - startMs;
  console.log(`[1/3] Selesai enqueue ${N} pesan dalam ${enqueueMs}ms\n`);

  // ── Tunggu semua job selesai ───────────────────────────────────────────────

  console.log('[2/3] Menunggu job selesai (timeout 5 menit)...');
  const TIMEOUT_MS = 5 * 60 * 1000;
  const pollStart = Date.now();

  const results = new Map<string, 'completed' | 'failed'>();

  await new Promise<void>((resolve) => {
    queueEvents.on('completed', ({ jobId }) => {
      if (jobIds.includes(jobId)) results.set(jobId, 'completed');
      if (results.size === N) resolve();
    });
    queueEvents.on('failed', ({ jobId }) => {
      if (jobIds.includes(jobId)) results.set(jobId, 'failed');
      if (results.size === N) resolve();
    });

    // Fallback timeout
    setTimeout(() => resolve(), TIMEOUT_MS);
  });

  const waitMs = Date.now() - pollStart;

  // ── Hitung hasil ───────────────────────────────────────────────────────────

  let sukses = 0;
  let gagal = 0;
  let belumSelesai = 0;

  for (const id of jobIds) {
    const r = results.get(id);
    if (r === 'completed') sukses++;
    else if (r === 'failed') gagal++;
    else belumSelesai++;
  }

  const totalMs = Date.now() - startMs;

  // ── Laporan ────────────────────────────────────────────────────────────────

  console.log('\n=== RINGKASAN UJI RATE FONNTE ===');
  console.log(`Waktu total        : ${totalMs} ms`);
  console.log(`Waktu tunggu worker: ${waitMs} ms`);
  console.log(`Total pesan        : ${N}`);
  console.log(`Sukses             : ${sukses}`);
  console.log(`Gagal              : ${gagal}`);
  console.log(`Belum selesai      : ${belumSelesai}`);
  console.log(`Success rate       : ${((sukses / N) * 100).toFixed(1)}%`);
  if (sukses > 0) {
    console.log(`Rata-rata latency  : ${(waitMs / sukses).toFixed(0)} ms/pesan`);
  }
  console.log('=================================\n');

  if (gagal > 0) {
    console.warn(`WARN: ${gagal} pesan gagal — cek log worker BullMQ untuk detail`);
  }
  if (belumSelesai > 0) {
    console.warn(`WARN: ${belumSelesai} pesan belum selesai dalam batas waktu — worker mungkin lambat atau mati`);
  }

  await queue.close();
  await queueEvents.close();
  process.exit(gagal > 0 || belumSelesai > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[test-wa-rate] ERROR:', err);
  process.exit(1);
});
