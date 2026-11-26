'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAssessmentDeviceId } from '@/lib/assessment-device';
import {
  assessmentPhotoBlob,
  createAssessmentClientId,
  deleteAssessmentPhoto,
  listAssessmentPhotos,
  queueAssessmentPhoto,
  type AssessmentPendingPhoto,
} from '@/lib/assessment-offline';

type PendingPhoto = Pick<AssessmentPendingPhoto, 'id' | 'questionId'>;
type QueueState = {
  responseId?: string;
  ready: boolean;
  busy: boolean;
  pending: PendingPhoto[];
  note: string;
};
const emptyQueue: QueueState = { ready: false, busy: false, pending: [], note: '' };

type QueueControls = {
  isBusy: () => boolean;
  retry: () => void;
  add: (questionId: string, file: File) => void;
  discard: (id: string) => void;
};

async function preparePhoto(file: File): Promise<Blob> {
  if (!file.size || file.size > 2 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error('Pilih foto JPG, PNG, atau WebP hingga 2 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
    const drawing = canvas.getContext('2d');
    if (!drawing) throw new Error('Foto gagal disiapkan.');
    drawing.fillStyle = '#fff';
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.68, 0.52]) {
      const output = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (output?.type === 'image/jpeg' && output.size <= 480 * 1024) return output;
    }
    throw new Error('Foto masih terlalu besar. Pangkas atau pilih foto yang lebih kecil.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useAssessmentPhotoQueue({ sessionId, responseId, disabled, canEdit, isAttached, attach }: {
  sessionId?: string;
  responseId?: string;
  disabled: boolean;
  canEdit: (responseId: string) => boolean;
  isAttached: (questionId: string, id: string) => boolean;
  attach: (questionId: string, id: string) => Promise<boolean>;
}) {
  const [state, setState] = useState(emptyQueue);
  const controls = useRef<QueueControls | null>(null);
  const latest = useRef({ sessionId, responseId, disabled, canEdit, isAttached, attach });
  latest.current = { sessionId, responseId, disabled, canEdit, isAttached, attach };

  useEffect(() => {
    if (!sessionId || !responseId || disabled) return;
    const lifecycle = new AbortController();
    const { signal } = lifecycle;
    let working = false;
    let retryRequested = false;
    let ready = false;
    const active = () => !signal.aborted && !latest.current.disabled &&
      latest.current.sessionId === sessionId && latest.current.responseId === responseId &&
      latest.current.canEdit(responseId);
    const update = (patch: Partial<QueueState>) => {
      if (!signal.aborted) setState((current) => ({ ...current, ...patch }));
    };
    setState({ ...emptyQueue, responseId });

    async function drain() {
      const rows = await listAssessmentPhotos(responseId!);
      if (!active()) return;
      ready = rows !== null;
      if (!rows) {
        update({ ready, note: 'Antrean foto tidak dapat dibaca. Coba lagi atau hubungi pengawas.' });
        return;
      }
      update({ ready, pending: rows.map(({ id, questionId }) => ({ id, questionId })) });
      if (!rows.length) { update({ note: '' }); return; }
      if (!navigator.onLine) {
        update({ note: 'Foto tersimpan di perangkat dan menunggu koneksi.' });
        return;
      }

      let note = 'Foto terlampir pada draf jawaban.';
      for (const photo of rows) {
        if (!active()) return;
        if (!latest.current.isAttached(photo.questionId, photo.id)) {
          const device = getAssessmentDeviceId();
          const url = '/api/backend/assessment/sessions/' + encodeURIComponent(sessionId!) +
            '/answer-photos/' + encodeURIComponent(photo.questionId) + '/' + encodeURIComponent(photo.id) +
            (device ? '?deviceId=' + encodeURIComponent(device) : '');
          update({ note: 'Mengirim foto…' });
          const response = await fetch(url, {
            method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: assessmentPhotoBlob(photo), signal,
          });
          if (!active()) return;
          if (!response.ok) {
            note = response.status === 409 || response.status === 403
              ? 'Foto belum dapat dilampirkan. Periksa status ujian atau hubungi pengawas.'
              : 'Foto belum terkirim. Pilih Coba lagi jika koneksi sudah stabil.';
            continue;
          }
          const body: { id?: string } = await response.json();
          if (body.id !== photo.id) {
            note = 'Konfirmasi foto belum diterima. Pilih Coba lagi.';
            continue;
          }
        }
        // Keep the encrypted row until the attachment is included in a saved answer revision.
        if (!active()) return;
        if (!await latest.current.attach(photo.questionId, photo.id)) {
          note = 'Foto sedang dipulihkan. Pilih Coba lagi jika belum tampil.';
          continue;
        }
        if (!active()) return;
        if (!await deleteAssessmentPhoto(photo.id)) {
          note = 'Antrean foto belum dapat diperbarui. Pilih Coba lagi.';
          continue;
        }
        if (!signal.aborted) setState((current) => ({
          ...current, pending: current.pending.filter((item) => item.id !== photo.id),
        }));
      }
      update({ note });
    }

    async function work(operation: () => Promise<void>) {
      if (working || !active()) return;
      working = true;
      update({ busy: true });
      try {
        await operation();
      } catch {
        if (active()) update({ note: 'Foto menunggu koneksi. Pilih Coba lagi jika diperlukan.' });
      } finally {
        working = false;
        update({ busy: false });
        if (retryRequested && active()) {
          retryRequested = false;
          void work(drain);
        }
      }
    }

    function retry() {
      if (working) retryRequested = true;
      else void work(drain);
    }

    controls.current = {
      isBusy: () => working,
      retry,
      add(questionId, file) {
        if (!ready) return;
        void work(async () => {
          let jpeg: Blob;
          try {
            jpeg = await preparePhoto(file);
          } catch (error) {
            update({ note: error instanceof Error ? error.message : 'Foto tidak dapat disiapkan.' });
            return;
          }
          if (!active()) return;
          const photo = await queueAssessmentPhoto(responseId, questionId, createAssessmentClientId(), jpeg);
          if (!photo) {
            update({ note: 'Foto belum aman disimpan. Periksa ruang penyimpanan perangkat.' });
            return;
          }
          await drain();
        });
      },
      discard(id) {
        void work(async () => {
          if (!await deleteAssessmentPhoto(id)) {
            update({ note: 'Foto antrean belum dapat dihapus. Coba lagi.' });
            return;
          }
          await drain();
        });
      },
    };
    retry();
    window.addEventListener('online', retry);
    return () => {
      lifecycle.abort();
      controls.current = null;
      window.removeEventListener('online', retry);
    };
  }, [disabled, responseId, sessionId]);

  const isBusy = useCallback(() => controls.current?.isBusy() ?? false, []);
  return {
    ...(state.responseId === responseId ? state : emptyQueue),
    isBusy,
    retry: () => controls.current?.retry(),
    add: (questionId: string, file: File) => controls.current?.add(questionId, file),
    discard: (id: string) => controls.current?.discard(id),
  };
}
