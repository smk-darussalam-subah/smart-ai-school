'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Bell, Calendar, ExternalLink, Inbox, Loader2, Megaphone, Tag } from 'lucide-react';
import LearnerNotificationDialog from '../LearnerNotificationDialog';
import { learnerNotificationTargetHref, RAPOR_LEARNER_COLORS } from '../learner-navigation';
import type { SiswaPengumuman } from './siswa-types';

interface NotificationEntry {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  sentAt: string | null;
  refType: string | null;
  targetHref?: string | null;
  createdAt: string;
}

interface Props {
  announcements: SiswaPengumuman[];
  onFetchNotifications?: () => Promise<NotificationEntry[] | null>;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

export function notificationTargetHref(notification: Pick<NotificationEntry, 'refType' | 'targetHref'>): string {
  return learnerNotificationTargetHref(notification);
}

const STUDENT_ACTIVE_CONTROL_STYLE = {
  backgroundColor: RAPOR_LEARNER_COLORS.studentActiveBackground,
  color: RAPOR_LEARNER_COLORS.studentActiveForeground,
};

function formatDate(value: string | null): string {
  const parsed = new Date(value ?? '');
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function PengumumanModal({ announcements, onFetchNotifications, returnFocusRef, onClose }: Props) {
  const hasNotificationFeed = typeof onFetchNotifications === 'function';
  const [activeTab, setActiveTab] = useState<'notifications' | 'announcements'>(
    hasNotificationFeed ? 'notifications' : 'announcements',
  );
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'Penting' | 'Info' | 'Mapel'>('all');

  // T1-04 (audit v2): langsung dari props. Empty -> empty state, bukan SIM_PENGUMUMAN.
  const displayAnnouncements = announcements;
  const filtered = displayAnnouncements.filter((a: SiswaPengumuman) => {
    if (filter === 'all') return true;
    return a.tag === filter;
  });

  const pentingCount = displayAnnouncements.filter((a: SiswaPengumuman) => a.tag === 'Penting').length;
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
      shell="student"
      title="Notifikasi"
      description={`${notifications.length} notifikasi · ${displayAnnouncements.length} pengumuman · ${pentingCount} penting`}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
    >

        {hasNotificationFeed && (
          <div className="border-b border-[var(--border)] px-5 py-3">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface)] p-1">
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-extrabold transition-all ${
                  activeTab === 'notifications'
                    ? 'border border-emerald-300 shadow-sm'
                    : 'text-[var(--muted)] hover:bg-[var(--surface2)]'
                }`}
                style={activeTab === 'notifications' ? STUDENT_ACTIVE_CONTROL_STYLE : undefined}
              >
                <Inbox className="h-3.5 w-3.5" />
                Notifikasi
                <span className="rounded-full bg-white/60 px-1.5 text-[10px]">{notifications.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('announcements')}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-extrabold transition-all ${
                  activeTab === 'announcements'
                    ? 'border border-emerald-300 shadow-sm'
                    : 'text-[var(--muted)] hover:bg-[var(--surface2)]'
                }`}
                style={activeTab === 'announcements' ? STUDENT_ACTIVE_CONTROL_STYLE : undefined}
              >
                <Megaphone className="h-3.5 w-3.5" />
                Pengumuman
                <span className="rounded-full bg-white/60 px-1.5 text-[10px]">{displayAnnouncements.length}</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'announcements' && (
          <div className="border-b border-[var(--border)] px-5 py-3">
            <div className="flex gap-1.5">
              {([
                ['all', 'Semua'],
                ['Penting', 'Penting'],
                ['Info', 'Info'],
                ['Mapel', 'Mapel'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`flex min-h-11 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                    filter === key
                      ? 'border border-emerald-300 shadow-sm'
                      : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border2)]'
                  }`}
                  style={filter === key ? STUDENT_ACTIVE_CONTROL_STYLE : undefined}
                >
                  <Tag className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {activeTab === 'notifications' && hasNotificationFeed ? (
            notificationLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm font-semibold text-[var(--muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat notifikasi
              </div>
            ) : notificationError ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-500">
                {notificationError}
              </div>
            ) : notifications.length > 0 ? (
              notifications.map((item) => (
                <article key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-500">
                          {item.refType === 'report-card' ? 'Rapor' : item.channel}
                        </span>
                        {item.refType === 'report-card' && (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                            {reportNotificationCount} resmi
                          </span>
                        )}
                      </div>
                      <h4 className="mt-2 text-sm font-bold">{item.subject ?? 'Notifikasi sekolah'}</h4>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--muted)]">{item.body}</p>
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--muted)]">
                        <Calendar className="h-3 w-3" />
                        {formatDate(item.sentAt ?? item.createdAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { window.location.href = notificationTargetHref(item); }}
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] transition-colors hover:border-emerald-500 hover:text-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                      aria-label="Buka notifikasi"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="py-8 text-center text-[var(--dim)]">
                <Inbox className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <div className="text-sm">Belum ada notifikasi.</div>
              </div>
            )
          ) : filtered.length > 0 ? (
            filtered.map((ann: SiswaPengumuman) => (
              <div
                key={ann.id}
                className={`rounded-xl border p-4 transition-all ${
                  ann.tag === 'Penting'
                    ? 'border-rose-500/30 bg-rose-500/5'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                } ${!ann.read ? 'border-l-4 border-l-emerald-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Bell className={`h-4 w-4 flex-shrink-0 ${
                        ann.tag === 'Penting' ? 'text-rose-500' : ann.tag === 'Info' ? 'text-blue-500' : 'text-emerald-500'
                      }`} />
                      <span className={`text-[10px] font-extrabold uppercase tracking-wider ${
                        ann.tag === 'Penting' ? 'text-rose-500' : ann.tag === 'Info' ? 'text-blue-500' : 'text-emerald-500'
                      }`}
                      >
                        {ann.tag}
                      </span>
                      {!ann.read && (
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                    </div>
                    <h4 className="mt-2 text-sm font-bold">{ann.title}</h4>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold text-[var(--muted)]">{ann.body}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--muted)]">
                      <Calendar className="h-3 w-3" />
                      {ann.time}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-[var(--dim)]">
              <Megaphone className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <div className="text-sm">Tidak ada pengumuman dengan filter ini</div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] p-5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-bold text-[var(--text)] transition-all hover:border-[var(--border2)] hover:bg-[var(--surface2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            Tutup
          </button>
        </div>
    </LearnerNotificationDialog>
  );
}
