// =============================================================================
// LoA (Letter of Agreement) Content — PDP Consent
// Structured by role for the consent dialog page.
// =============================================================================

export interface LoaClause {
  title: string;
  body: string;
}

/**
 * Universal clauses — shown to ALL roles.
 * Legal basis: UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
 */
export const UNIVERSAL_CLAUSES: LoaClause[] = [
  {
    title: 'Pengumpulan Data',
    body: 'Sistem DIIS mengumpulkan dan mengolah data pribadi Anda meliputi: nama lengkap, alamat surel, nomor telepon, NIS/NIP, alamat tempat tinggal, data kehadiran, dan nilai akademik. Data tersebut dikumpulkan langsung dari Anda, dari institusi pendidikan, atau dari sumber resmi lainnya.',
  },
  {
    title: 'Dasar Hukum',
    body: 'Pengolahan data pribadi ini didasarkan pada UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP), serta peraturan pelaksanaannya yang berlaku di lingkungan sekolah.',
  },
  {
    title: 'Tujuan Pengolahan Data',
    body: 'Data pribadi Anda diolah untuk keperluan: (a) administrasi pendidikan dan pelaporan akademik; (b) pelaporan kepada Kemendikbudristek dan dinas pendidikan terkait; (c) analitik internal untuk peningkatan kualitas pembelajaran; (d) komunikasi sekolah terkait kegiatan akademik dan non-akademik.',
  },
  {
    title: 'Retensi Data',
    body: 'Data pribadi Anda akan disimpan selama Anda menjadi warga sekolah dan hingga 3 (tiga) tahun setelah status keanggotaan berakhir, kecuali diwajibkan oleh peraturan perundang-undangan untuk disimpan lebih lama.',
  },
  {
    title: 'Hak Subjek Data',
    body: 'Sesuai UU PDP, Anda memiliki hak untuk: (a) meminta akses terhadap data pribadi Anda; (b) meminta koreksi data yang tidak akurat; (c) meminta penghapusan data (right to be deleted); (d) menarik kembali persetujuan pengolahan data; (e) mengajukan keluhan kepada otoritas pelindungan data.',
  },
  {
    title: 'Kontak Pelindungan Data',
    body: 'Untuk pertanyaan atau permintaan terkait pelindungan data pribadi, silakan menghubungi administration sekolah melalui surel resmi sekolah atau melalui fitur kontak di sistem DIIS.',
  },
];

/**
 * Role-specific clauses — appended after universal clauses based on user role.
 */
export const ROLE_CLAUSES: Record<string, LoaClause[]> = {
  SISWA: [
    {
      title: 'Ketentuan Khusus Siswa',
      body: 'Sebagai siswa, data akademik Anda meliputi nilai, kehadiran, hasil asesmen, dan catatan perilaku akan diolah untuk pelaporan rapor, portofolio akademik, dan pemantauan perkembangan belajar. Data ini dapat diakses oleh orang tua/wali melalui dashboard orang tua.',
    },
  ],
  ORANG_TUA: [
    {
      title: 'Ketentuan Khusus Orang Tua',
      body: 'Sebagai orang tua/wali, data anak Anda akan ditampilkan di dashboard orang tua untuk memantau perkembangan akademik. Anda berhak meminta koreksi data anak Anda dan mengetahui data apa saja yang diolah oleh sistem.',
    },
  ],
  GURU: [
    {
      title: 'Ketentuan Khusus Guru',
      body: 'Sebagai guru, data kepegawaian dan kinerja Anda akan diolah untuk keperluan penugasan, evaluasi pembelajaran, pengembangan profesional, dan pelaporan kepada kepala sekolah dan dinas pendidikan.',
    },
  ],
  KEPALA_SEKOLAH: [
    {
      title: 'Ketentuan Khusus Kepala Sekolah',
      body: 'Sebagai kepala sekolah, Anda memiliki akses ke data seluruh warga sekolah untuk tujuan pengawasan, evaluasi, dan pelaporan. Anda bertanggung jawab memastikan data warga sekolah dilindungi dan diolah sesuai ketentuan.',
    },
  ],
  TATA_USAHA: [
    {
      title: 'Ketentuan Khusus Tata Usaha',
      body: 'Sebagai staf tata usaha, data yang Anda kelola meliputi data keuangan (SPP), data PPDB, dan data administrasi sekolah lainnya. Data-data ini tunduk pada kebijakan retensi dan pelindungan data sekolah.',
    },
  ],
  INDUSTRI: [
    {
      title: 'Ketentuan Khusus Mitra Industri',
      body: 'Sebagai mitra industri, data siswa PKL/Prakerin yang Anda terima terbatas pada keperluan supervisi, evaluasi, dan pelaporan kegiatan industri. Anda tidak diperkenankan menggunakan data siswa untuk tujuan di luar kesepakatan.',
    },
  ],
  SUPER_ADMIN: [
    {
      title: 'Ketentuan Khusus Super Admin',
      body: 'Sebagai super admin, Anda bertanggung jawab atas integritas sistem dan pelindungan data seluruh pengguna. Anda memiliki akses penuh ke seluruh data dalam sistem dan wajib memastikan kepatuhan terhadap kebijakan pelindungan data.',
    },
  ],
};

/**
 * Get all LoA clauses for a given role.
 */
export function getLoaClauses(role: string): LoaClause[] {
  const roleClauses = ROLE_CLAUSES[role] ?? [];
  return [...UNIVERSAL_CLAUSES, ...roleClauses];
}
