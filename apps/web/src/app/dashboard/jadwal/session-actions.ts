'use server';

import { revalidatePath } from 'next/cache';
import { apiAction } from '@/lib/server-actions';
import {
  SessionPreparationSchema,
  SessionPreparationReceiptSchema,
  SessionActivationSchema,
  SessionActivationPreviewSchema,
  SessionActivationReceiptSchema,
  SessionActivationRefSchema,
} from '@/lib/session-preparation';

export async function getSessionActivation() {
  const result = await apiAction<unknown>('/class-sessions/activation', 'GET');
  if (result.error) return { error: result.error, status: result.status };
  const parsed = SessionActivationSchema.safeParse(result.data);
  return parsed.success
    ? { data: parsed.data, status: result.status }
    : {
        error: 'Status otomasi belum dapat diverifikasi. Muat ulang sebelum melanjutkan.',
        status: 502,
      };
}

export async function previewSessionActivation(date: string) {
  const result = await apiAction<unknown>(
    `/class-sessions/activation/preparation?date=${encodeURIComponent(date)}`,
    'GET',
  );
  if (result.error) return { error: result.error, status: result.status };
  const parsed = SessionActivationPreviewSchema.safeParse(result.data);
  return parsed.success && parsed.data.date === date
    ? { data: parsed.data, status: result.status }
    : { error: 'Kesiapan otomasi belum dapat diverifikasi. Periksa kembali.', status: 502 };
}

export async function enableSessionActivation(date: string, planHash: string) {
  const result = await apiAction<unknown>('/class-sessions/activation/enable', 'POST', {
    date,
    planHash,
  });
  if (result.error) return { error: result.error, status: result.status };
  const parsed = SessionActivationReceiptSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.date !== date || !parsed.data.activation.enabled)
    return {
      error: 'Hasil aktivasi belum dapat dipastikan. Muat ulang status sebelum mencoba lagi.',
      status: 502,
    };
  for (const path of [
    '/dashboard',
    '/dashboard/jadwal',
    '/dashboard/akademik',
    '/dashboard/monitoring',
    '/dashboard/executive',
  ])
    revalidatePath(path);
  return { data: parsed.data, status: result.status };
}

export async function disableSessionActivation(semesterId: string, revision: number) {
  const result = await apiAction<unknown>('/class-sessions/activation/disable', 'POST', {
    semesterId,
    revision,
  });
  if (result.error) return { error: result.error, status: result.status };
  const parsed = SessionActivationRefSchema.safeParse(result.data);
  if (
    !parsed.success ||
    parsed.data.semesterId !== semesterId ||
    parsed.data.enabled ||
    parsed.data.revision !== revision + 1
  )
    return { error: 'Hasil penonaktifan belum dapat dipastikan. Muat ulang status.', status: 502 };
  for (const path of [
    '/dashboard',
    '/dashboard/jadwal',
    '/dashboard/akademik',
    '/dashboard/monitoring',
    '/dashboard/executive',
  ])
    revalidatePath(path);
  return { data: parsed.data, status: result.status };
}

export async function previewClassSessions(date: string) {
  const result = await apiAction<unknown>(
    `/class-sessions/preparation?date=${encodeURIComponent(date)}`,
    'GET',
  );
  if (result.error) return { error: result.error, status: result.status };
  const parsed = SessionPreparationSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.date !== date)
    return { error: 'Respons kesiapan belum dapat diverifikasi. Coba periksa lagi.', status: 502 };
  return { data: parsed.data, status: result.status };
}

export async function prepareClassSessions(date: string, planHash: string) {
  const result = await apiAction<unknown>('/class-sessions/materialize', 'POST', {
    date,
    planHash,
  });
  if (result.error) return { error: result.error, status: result.status };
  const parsed = SessionPreparationReceiptSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.date !== date)
    return {
      error: 'Hasil penyiapan belum dapat dipastikan. Periksa daftar sesi sebelum mencoba lagi.',
      status: 502,
    };
  {
    for (const path of [
      '/dashboard',
      '/dashboard/jadwal',
      '/dashboard/akademik',
      '/dashboard/monitoring',
      '/dashboard/executive',
    ])
      revalidatePath(path);
  }
  return { data: parsed.data, status: result.status };
}
