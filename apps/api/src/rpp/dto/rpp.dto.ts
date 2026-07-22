import { z } from 'zod';

// Modul Ajar terstruktur (Kurikulum Merdeka). Semua bagian opsional — guru mengisi
// bertahap; field tak dikenal di-strip. Disimpan di Rpp.body (JSONB).
//
// W3-1: Skema kini mencerminkan SELURUH field frontend ModulAjarBody di
// `apps/web/src/app/dashboard/akademik/_components/guru-types.ts`. Sebelumnya,
// field kaya (kegiatan.pendahuluan/inti/penutup/diferensiasi, asesmen per jenis,
// refleksi guru/siswa, lampiranUrl, durasiMenit) didiamkan di-strip secara diam-diam
// saat POST/PATCH, sehingga wizard kehilangan data pelajaran penting setelah reload.
const AtpItem = z.object({
  tpRef: z.string().max(500).optional(),
  indikator: z.string().max(2000).optional(),
});
const KegiatanItem = z.object({
  pertemuan: z.string().max(120).optional(),
  deskripsi: z.string().max(20_000).optional(),          // legacy: deskripsi bebas
  pendahuluan: z.string().max(10_000).optional(),        // kegiatan pendahuluan
  inti: z.string().max(20_000).optional(),               // kegiatan inti
  penutup: z.string().max(10_000).optional(),            // kegiatan penutup
  diferensiasi: z.string().max(10_000).optional(),       // strategi diferensiasi
});
export const ModulAjarBodySchema = z.object({
  fase: z.string().max(20).optional(),
  pengembang: z.string().max(200).optional(),
  jpAllocation: z.coerce.number().int().min(1).max(100).nullish(),
  kktp: z.coerce.number().int().min(0).max(100).nullish(),
  cp: z.string().max(10_000).optional(),
  kompetensiAwal: z.string().max(5_000).optional(),
  tp: z.array(z.string().max(1_000)).max(50).optional(),
  atpUraian: z.string().max(10_000).optional(),
  atp: z.array(AtpItem).max(50).optional(),
  profilDimensi: z.array(z.string().max(100)).max(20).optional(),
  profilUraian: z.string().max(5_000).optional(),
  sarana: z.string().max(5_000).optional(),
  target: z.string().max(2_000).optional(),
  model: z.string().max(200).optional(),
  kegiatan: z.array(KegiatanItem).max(40).optional(),
  asesmen: z.string().max(20_000).optional(),            // legacy: rencana asesmen bebas
  asesmenDiagnostik: z.string().max(10_000).optional(),  // jenis + deskripsi diagnostik
  asesmenFormatif: z.string().max(10_000).optional(),    // jenis + deskripsi formatif
  asesmenSumatif: z.string().max(10_000).optional(),     // jenis + deskripsi sumatif
  pengayaan: z.string().max(10_000).optional(),
  remedial: z.string().max(10_000).optional(),
  refleksi: z.string().max(10_000).optional(),           // legacy: refleksi gabungan
  refleksiGuru: z.string().max(10_000).optional(),       // pertanyaan refleksi guru
  refleksiSiswa: z.string().max(10_000).optional(),      // pertanyaan refleksi siswa
  lampiran: z.string().max(20_000).optional(),           // catatan lampiran (teks)
  lampiranUrl: z.string().max(2000).optional(),          // URL eksternal (video/drive)
  durasiMenit: z.coerce.number().int().min(1).max(600).nullish(), // durasi per JP (menit)
});
export type ModulAjarBody = z.infer<typeof ModulAjarBodySchema>;

export const CreateRppSchema = z.object({
  subject: z.string().trim().min(2).max(100),
  title: z.string().trim().min(3).max(255),
  content: z.string().trim().max(100_000).nullish(),
  body: ModulAjarBodySchema.nullish(),
  fileUrl: z.string().url().max(2000).nullish(),
  classId: z.string().uuid().nullish(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: YYYY/YYYY'),
  semester: z.coerce.number().int().min(1).max(2),
  submit: z.boolean().default(false), // true = langsung submitted
});
export type CreateRppDto = z.infer<typeof CreateRppSchema>;

export const UpdateRppSchema = CreateRppSchema.omit({ submit: true }).partial();
export type UpdateRppDto = z.infer<typeof UpdateRppSchema>;

export const ReviewRppSchema = z.object({
  decision: z.enum(['approved', 'revision']),
  note: z.string().trim().max(5000).nullish(),
}).refine((d) => d.decision !== 'revision' || (d.note && d.note.length >= 3), {
  message: 'Keputusan revisi wajib disertai catatan untuk guru',
  path: ['note'],
});
export type ReviewRppDto = z.infer<typeof ReviewRppSchema>;

export const ListRppQuerySchema = z.object({
  status: z.enum(['draft', 'submitted', 'approved', 'revision']).optional(),
  teacherId: z.string().uuid().optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListRppQueryDto = z.infer<typeof ListRppQuerySchema>;
