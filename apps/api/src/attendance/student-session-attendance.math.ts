/** Private inbox preview; complete notes are accessible only through the scoped detail. */
export function attendanceNoticeBody(
  name: string,
  date: string,
  subject: string,
  records: readonly { jp: number; status: string; notes: string | null }[],
  correction = false,
) {
  const totals = jpAttendanceTotals(records.map((r) => r.status));
  const absent = records.filter((r) => r.status !== 'hadir').map((r) => r.jp);
  const note = records.find((r) => r.status !== 'hadir' && r.notes)?.notes;
  // The inbox links to full JP notes; bound the push preview below transport limits.
  return `${correction ? 'Koreksi kehadiran. ' : ''}${name.slice(0, 70)} · ${date} · ${subject.slice(0, 90)}. Hadir ${totals.hadir}, Izin ${totals.izin}, Sakit ${totals.sakit}, Alpha ${totals.alpha} JP.${absent.length ? ' Tidak hadir pada JP ' + absent.join(', ') + '.' : ''}${note ? ' Keterangan: ' + note.slice(0, 100) + '.' : ''} Buka rincian tanggal untuk catatan lengkap.`.slice(
    0,
    500,
  );
}
/** Final attendance is JP-weighted. Unknown JP are not Alpha or a final percentage. */
export function jpAttendanceTotals(statuses: readonly (string | null)[]) {
  const count = (status: string) => statuses.filter((x) => x === status).length;
  const hadir = count('hadir'),
    izin = count('izin'),
    sakit = count('sakit'),
    alpha = count('alpha');
  const expected = statuses.length,
    recorded = hadir + izin + sakit + alpha,
    unknown = expected - recorded;
  const complete = expected > 0 && unknown === 0;
  const pct = complete ? Math.round((hadir / expected) * 10000) / 100 : null;
  const tone = !complete
    ? 'unknown'
    : hadir === expected
      ? 'green'
      : hadir === 0
        ? 'red'
        : hadir * 2 <= expected
          ? 'yellow'
          : 'blue';
  return { expected, recorded, unknown, hadir, izin, sakit, alpha, complete, pct, tone };
}

/** A physical student JP counts once, even when authorized co-teaching sessions overlap. */
export function physicalJpStatuses(
  sessions: readonly { date: string; slots: readonly { jp: number; status: string | null }[] }[],
) {
  const map = new Map<string, (string | null)[]>();
  for (const session of sessions)
    for (const slot of session.slots) {
      const key = session.date + ':' + slot.jp;
      map.set(key, [...(map.get(key) ?? []), slot.status]);
    }
  return [...map.values()].map((values) =>
    values.every((x) => x !== null && x === values[0]) ? values[0]! : null,
  );
}

/** Resolve immutable session timing against its retained bell profile, not Schedule edits. */
export function sessionJpSlots(session: {
  serviceDate: Date;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  bellScheduleProfile: {
    segments: {
      type: string;
      jpNumber: number | null;
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
    }[];
  };
}) {
  const date = session.serviceDate.toISOString().slice(0, 10),
    day = session.serviceDate.getUTCDay() || 7;
  if (day === 7) return [];
  const segments = session.bellScheduleProfile.segments;
  const daily = segments.some((x) => x.dayOfWeek !== 0);
  const at = (min: number) => new Date(`${date}T00:00:00+07:00`).getTime() + min * 60000;
  const slots = segments
    .filter(
      (x) =>
        x.type === 'INSTRUCTION' &&
        x.jpNumber !== null &&
        x.dayOfWeek === (daily ? day : 0) &&
        at(x.startMinute) >= session.scheduledStartAt.getTime() &&
        at(x.endMinute) <= session.scheduledEndAt.getTime(),
    )
    .map((x) => ({
      jp: x.jpNumber!,
      startAt: new Date(at(x.startMinute)).toISOString(),
      endAt: new Date(at(x.endMinute)).toISOString(),
    }))
    .sort((a, b) => a.jp - b.jp);
  if (
    !slots.length ||
    new Set(slots.map((x) => x.jp)).size !== slots.length ||
    slots[0]!.startAt !== session.scheduledStartAt.toISOString() ||
    slots.at(-1)!.endAt !== session.scheduledEndAt.toISOString()
  )
    return [];
  return slots;
}
