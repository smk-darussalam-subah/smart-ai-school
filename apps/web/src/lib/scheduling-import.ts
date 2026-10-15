import { z } from 'zod';

export const fileLimit = 512 * 1024;
export const ImportFileSchema = z.object({ format: z.enum(['CSV', 'XLSX']), contentBase64: z.string(),
  sheet: z.number(), headerRow: z.number(), delimiter: z.enum([',', ';', '\t']) });
export const CatalogSchema = z.object({ assignments: z.array(z.object({ id: z.string().uuid(),
  subject: z.string(), targetJp: z.number(), className: z.string(), teacherName: z.string() })) });
export const InspectSchema = z.object({ headers: z.array(z.string()), sheets: z.array(z.string()), rowCount: z.number(),
  fileSha256: z.string(), sample: z.array(z.object({ row: z.number(), values: z.array(z.string()) })) });
export const ImportResultSchema = z.object({ previewDigest: z.string(), inputDigest: z.string(), rowCount: z.number(),
  parsedSlotCount: z.number(), sources: z.array(z.string()), commitAllowed: z.boolean(), publishable: z.literal(false),
  solverStatus: z.null(), errors: z.array(z.object({ code: z.string(), row: z.number(), field: z.string().optional() })),
  warnings: z.array(z.object({ code: z.string(), assignmentId: z.string().optional() })),
  coverage: z.array(z.object({ assignmentId: z.string(), targetJp: z.number(), allocatedJp: z.number(), missingJp: z.number() })),
  slots: z.array(z.object({ assignmentId: z.string(), dayOfWeek: z.number(), jpStart: z.number(), jpEnd: z.number(), roomLabel: z.string().nullable() })),
  notVerified: z.array(z.string()) });
export const ImportAckSchema = z.object({ id: z.string().uuid(), revision: z.number(), status: z.literal('DRAFT'),
  acknowledgmentOnly: z.literal(true), published: z.literal(false), replayed: z.boolean() });
export type ImportFile = z.infer<typeof ImportFileSchema>;
export type ImportResult = z.infer<typeof ImportResultSchema>;
export type ImportCatalog = z.infer<typeof CatalogSchema>['assignments'];

/** No credentials/identity supplied by caller; the shared proxy resolves the session. */
export async function importRequest<T extends z.ZodTypeAny>(operation: 'inspect' | 'catalog' | 'preview' | 'commit',
  body: unknown, schema: T, key?: string): Promise<z.infer<T>> {
  let response: Response;
  try { response = await fetch(`/api/backend/scheduling/imports/${operation}`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
    body: JSON.stringify(body),
  }); } catch { throw new Error('Layanan impor belum dapat dihubungi. Coba lagi.'); }
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Sesi berakhir. Masuk kembali sebelum melanjutkan.',
      403: 'Akses draft tidak tersedia. Hubungi administrator.',
      409: 'Data atau pratinjau berubah. Validasi ulang sebelum menyimpan.',
      400: 'File atau pemetaan tidak valid. Periksa format, kolom, dan batas file.',
      413: 'File terlalu besar. Gunakan file maksimal 512 KB.',
      503: 'Impor draft belum tersedia. Jadwal aktif tidak berubah.',
    };
    throw new Error(messages[response.status] ?? 'Layanan impor belum dapat dihubungi. Coba lagi.');
  }
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error('Respons impor belum dapat diverifikasi. Muat ulang sebelum melanjutkan.'); }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error('Respons impor belum dapat diverifikasi. Muat ulang sebelum melanjutkan.');
  return parsed.data;
}

export function importIssueText(code: string) {
  const texts: Record<string, string> = {
    ASSIGNMENT_UNMAPPED: 'Pilih penugasan yang sesuai untuk alias ini.',
    ROW_INVALID: 'Nilai hari, JP, indeks sesi, ruang, atau grup tidak valid.',
    BLANK_ROW: 'Baris kosong perlu diperbaiki; tidak dihapus otomatis.',
    COLUMN_OUT_OF_RANGE: 'Kolom yang dipilih tidak ditemukan.',
    UNUSED_ASSIGNMENT_MAPPING: 'Pemetaan alias tidak dipakai dalam file.',
    CLASS_OVERLAP: 'Kelas mempunyai dua sesi pada JP yang sama.',
    TEACHER_OVERLAP: 'Guru mempunyai sesi bersamaan tanpa pengecualian resmi yang persis.',
    ROOM_LABEL_OVERLAP: 'Label ruang dipakai bersamaan.',
    JP_UNAVAILABLE_OR_NONCONTIGUOUS: 'JP tidak tersedia atau melintasi jeda pada periode ini.',
    CONCURRENCY_NOT_EXACT_ACTIVE_BASELINE: 'Grup tidak persis sama dengan pengecualian resmi yang masih berlaku.',
    ASSIGNMENT_JP_OVERFLOW: 'Alokasi melebihi target JP penugasan.',
    ASSIGNMENT_JP_INCOMPLETE: 'Sebagian target JP belum teralokasi; draft belum lengkap.',
    NO_TEACHING_OCCURRENCE: 'Tidak ada hari mengajar dalam rentang yang dipilih.',
    FIXED_EXTERNAL_OCCUPANCY_OVERLAP: 'Bertabrakan dengan jadwal kelas di luar scope.',
  };
  return texts[code] ?? `Perlu diperiksa: ${code.replaceAll('_', ' ').toLowerCase()}.`;
}
