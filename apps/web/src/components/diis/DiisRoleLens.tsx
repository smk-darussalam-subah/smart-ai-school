'use client';

import Image from 'next/image';
import { CheckCircle2 } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';

const roles = [
  {
    id: 'guru',
    label: 'Guru',
    image: '/diis/teacher-workflow.webp',
    imageAlt: 'Tampilan alur kerja guru di DIIS dari sesi mengajar hingga penilaian.',
    headline: 'Lebih banyak waktu untuk mengajar dan melihat siswa tumbuh.',
    body: 'Rencana pembelajaran, jadwal, kehadiran, penilaian, dan tindak lanjut tersedia dalam satu ruang kerja.',
    points: [
      'Pekerjaan akademik tersusun sesuai penugasan.',
      'Hasil belajar lebih mudah ditindaklanjuti.',
    ],
  },
  {
    id: 'siswa',
    label: 'Siswa',
    image: '/diis/student-experience.webp',
    imageAlt: 'Tampilan pengalaman belajar siswa pada aplikasi DIIS.',
    headline: 'Tahu apa yang perlu dipelajari, dikerjakan, dan diperbaiki.',
    body: 'Siswa dapat melihat jadwal, modul, tugas, nilai, dan capaian dari ponsel maupun komputer.',
    points: [
      'Belajar tetap terarah di ponsel maupun komputer.',
      'Nilai dan capaian belajar lebih mudah dipantau.',
    ],
  },
  {
    id: 'orang-tua',
    label: 'Orang Tua',
    image: '/diis/parent-experience.webp',
    imageAlt: 'Tampilan informasi kehadiran dan perkembangan siswa untuk orang tua.',
    headline: 'Lebih dekat dengan perjalanan anak, lebih siap memberi dukungan.',
    body: 'Orang tua dapat mengikuti kehadiran, jadwal, dan perkembangan anak serta berkomunikasi lebih baik dengan sekolah.',
    points: [
      'Setiap orang tua hanya melihat informasi anak yang terhubung dengannya.',
      'Kabar penting sekolah lebih mudah dipahami.',
    ],
  },
  {
    id: 'tata-usaha',
    label: 'Tata Usaha',
    image: '/diis/product-overview.webp',
    imageAlt: 'Tampilan DIIS pada komputer, tablet, dan ponsel untuk pekerjaan sekolah.',
    headline: 'Data sekolah lebih rapi, pekerjaan lebih mudah dituntaskan.',
    body: 'Penerimaan siswa, data sekolah, administrasi, dan komunikasi tersusun dalam alur kerja yang saling terhubung.',
    points: [
      'Alur penerimaan, data sekolah, dan komunikasi lebih tertata.',
      'Pekerjaan penting lebih mudah ditelusuri.',
    ],
  },
  {
    id: 'pimpinan',
    label: 'Pimpinan',
    image: '/diis/executive-dashboard.webp',
    imageAlt: 'Tampilan dashboard eksekutif DIIS untuk pimpinan sekolah.',
    headline: 'Melihat keadaan lebih dini, menggerakkan tindak lanjut lebih pasti.',
    body: 'Ringkasan operasional dan akademik membantu pimpinan memusatkan perhatian pada hal yang benar-benar perlu keputusan.',
    points: [
      'Kondisi sekolah terlihat dalam satu pandangan.',
      'Keputusan dan persetujuan tetap pada pejabat berwenang.',
    ],
  },
  {
    id: 'industri',
    label: 'Mitra Industri',
    image: '/diis/connected-school-day.webp',
    imageAlt:
      'Guru, siswa, orang tua, pengelola sekolah, dan mitra industri terhubung dalam alur DIIS.',
    headline: 'Kerja sama sekolah dan dunia industri lebih mudah diikuti.',
    body: 'Kegiatan bersama, praktik kerja lapangan, dan peluang bagi siswa dapat dikelola dengan informasi yang sesuai kebutuhan mitra.',
    points: [
      'Kegiatan PKL dan hubungan industri lebih terarah.',
      'Informasi mitra tetap terbatas pada kegiatan yang berkaitan.',
    ],
  },
] as const;

export function DiisRoleLens() {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeRole = roles[activeIndex] ?? roles[0];

  const selectAndFocus = (index: number) => {
    setActiveIndex(index);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      selectAndFocus((index + 1) % roles.length);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      selectAndFocus((index - 1 + roles.length) % roles.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectAndFocus(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectAndFocus(roles.length - 1);
    }
  };

  return (
    <div className="mt-10 md:mt-14">
      <div className="grid grid-cols-2 gap-2 min-[421px]:grid-cols-[140px_minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)] md:gap-5">
        <div
          role="tablist"
          aria-label="Pilih pengguna DIIS"
          className="col-span-2 grid grid-cols-2 gap-2 min-[421px]:col-span-1 min-[421px]:grid-cols-1 min-[421px]:content-start"
        >
          {roles.map((role, index) => (
            <button
              key={role.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`diis-role-tab-${role.id}`}
              type="button"
              role="tab"
              aria-selected={activeIndex === index}
              aria-controls={`diis-role-panel-${role.id}`}
              tabIndex={activeIndex === index ? 0 : -1}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className="min-h-12 border border-smk-emerald/15 bg-white px-3 py-2 text-left text-sm font-semibold text-smk-ink transition-colors hover:border-smk-emerald/40 hover:text-smk-emerald focus:outline-none focus-visible:ring-2 focus-visible:ring-smk-emerald focus-visible:ring-offset-2 aria-selected:border-smk-emerald aria-selected:bg-smk-emerald-deep aria-selected:text-white md:min-h-14 md:px-4 md:text-base"
            >
              {role.label}
            </button>
          ))}
        </div>

        <article
          id={`diis-role-panel-${activeRole.id}`}
          role="tabpanel"
          aria-labelledby={`diis-role-tab-${activeRole.id}`}
          tabIndex={0}
          className="col-span-2 min-w-0 overflow-hidden border border-smk-emerald/15 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-smk-emerald min-[421px]:col-span-1"
        >
          <div className="relative aspect-[16/9] overflow-hidden border-b border-smk-emerald/10 bg-[#061c20]">
            <Image
              key={activeRole.image}
              src={activeRole.image}
              alt={activeRole.imageAlt}
              fill
              sizes="(max-width: 420px) 100vw, (max-width: 768px) calc(100vw - 180px), 900px"
              className="object-contain"
            />
          </div>
          <div className="p-5 md:p-8 lg:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-smk-emerald">
              Untuk {activeRole.label}
            </p>
            <h3 className="mt-3 max-w-3xl font-fraunces text-[clamp(1.55rem,3vw,2.35rem)] font-semibold leading-tight text-smk-ink">
              {activeRole.headline}
            </h3>
            <p className="mt-4 max-w-3xl text-[15px] leading-7 text-smk-ink-soft md:text-base">
              {activeRole.body}
            </p>
            <ul className="mt-6 grid gap-3 text-sm text-smk-ink md:grid-cols-2 md:text-[15px]">
              {activeRole.points.map((point) => (
                <li key={point} className="flex gap-2.5 leading-6">
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 flex-none text-smk-emerald"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </div>

      <noscript>
        <div className="mt-6 border-l-4 border-smk-emerald bg-white p-5 text-sm text-smk-ink-soft">
          DIIS mendukung Guru, Siswa, Orang Tua, Tata Usaha, Pimpinan, dan Mitra Industri dengan
          tampilan yang mengikuti tugas serta kewenangan masing-masing.
        </div>
      </noscript>
    </div>
  );
}
