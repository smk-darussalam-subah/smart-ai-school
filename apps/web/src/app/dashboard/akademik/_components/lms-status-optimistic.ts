export type LmsStatusAction = 'publish' | 'unpublish' | 'archive';
export type LmsActionResponse = { success: boolean; error?: string };

export const LMS_STATUS_AFTER_ACTION: Record<LmsStatusAction, string> = {
  publish: 'published',
  unpublish: 'draft',
  archive: 'archived',
};

export function withLmsStatusOverrides<T extends { id: string; status: string }>(
  modules: readonly T[],
  overrides: Readonly<Record<string, string>>,
): T[] {
  return modules.map((module) => (
    overrides[module.id] ? { ...module, status: overrides[module.id] } : module
  ));
}

export function createLmsActionGuard(): {
  tryStart: (id: string) => boolean;
  finish: (id: string) => void;
  isActive: (id: string) => boolean;
} {
  const active = new Set<string>();
  return {
    tryStart: (id) => {
      if (active.has(id)) return false;
      active.add(id);
      return true;
    },
    finish: (id) => {
      active.delete(id);
    },
    isActive: (id) => active.has(id),
  };
}

export function lmsActionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Aksi Modul LMS gagal.';
}

export function updateLmsBusyIds(current: ReadonlySet<string>, id: string, busy: boolean): Set<string> {
  const next = new Set(current);
  if (busy) next.add(id);
  else next.delete(id);
  return next;
}

export async function runLmsActionLifecycle(input: {
  id: string;
  guard: ReturnType<typeof createLmsActionGuard>;
  action: () => Promise<LmsActionResponse>;
  nextStatus?: string;
  setBusyId: (id: string | null) => void;
  applyStatus: (id: string, status: string) => void;
  notifyError: (message: string) => void;
}): Promise<'success' | 'failed' | 'duplicate'> {
  if (!input.guard.tryStart(input.id)) return 'duplicate';
  input.setBusyId(input.id);
  try {
    const result = await input.action();
    if (!result.success) {
      input.notifyError(result.error ?? 'Aksi Modul LMS gagal.');
      return 'failed';
    }
    if (input.nextStatus) input.applyStatus(input.id, input.nextStatus);
    return 'success';
  } catch (error) {
    input.notifyError(lmsActionErrorMessage(error));
    return 'failed';
  } finally {
    input.guard.finish(input.id);
    input.setBusyId(null);
  }
}
