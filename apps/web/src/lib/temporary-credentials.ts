export interface TemporaryCredential {
  username: string;
  tempPassword: string;
  role?: string;
  fullName?: string;
}
export const credentialRoleLabel = (role?: string) =>
  role === 'SISWA' ? 'Siswa' : role === 'ORANG_TUA' ? 'Orang Tua/Wali' : 'Akun';

/** One shared parent can appear in several import rows. Conflicting passwords
 * must be resolved explicitly, never silently exported as a valid credential. */
export function uniqueTemporaryCredentials(
  rows: readonly TemporaryCredential[],
): TemporaryCredential[] {
  const unique = new Map<string, TemporaryCredential>();
  for (const row of rows) {
    if (!row.username || !row.tempPassword) throw Error('Kredensial belum lengkap.');
    const previous = unique.get(row.username);
    if (previous && previous.tempPassword !== row.tempPassword)
      throw Error(
        'Ada dua password berbeda untuk satu akun. Periksa hasil penerbitan sebelum mengekspor.',
      );
    unique.set(row.username, { ...previous, ...row });
  }
  return [...unique.values()];
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export function temporaryCredentialsHtml(
  rows: readonly TemporaryCredential[],
  origin: string,
): string {
  const data = uniqueTemporaryCredentials(rows);
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw Error('Alamat aplikasi tidak valid.');
  return `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DIIS — Akses sementara</title><style>
    body{font:14px/1.6 system-ui;color:#153f32;max-width:900px;margin:24px auto;padding:0 18px}h1{font-size:22px}article{break-inside:avoid;border:1px solid #cbdcd5;border-top:4px solid #087354;border-radius:8px;padding:18px;margin:16px 0}dl{display:grid;grid-template-columns:150px 1fr;gap:7px;margin:12px 0}dt{color:#475569}dd{margin:0;overflow-wrap:anywhere}code{font:16px ui-monospace,monospace;color:#111827}button{min-height:44px;padding:10px 18px;border:0;border-radius:8px;background:#087354;color:white}small{color:#475569}@media print{.toolbar{display:none}body{margin:0}article{page-break-inside:avoid}}
    </style><div class="toolbar"><h1>DIIS — Akses sementara</h1><p>Simpan sebagai PDF untuk dibagikan kepada pemilik akun yang tepat.</p></div>${data.map((row) => `<article><strong>DIIS · ${escape(credentialRoleLabel(row.role))}</strong>${row.fullName ? `<h2>${escape(row.fullName)}</h2>` : ''}<dl><dt>Alamat masuk</dt><dd>${escape(url.origin)}/login</dd><dt>Nama pengguna</dt><dd><code>${escape(row.username)}</code></dd><dt>Password sementara</dt><dd><code>${escape(row.tempPassword)}</code></dd></dl><small>Wajib mengganti password saat masuk. Simpan dan sampaikan dokumen ini secara pribadi.</small></article>`).join('')}</html>`;
}
export function temporaryCredentialSheets(rows: readonly TemporaryCredential[], origin: string) {
  const data = uniqueTemporaryCredentials(rows);
  return ['SISWA', 'ORANG_TUA', 'LAIN'].flatMap((role) => {
    const group = data.filter((row) =>
      role === 'LAIN' ? !['SISWA', 'ORANG_TUA'].includes(row.role ?? '') : row.role === role,
    );
    if (!group.length) return [];
    const cell = (value: string, heading = false) => ({
      type: String,
      value,
      ...(heading ? { fontWeight: 'bold' as const, backgroundColor: '#E8F5EF' } : {}),
      wrap: true,
    });
    return [
      {
        sheet: role === 'SISWA' ? 'Siswa' : role === 'ORANG_TUA' ? 'Orang Tua' : 'Akun',
        data: [
          [
            'Nama',
            'Peran',
            'Nama pengguna',
            'Password sementara',
            'Alamat masuk',
            'Saat masuk',
          ].map((value) => cell(value, true)),
          ...group.map((row) =>
            [
              row.fullName ?? '',
              credentialRoleLabel(row.role),
              row.username,
              row.tempPassword,
              `${new URL(origin).origin}/login`,
              'Wajib mengganti password',
            ].map((value) => cell(value)),
          ),
        ],
      },
    ];
  });
}
