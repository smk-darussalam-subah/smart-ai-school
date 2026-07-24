export type DraftWriteTarget =
  | { kind: 'create' }
  | { kind: 'update'; id: string };

type ActionResult = {
  success: boolean;
  data?: unknown;
};
type Identifiable = { id: string };

export function getDraftWriteTarget(currentRppId: string | null, editingId?: string | null): DraftWriteTarget {
  const activeRppId = currentRppId ?? editingId ?? null;
  return activeRppId ? { kind: 'update', id: activeRppId } : { kind: 'create' };
}

export function readCreatedRppId(result: ActionResult): string | null {
  if (!result.success || !result.data || typeof result.data !== 'object') {
    return null;
  }

  const id = (result.data as { id?: unknown }).id;
  return typeof id === 'string' && id.trim() ? id : null;
}

export function readCreatedRpp<T extends Identifiable>(result: ActionResult): T | null {
  const id = readCreatedRppId(result);
  if (!id || !result.data || typeof result.data !== 'object') return null;
  return result.data as T;
}

export function getPendingCreatedDraft<T extends Identifiable>(
  createdDraft: T | null,
  currentItems: readonly Identifiable[],
): T | null {
  if (!createdDraft) return null;
  return currentItems.some((item) => item.id === createdDraft.id) ? null : createdDraft;
}
