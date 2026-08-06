import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ModulAjarView from '../components/academic/ModulAjarView';
import type { ModulAjarBody } from '../app/dashboard/akademik/_components/guru-types';

describe('ModulAjarView full-fidelity renderer', () => {
  it('renders current graduate profile and every structured Modul Ajar section', () => {
    const body: ModulAjarBody = {
      cp: 'CP resmi tersimpan',
      tp: ['TP pertama'],
      atp: [{ tpRef: 'TP 1', indikator: 'Indikator ATP' }],
      profilDimensi: ['Kolaborasi', 'Komunikasi'],
      profilUraian: 'Aktivitas profil lulusan.',
      kegiatan: [{
        pertemuan: 'Pertemuan 1',
        pendahuluan: 'Pembuka',
        inti: 'Inti',
        penutup: 'Penutup',
        diferensiasi: 'Diferensiasi',
      }],
      asesmenDiagnostik: 'Diagnostik',
      asesmenFormatif: 'Formatif',
      asesmenSumatif: 'Sumatif',
      pengayaan: 'Pengayaan',
      remedial: 'Remedial',
      refleksiGuru: 'Refleksi guru',
      refleksiSiswa: 'Refleksi siswa',
      lampiran: 'Lampiran',
      lampiranUrl: 'https://example.com/lampiran.pdf',
    };

    const html = renderToStaticMarkup(createElement(ModulAjarView, { body, academicYear: '2026/2027' }));

    expect(html).toContain('Dimensi Profil Lulusan');
    expect(html).not.toContain('Profil Pelajar Pancasila');
    for (const text of [
      'CP resmi tersimpan',
      'TP pertama',
      'Indikator ATP',
      'Kolaborasi',
      'Pembuka',
      'Inti',
      'Penutup',
      'Diferensiasi',
      'Diagnostik',
      'Formatif',
      'Sumatif',
      'Pengayaan',
      'Remedial',
      'Refleksi guru',
      'Refleksi siswa',
      'https://example.com/lampiran.pdf',
    ]) {
      expect(html).toContain(text);
    }
  });
});
