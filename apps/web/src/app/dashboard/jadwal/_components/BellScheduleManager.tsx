'use client';
import React from 'react';
import BellPatternEditor from './BellPatternEditor';
import type { BellProfile, BellSegmentType as SegmentType } from '@/lib/bell-patterns';
export type BellScheduleProfile = Omit<BellProfile, 'segments'> & { segments: Array<Omit<BellProfile['segments'][number], 'dayOfWeek'> & { dayOfWeek?: number }> };

interface SegmentDraft {
  key: string;
  label: string;
  type: SegmentType;
  jpNumber: string;
  start: string;
  end: string;
}

function timeToMinute(value: string) {
  const [hour = Number.NaN, minute = Number.NaN] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function bellSegmentProblem(segments: SegmentDraft[]): string | null {
  const normalized = segments
    .map((segment) => ({
      ...segment,
      startMinute: timeToMinute(segment.start),
      endMinute: timeToMinute(segment.end),
    }))
    .sort((a, b) => a.startMinute - b.startMinute);
  if (
    normalized.some(
      (segment) => !segment.start || !segment.end || segment.endMinute <= segment.startMinute,
    )
  ) {
    return 'Setiap segmen harus memiliki waktu selesai setelah waktu mulai.';
  }
  if (
    normalized.some(
      (segment, index) => index > 0 && segment.startMinute < normalized[index - 1]!.endMinute,
    )
  ) {
    return 'Rentang segmen bertumpuk. Sesuaikan waktu sebelum menyimpan.';
  }
  return null;
}


// Legacy imports share the new editor; day 0 remains a readable common pattern.
export default function BellScheduleManager({ profiles, canManage, loadError }: { profiles: BellScheduleProfile[]; canManage: boolean; loadError: string | null }) {
  const normalized: BellProfile[] = profiles.map((profile) => ({ ...profile, segments: profile.segments.map((segment) => ({ ...segment, dayOfWeek: segment.dayOfWeek ?? 0 })) }));
  return <BellPatternEditor profiles={normalized} canManage={canManage} loadError={loadError} />;
}
