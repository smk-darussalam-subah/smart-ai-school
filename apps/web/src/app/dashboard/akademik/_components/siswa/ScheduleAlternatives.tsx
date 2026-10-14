import React from 'react';
import type { SimSchedSlot } from './siswa-data';
export default function ScheduleAlternatives({ slot }: { slot: SimSchedSlot }) {
  if (!slot.sessions || slot.sessions.length < 2) return null;
  return (
    <details
      className="mt-2 rounded-lg border p-2 text-xs"
      onClick={(event) => event.stopPropagation()}
    >
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
        {slot.sessions.length} sesi pada JP ini · lihat semua
      </summary>
      <ul className="mt-2 space-y-2">
        {slot.sessions.map((session, index) => (
          <li key={index} className="border-t pt-2">
            <b>{session.mp}</b>
            <p>
              {session.g} · {session.ruang}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2">
        Jadwal bersamaan perlu mengikuti arahan sekolah. Daftar ini bukan bukti sesi telah dimulai.
      </p>
    </details>
  );
}
