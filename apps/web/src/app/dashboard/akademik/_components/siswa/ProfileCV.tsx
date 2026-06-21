'use client';

import { Award, Mail, Phone, MapPin, Calendar, QrCode } from 'lucide-react';
import { SIM_PROFILE_CV, SIM_BADGES } from './siswa-data';
import type { SiswaScreen } from './SiswaWorkspace';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
}

export default function ProfileCV({ isOpen, onClose, showToast: _showToast, go: _go }: Props) {
  const displayProfile = SIM_PROFILE_CV as any;
  const displayBadges = SIM_BADGES.filter((b: any) => b.earned);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-[var(--bg)] transition-transform duration-300 ease-in-out"
      style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)', maxWidth: 560, marginLeft: 'auto' }}
    >
      <div className="h-full overflow-y-auto pb-24">
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-emerald-800 px-5 pb-8 pt-6 text-white">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-white/5 pointer-events-none" />
          
          <button
            onClick={onClose}
            className="relative z-10 mb-4 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-bold backdrop-blur transition-all hover:bg-white/30"
          >
            ← Kembali
          </button>

          <div className="relative z-10 flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-3xl font-extrabold backdrop-blur">
              {displayProfile.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold">{displayProfile.name}</h1>
              <p className="mt-1 text-sm font-semibold text-white/80">{displayProfile.nis} · {displayProfile.class}</p>
              <p className="mt-0.5 text-xs font-semibold text-white/60">{displayProfile.school}</p>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="px-5 py-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-[var(--muted)]" />
              <span className="text-sm font-semibold">{displayProfile.email}</span>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-[var(--muted)]" />
              <span className="text-sm font-semibold">{displayProfile.phone}</span>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-[var(--muted)]" />
              <span className="text-sm font-semibold">{displayProfile.address}</span>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-[var(--muted)]" />
              <span className="text-sm font-semibold">TMT: {displayProfile.enrollmentDate}</span>
            </div>
          </div>
        </div>

        {/* Achievement Stats */}
        <div className="px-5 pb-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
              <div className="text-2xl font-extrabold text-emerald-500">{displayProfile.xp}</div>
              <div className="mt-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Total XP</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
              <div className="text-2xl font-extrabold text-amber-500">{displayBadges.length}</div>
              <div className="mt-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Badges</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
              <div className="text-2xl font-extrabold text-violet-500">{displayProfile.level}</div>
              <div className="mt-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Level</div>
            </div>
          </div>
        </div>

        {/* Earned Badges */}
        <div className="px-5 pb-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
            <Award className="h-3.5 w-3.5 text-emerald-500" />Badge Earned
          </h2>
          <div className="grid grid-cols-3 gap-2.5">
            {displayBadges.map((badge: any) => (
              <div key={badge.name} className="text-center">
                <div
                  className="mx-auto mb-1.5 flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: `${badge.color}20`, border: `2px solid ${badge.color}40` }}
                >
                  <span className="text-xl">🏅</span>
                </div>
                <div className="text-[9px] font-bold">{badge.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Academic Summary */}
        <div className="px-5 pb-4">
          <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Ringkasan Akademik</h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--muted)]">Rata-rata Nilai</span>
              <span className="text-lg font-extrabold text-emerald-500">{displayProfile.avgGrade}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--muted)]">Kehadiran</span>
              <span className="text-lg font-extrabold text-violet-500">{displayProfile.attendance}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--muted)]">Modul Selesai</span>
              <span className="text-lg font-extrabold text-amber-500">{displayProfile.modulesCompleted}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--muted)]">Streak Kehadiran</span>
              <span className="text-lg font-extrabold text-rose-500">{displayProfile.streak} hari</span>
            </div>
          </div>
        </div>

        {/* QR Code */}
        <div className="px-5 pb-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
            <QrCode className="mx-auto mb-2 h-24 w-24 text-[var(--muted)]" />
            <div className="text-xs font-bold">Scan untuk Verifikasi Identitas</div>
            <div className="mt-1 text-[10px] font-semibold text-[var(--muted)]">{displayProfile.nis}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
