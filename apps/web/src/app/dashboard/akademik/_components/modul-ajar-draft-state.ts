export type DraftWriteTarget =
  | { kind: 'create' }
  | { kind: 'update'; id: string };

type ActionResult = {
  success: boolean;
  data?: unknown;
};

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
