// Synthetic actions for the isolated local component lab only.
let mode = 'success';
let saves = 0;
export function setMode(value: string) {
  mode = value;
}
export function getSaves() {
  return saves;
}
export async function fetchClassRoster(classId: string) {
  const requestedMode = mode;
  await new Promise((resolve) => setTimeout(resolve, requestedMode === 'slow' ? 900 : 80));
  if (requestedMode === 'error')
    return { success: false as const, error: 'Daftar siswa belum dapat dimuat. Coba lagi.' };
  if (requestedMode === 'denied')
    return { success: false as const, error: 'Anda tidak memiliki izin membaca daftar siswa ini.' };
  return {
    success: true as const,
    data:
      requestedMode === 'empty'
        ? []
        : [
            {
              id: classId + '-student',
              name: classId === 'class-a' ? 'Siswa Sintetis A' : 'Siswa Sintetis B',
              nis: 'SYN-001',
            },
          ],
  };
}
export async function fetchWaliClasses() {
  const requestedMode = mode;
  await new Promise((resolve) => setTimeout(resolve, requestedMode === 'slow' ? 900 : 80));
  if (requestedMode === 'error' || requestedMode === 'denied')
    return { success: false, error: 'Informasi wali kelas belum dapat dimuat.' };
  return {
    success: true,
    data: {
      classes:
        requestedMode === 'empty'
          ? []
          : [
              {
                id: 'class-a',
                name: 'Kelas Sintetis A',
                majorCode: 'SYN',
                grade: 10,
                academicYear: '2026/2027',
              },
            ],
      isWaliKelas: requestedMode !== 'empty',
    },
  };
}
export async function createAttendance() {
  saves++;
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (mode === 'save-throw') throw new Error('Synthetic network failure');
  if (mode === 'save-error') return { success: false, error: 'Absensi sintetis belum tersimpan.' };
  return { success: true };
}
export async function createGrade() {
  saves++;
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (mode === 'save-throw') throw new Error('Synthetic network failure');
  if (mode === 'save-error') return { success: false, error: 'Nilai sintetis belum tersimpan.' };
  return { success: true };
}
