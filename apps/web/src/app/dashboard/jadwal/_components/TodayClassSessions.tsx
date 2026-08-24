'use client';

import React, { useRef, useState } from 'react';
import { Ban, CheckCircle2, Clock3, Play, RefreshCw, UserRoundCog } from 'lucide-react';
import {
  cancelClassSession,
  completeClassSession,
  reassignClassSession,
  startClassSession,
} from '../actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { classSessionStatusMeta } from '@/lib/class-session-status';
import {
  claimClassSessionAction,
  classSessionAction,
  type ClassSessionAction,
} from './class-session-ui';

export interface TodayClassSession {
  id: string;
  classNameSnapshot: string;
  subjectSnapshot: string;
  roomSnapshot: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: string;
}

export interface SessionTeacherOption {
  id: string;
  name: string;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function TodayClassSessions({
  sessions,
  loadError,
  canManage = false,
  teachers = [],
}: {
  sessions: TodayClassSession[];
  loadError: string | null;
  canManage?: boolean;
  teachers?: SessionTeacherOption[];
}) {
  const inFlight = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [manageTarget, setManageTarget] = useState<TodayClassSession | null>(null);
  const [manageAction, setManageAction] = useState<'cancel' | 'reassign'>('cancel');
  const [reason, setReason] = useState('');
  const [teacherId, setTeacherId] = useState('');

  const transition = async (session: TodayClassSession, action: ClassSessionAction) => {
    const key = `${session.id}:${action}`;
    if (!claimClassSessionAction(inFlight.current, key)) return;
    setBusyIds((current) => new Set(current).add(key));
    setMessage(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const result =
        action === 'start'
          ? await startClassSession(session.id, idempotencyKey)
          : await completeClassSession(session.id, idempotencyKey);
      setMessage(
        result.success
          ? {
              tone: 'success',
              text: action === 'start' ? 'Sesi berhasil dimulai.' : 'Sesi berhasil diselesaikan.',
            }
          : { tone: 'error', text: result.error },
      );
    } catch {
      setMessage({
        tone: 'error',
        text: 'Tindakan belum tersimpan. Periksa koneksi lalu coba lagi.',
      });
    } finally {
      inFlight.current.delete(key);
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const manage = async () => {
    if (!manageTarget || reason.trim().length < 5) return;
    const key = `${manageTarget.id}:manage`;
    if (!claimClassSessionAction(inFlight.current, key)) return;
    setBusyIds((current) => new Set(current).add(key));
    setMessage(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const result =
        manageAction === 'cancel'
          ? await cancelClassSession(manageTarget.id, reason.trim(), idempotencyKey)
          : await reassignClassSession(manageTarget.id, teacherId, reason.trim(), idempotencyKey);
      if (result.success) {
        setMessage({
          tone: 'success',
          text:
            manageAction === 'cancel'
              ? 'Sesi dibatalkan dan alert tertunda dihentikan.'
              : 'Guru sesi diperbarui dan proyeksi operasional akan disegarkan.',
        });
        setManageTarget(null);
        setReason('');
        setTeacherId('');
      } else {
        setMessage({ tone: 'error', text: result.error });
      }
    } catch {
      setMessage({ tone: 'error', text: 'Perubahan sesi belum tersimpan. Coba lagi.' });
    } finally {
      inFlight.current.delete(key);
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <section
      aria-labelledby="today-session-heading"
      className="rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 id="today-session-heading" className="font-bold text-slate-950">
            Sesi hari ini
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Status server berdasarkan jadwal, periode aktif, dan Bell Schedule.
          </p>
        </div>
        <Clock3 className="h-5 w-5 text-emerald-800" aria-hidden="true" />
      </div>

      {message && (
        <div
          className={`mx-4 mt-4 rounded-md border px-3 py-2 text-sm ${
            message.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
          role="status"
        >
          {message.text}
        </div>
      )}

      {loadError ? (
        <div className="p-4 text-sm text-red-800">
          <p>{loadError}</p>
          <a
            href="/dashboard/jadwal"
            className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-blue-700"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Muat ulang
          </a>
        </div>
      ) : sessions.length === 0 ? (
        <p className="p-4 text-sm text-slate-600">
          Tidak ada sesi yang dapat Anda operasikan hari ini.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {sessions.map((session) => {
            const action = classSessionAction(session.status);
            const statusMeta = classSessionStatusMeta(session.status);
            const busy = action ? busyIds.has(`${session.id}:${action}`) : false;
            return (
              <article
                key={session.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {session.classNameSnapshot} · {session.subjectSnapshot}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {timeLabel(session.scheduledStartAt)}–{timeLabel(session.scheduledEndAt)} ·{' '}
                    {session.roomSnapshot || 'Ruang belum ditetapkan'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                  {action && (
                    <button
                      type="button"
                      onClick={() => transition(session, action)}
                      disabled={busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    >
                      {action === 'start' ? (
                        <Play className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      )}
                      {busy ? 'Menyimpan…' : action === 'start' ? 'Mulai sesi' : 'Selesaikan'}
                    </button>
                  )}
                  {canManage &&
                    !['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(session.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          setManageTarget(session);
                          setManageAction('cancel');
                          setReason('');
                          setTeacherId('');
                        }}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <UserRoundCog className="h-4 w-4" aria-hidden="true" /> Kelola
                      </button>
                    )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog
        open={manageTarget !== null}
        onOpenChange={(open: boolean) => !open && setManageTarget(null)}
      >
        <DialogContent className="max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>Kelola sesi kelas</DialogTitle>
            <DialogDescription>
              {manageTarget?.classNameSnapshot} · {manageTarget?.subjectSnapshot}. Perubahan
              langsung memengaruhi monitoring dan membatalkan alert lama yang tidak lagi relevan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Jenis perubahan">
              <Button
                type="button"
                variant={manageAction === 'cancel' ? 'default' : 'outline'}
                className="min-h-11"
                onClick={() => setManageAction('cancel')}
              >
                <Ban className="mr-2 h-4 w-4" /> Batalkan
              </Button>
              <Button
                type="button"
                variant={manageAction === 'reassign' ? 'default' : 'outline'}
                className="min-h-11"
                disabled={
                  !manageTarget || !['SCHEDULED', 'REASSIGNED'].includes(manageTarget.status)
                }
                onClick={() => setManageAction('reassign')}
              >
                <UserRoundCog className="mr-2 h-4 w-4" /> Alihkan guru
              </Button>
            </div>
            {manageAction === 'reassign' && (
              <div className="space-y-2">
                <Label htmlFor="replacement-teacher">Guru pengganti</Label>
                <select
                  id="replacement-teacher"
                  value={teacherId}
                  onChange={(event) => setTeacherId(event.target.value)}
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  required
                >
                  <option value="">Pilih guru dengan penugasan yang sesuai</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="session-change-reason">Alasan perubahan</Label>
              <Input
                id="session-change-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={5}
                maxLength={500}
                placeholder="Minimal 5 karakter untuk audit"
              />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setManageTarget(null)}
            >
              Kembali
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={
                !manageTarget ||
                reason.trim().length < 5 ||
                (manageAction === 'reassign' && !teacherId) ||
                busyIds.has(`${manageTarget?.id}:manage`)
              }
              onClick={() => void manage()}
            >
              Konfirmasi perubahan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
