// =============================================================================
// analytics.math.ts — Helper statistik MURNI (tanpa DB) untuk Dasbor Eksekutif.
// Dipisah agar mudah di-unit-test tanpa mock Prisma.
// =============================================================================

/** Ambang ketuntasan minimal default (KKM). TODO: pindah ke pengaturan sekolah/per-mapel. */
export const KKM_DEFAULT = 75;

/** Bobot Nilai Akhir (NA) — konsisten dengan lib/academic.ts (frontend). */
export const NA_WEIGHTS = { uh: 0.20, praktik: 0.25, sikap: 0.15, uts: 0.20, uas: 0.20 } as const;

export interface NaComponents {
  uh?: number;
  praktik?: number;
  sikap?: number;
  uts?: number;
  uas?: number;
}

/**
 * Hitung Nilai Akhir (NA) dari komponen nilai.
 * Hanya komponen yang terdefinisi (bukan undefined) yang diikutsertakan.
 * Bobot direnormalisasi sehingga total = 1.
 * Mengembalikan null bila tidak ada komponen terdefinisi.
 */
export function naOf(components: NaComponents): number | null {
  const keys = Object.keys(NA_WEIGHTS) as (keyof typeof NA_WEIGHTS)[];
  const defined = keys.filter((k) => components[k] !== undefined);
  if (defined.length === 0) return null;
  const totalWeight = defined.reduce((sum, k) => sum + NA_WEIGHTS[k], 0);
  const weightedSum = defined.reduce((sum, k) => sum + (components[k] ?? 0) * NA_WEIGHTS[k], 0);
  return Math.round(weightedSum / totalWeight);
}

/** Bucket umur tunggakan SPP (hari). */
export const AGING_BUCKETS = [
  { key: '0-30', label: '0–30 hari', maxDays: 30 },
  { key: '30-60', label: '30–60 hari', maxDays: 60 },
  { key: '60-90', label: '60–90 hari', maxDays: 90 },
  { key: '90+', label: '> 90 hari', maxDays: Infinity },
] as const;

/** Ambang "siswa berisiko": minimal jumlah alpha dalam jendela hari tertentu. */
export const AT_RISK_ALPHA_MIN = 3;
export const AT_RISK_WINDOW_DAYS = 30;

export interface Summary {
  count: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
}

export function mean(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Kuantil dengan interpolasi linear (metode "linear" / R-7, sama seperti numpy default).
 * @param q antara 0 dan 1.
 */
export function quantile(nums: readonly number[], q: number): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

export function median(nums: readonly number[]): number {
  return quantile(nums, 0.5);
}

/** Ringkasan distribusi (untuk box-plot): count, mean, median, Q1, Q3, min, max. */
export function summarize(nums: readonly number[]): Summary {
  if (nums.length === 0) {
    return { count: 0, mean: 0, median: 0, q1: 0, q3: 0, min: 0, max: 0 };
  }
  const sorted = [...nums].sort((a, b) => a - b);
  return {
    count: sorted.length,
    mean: round1(mean(sorted)),
    median: round1(median(sorted)),
    q1: round1(quantile(sorted, 0.25)),
    q3: round1(quantile(sorted, 0.75)),
    min: round1(sorted[0]!),
    max: round1(sorted[sorted.length - 1]!),
  };
}

/** Persentase nilai yang ≥ ambang KKM (0–100). */
export function kkmPassRate(scores: readonly number[], kkm: number = KKM_DEFAULT): number {
  if (scores.length === 0) return 0;
  const passed = scores.filter((s) => s >= kkm).length;
  return round1((passed / scores.length) * 100);
}

/**
 * Koefisien korelasi Pearson antara dua deret sejajar. Mengembalikan 0 bila
 * varians salah satu deret nol atau panjang < 2.
 */
export function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  if (den === 0) return 0;
  return round2(num / den);
}

/** Index bucket aging untuk umur tunggakan (hari) → 0..3. */
export function agingBucketIndex(ageDays: number): number {
  for (let i = 0; i < AGING_BUCKETS.length; i++) {
    if (ageDays <= AGING_BUCKETS[i]!.maxDays) return i;
  }
  return AGING_BUCKETS.length - 1;
}

/** Selisih hari kalender (a - b), dibulatkan ke bawah. */
export function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
