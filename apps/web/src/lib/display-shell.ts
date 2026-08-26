const IDENTITY_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  TATA_USAHA: 'Tata Usaha',
  GURU: 'Guru',
  SISWA: 'Siswa',
  ORANG_TUA: 'Orang Tua',
  INDUSTRI: 'Industri',
};

const POSITION_LABELS: Record<string, string> = {
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  WAKA_KURIKULUM: 'Waka Kurikulum',
  WAKA_KESISWAAN: 'Waka Kesiswaan',
  WAKA_HUMAS: 'Waka Humas',
  WAKA_SARPRAS: 'Waka Sarpras',
  KAPROG: 'Kepala Program Keahlian',
  KEPALA_TU: 'Kepala Tata Usaha',
  STAF_KEPEGAWAIAN: 'Staf Kepegawaian',
  BENDAHARA: 'Bendahara',
  GURU_BK: 'Guru BK',
  OPERATOR_DAPODIK: 'Operator Dapodik',
  KOOR_BKK: 'Koordinator BKK',
  KOOR_HUBIN: 'Koordinator Hubin',
};

export function identityRoleLabel(role: string): string {
  return IDENTITY_LABELS[role] ?? 'Pengguna sekolah';
}

export function positionRoleLabel(code: string): string {
  return POSITION_LABELS[code] ?? code.toLowerCase().split('_').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

export function isShellRouteActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}
