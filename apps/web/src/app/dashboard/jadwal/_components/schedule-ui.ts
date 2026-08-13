import { fmtMin, type JpSlot } from '@/lib/bell-times';

export function normalizeRoomInput(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('id-ID');
  return normalized || null;
}

export function jpOptionLabel(slot: JpSlot): string {
  return `JP ${slot.jp} · ${fmtMin(slot.startMin)}–${fmtMin(slot.endMin)}`;
}
