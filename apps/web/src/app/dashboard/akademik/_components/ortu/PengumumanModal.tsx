'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Bell, Calendar, ExternalLink, Inbox, Loader2, Megaphone } from 'lucide-react';
import LearnerNotificationDialog from '../LearnerNotificationDialog';
import { learnerReportHref } from '../learner-navigation';
import type { OrtuPengumuman } from './ortu-types';

interface NotificationEntry {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  sentAt: string | null;
  refType: string | null;
  createdAt: string;
}

interface PengumumanModalProps {
  announcements: OrtuPengumuman[];
  onFetchNotifications?: () => Promise<NotificationEntry[] | null>;
  reportStudentId?: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

export function notificationTargetHref(notification: Pick<NotificationEntry, 'refType'>, studentId?: string): string {
  return notification.refType === 'report-card' ? learnerReportHref(studentId) : '/dashboard/akademik';
}

function formatDate(value: string | null): string {
  const parsed = new Date(value ?? '');
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function PengumumanModal({ announcements, onFetchNotifications, reportStudentId, returnFocusRef, onClose }: PengumumanModalProps) {
  const hasNotificationFeed = typeof onFetchNotifications === 'function';
  const [activeTab, setActiveTab] = useState<'notifications' | 'announcements'>(
    hasNotificationFeed ? 'notifications' : 'announcements',
  );
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const reportNotificationCount = useMemo(
    () => notifications.filter((item) => item.refType === 'report-card').length,
    [notifications],
  );

  useEffect(() => {
    if (!hasNotificationFeed || !onFetchNotifications) return;
    let alive = true;
    setNotificationLoading(true);
    setNotificationError(null);
    onFetchNotifications()
      .then((items) => {
        if (!alive) return;
        setNotifications(items ?? []);
      })
      .catch(() => {
        if (!alive) return;
        setNotificationError('Riwayat notifikasi belum bisa dimuat.');
      })
      .finally(() => {
        if (alive) setNotificationLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [hasNotificationFeed, onFetchNotifications]);

  return (
    <LearnerNotificationDialog
      shell="parent"
      title="Notifikasi"
      description={`${notifications.length} notifikasi · ${announcements.length} pengumuman`}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-8">

        {hasNotificationFeed && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-[var(--r)] bg-[var(--surface)] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-[11px] font-extrabold transition-all ${
                activeTab === 'notifications'
                  ? 'bg-[var(--pri)] text-white'
                  : 'text-[var(--muted)] hover:bg-[var(--surface2)]'
              }`}
            >
              <Inbox className="h-3.5 w-3.5" />
              Notifikasi
              <span className="rounded-full bg-black/10 px-1.5 text-[10px]">{notifications.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('announcements')}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-[11px] font-extrabold transition-all ${
                activeTab === 'announcements'
                  ? 'bg-[var(--pri)] text-white'
                  : 'text-[var(--muted)] hover:bg-[var(--surface2)]'
              }`}
            >
              <Megaphone className="h-3.5 w-3.5" />
              Pengumuman
              <span className="rounded-full bg-black/10 px-1.5 text-[10px]">{announcements.length}</span>
            </button>
          </div>
        )}

        {activeTab === 'notifications' && hasNotificationFeed ? (
          notificationLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[12px] font-semibold text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat notifikasi
            </div>
          ) : notificationError ? (
            <div className="rounded-[var(--r)] border border-[var(--rose)] bg-[var(--rose)]/10 p-3.5 text-[12px] font-semibold text-[var(--rose)]">
              {notificationError}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-6 text-center text-[12px] font-semibold text-[var(--dim)]">
              <Inbox className="mx-auto mb-2 h-8 w-8 opacity-50" />
              Belum ada notifikasi.
            </div>
          ) : (
            notifications.map((item) => (
              <article
                key={item.id}
                className="mb-2.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <Bell className="h-4 w-4 text-[var(--pri)]" />
                      <span className="rounded-md bg-[var(--surface2)] px-2 py-0.5 text-[9px] font-extrabold text-[var(--pri)]">
                        {item.refType === 'report-card' ? 'Rapor' : item.channel}
                      </span>
                      {item.refType === 'report-card' && (
                        <span className="rounded-md bg-[var(--surface2)] px-2 py-0.5 text-[9px] font-extrabold text-[var(--pri)]">
                          {reportNotificationCount} resmi
                        </span>
                      )}
                    </div>
                    <b className="mb-1 block text-[13px]">{item.subject ?? 'Notifikasi sekolah'}</b>
                    <p className="text-[11.5px] leading-relaxed text-[var(--muted)]">{item.body}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--muted)]">
                      <Calendar className="h-3 w-3" />
                      {formatDate(item.sentAt ?? item.createdAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { window.location.href = notificationTargetHref(item, reportStudentId); }}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] transition-colors hover:border-[var(--pri)] hover:text-[var(--pri)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pri)]"
                    aria-label="Buka notifikasi"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))
          )
        ) : announcements.length === 0 ? (
          <div className="py-6 text-center text-[12px] font-semibold text-[var(--dim)]">
            Tidak ada pengumuman
          </div>
        ) : (
          announcements.map((p) => (
            <div
              key={p.id}
              className="mb-2.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5"
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="rounded-md bg-[var(--surface2)] px-2 py-0.5 text-[9px] font-extrabold text-[var(--pri)]">
                  {p.tag}
                </span>
                <small className="text-[10px] text-[var(--muted)]">{p.date}</small>
              </div>
              <b className="mb-1 block text-[13px]">{p.title}</b>
              <p className="text-[11.5px] leading-relaxed text-[var(--muted)]">{p.body}</p>
            </div>
          ))
        )}
      </div>
    </LearnerNotificationDialog>
  );
}
