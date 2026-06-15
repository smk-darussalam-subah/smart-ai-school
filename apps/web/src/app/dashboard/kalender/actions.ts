'use server';

import { revalidatePath } from 'next/cache';
import { apiAction } from '@/lib/server-actions';

export interface CalendarEventInput {
  academicYearId: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  type: 'holiday' | 'exam' | 'event' | 'break';
  description?: string | null;
}

export async function createCalendarEventAction(body: CalendarEventInput) {
  const result = await apiAction('/school/calendar', 'POST', body);
  if (!result.error) { revalidatePath('/dashboard/kalender'); revalidatePath('/dashboard'); }
  return result;
}

export async function updateCalendarEventAction(id: string, body: Partial<CalendarEventInput>) {
  const result = await apiAction(`/school/calendar/${id}`, 'PATCH', body);
  if (!result.error) { revalidatePath('/dashboard/kalender'); revalidatePath('/dashboard'); }
  return result;
}

export async function deleteCalendarEventAction(id: string) {
  const result = await apiAction(`/school/calendar/${id}`, 'DELETE');
  if (!result.error) { revalidatePath('/dashboard/kalender'); revalidatePath('/dashboard'); }
  return result;
}
