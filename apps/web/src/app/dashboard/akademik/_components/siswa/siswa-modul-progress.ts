import type { SiswaModul } from './siswa-types';

/**
 * Reflects a confirmed LMS completion locally until the next server payload arrives.
 */
export function withCompletedModuleProgress(
  modules: readonly SiswaModul[],
  completedModuleUuids: ReadonlySet<string>,
): SiswaModul[] {
  return modules.map((module) => (
    module.uuid && completedModuleUuids.has(module.uuid)
      ? { ...module, status: 'Selesai', prog: 100 }
      : module
  ));
}
