'use client';
import { useState } from 'react';
import TeacherAttendanceView from './TeacherAttendanceView';
import AdminAttendanceView from './AdminAttendanceView';
export default function AttendanceWorkspace({
  canRead,
  canManage,
  canCheckIn,
}: {
  canRead: boolean;
  canManage: boolean;
  canCheckIn: boolean;
}) {
  const [tab, setTab] = useState(canRead ? 'report' : 'self');
  return (
    <div className="space-y-5">
      {canRead && canCheckIn && (
        <div className="flex gap-1 border-b border-slate-200">
          {[
            ['self', 'Presensi Saya'],
            ['report', 'Rekap Pegawai'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={
                'border-b-2 px-4 py-3 text-sm font-semibold ' +
                (tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500')
              }
              onClick={() => setTab(id!)}
              aria-pressed={tab === id}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === 'self' && canCheckIn ? (
        <TeacherAttendanceView />
      ) : canRead ? (
        <AdminAttendanceView canManage={canManage} />
      ) : (
        <p className="rounded-xl border bg-white p-5 text-sm text-slate-600">
          Tidak ada akses presensi untuk akun ini.
        </p>
      )}
    </div>
  );
}
