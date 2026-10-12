import type { ApiFetchResult } from './api';
import { z } from 'zod';

export type ParentChildrenState = 'ready' | 'empty' | 'denied' | 'error';
const ParentChildSchema = z.object({
  id: z.string().min(1),
  user: z.object({ fullName: z.string().min(1) }),
  class: z.object({ id: z.string().min(1), name: z.string().min(1) }).nullable(),
});
const ParentChildrenSchema = z.object({ data: z.array(ParentChildSchema) });
export type ParentChildRecord = z.infer<typeof ParentChildSchema>;

/** Preserve identity-read failure; an unknown child list is not an absent class. */
export function readParentChildren(result: ApiFetchResult<{ data: unknown }>): {
  data: ParentChildRecord[];
  state: ParentChildrenState;
} {
  if (result.status === 'forbidden') return { data: [], state: 'denied' };
  if (result.status !== 'success') return { data: [], state: 'error' };
  const parsed = ParentChildrenSchema.safeParse(result.data);
  if (!parsed.success) return { data: [], state: 'error' };
  return { data: parsed.data.data, state: parsed.data.data.length ? 'ready' : 'empty' };
}
