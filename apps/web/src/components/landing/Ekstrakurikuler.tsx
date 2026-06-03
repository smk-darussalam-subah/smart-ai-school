import { DockStrip } from './DockStrip';

/**
 * Ekstrakurikuler & Pembinaan Karakter section.
 * V3: 6 kartu ekskul resmi dari KSP.
 * V6: 4 foto seragam dengan DockStrip (dock magnify effect).
 *
 * Server Component — DockStrip adalah 'use client' boundary.
 */

const EKSKUL = [
  {
    icon: '⚜️',
    title: 'Pramuka',
    desc: 'Melatih kemandirian, kedisiplinan, dan kepemimpinan — fondasi Profil Pelajar Pancasila yang tangguh.',
    tags: ['Kepemimpinan', 'Disiplin', 'Mandiri'],
  },
  {
    icon: '🗣️',
    title: 'Jurnalistik',
    desc: 'Mengembangkan berpikir kritis, menulis, dan komunikasi efektif — menyuarakan ide lewat tulisan dan media.',
    tags: ['Bernalar Kritis', 'Komunikatif', 'Kreatif'],
  },
  {
    icon: '☪️',
    title: 'IPNU-IPPNU',
    desc: 'Kajian keagamaan, tahfidz, dan pengembangan akhlak — karakter religius dan rahmatan lil \'alamin.',
    tags: ['Religius', 'Akhlak Mulia', 'Toleran'],
  },
  {
    icon: '🌐',
    title: 'English Club',
    desc: 'Melatih percakapan, debat, dan presentasi dalam Bahasa Inggris — siap bersaing di era global.',
    tags: ['Bahasa Inggris', 'Komunikatif', 'Global'],
  },
  {
    icon: '🩺',
    title: 'PMR',
    desc: 'Palang Merah Remaja — melatih pertolongan pertama, kepedulian sosial, dan tanggung jawab kemanusiaan.',
    tags: ['Peduli Sosial', 'Tanggung Jawab', 'Kemanusiaan'],
  },
  {
    icon: '🏔️',
    title: 'Pecinta Alam',
    desc: 'Mengenal dan menjaga alam, melatih ketangguhan fisik dan mental melalui kegiatan outdoor bertanggung jawab.',
    tags: ['Cinta Alam', 'Mandiri', 'Tangguh'],
  },
] as const;

const VALUES = [
  { label: 'Beriman & Bertaqwa', color: 'bg-smk-emerald-deep text-smk-lime' },
  { label: 'Mandiri', color: 'bg-smk-lime text-[#22330a]' },
  { label: 'Kreatif', color: 'bg-smk-sand text-smk-ink border border-smk-ink/10' },
  { label: 'Bernalar Kritis', color: 'bg-smk-emerald text-white' },
  { label: 'Kolaboratif', color: 'bg-smk-sand text-smk-ink border border-smk-ink/10' },
  { label: 'Komunikatif', color: 'bg-smk-emerald-deep text-smk-lime' },
] as const;

const SERAGAM = [
  { src: '/landing/seragam-olahraga.jpg', alt: 'Seragam olahraga siswa SMK Darussalam Subah', label: 'Olahraga' },
  { src: '/landing/seragam-tjkt.jpg',     alt: 'Seragam jurusan TJKT SMK Darussalam Subah',  label: 'TJKT' },
  { src: '/landing/seragam-akl.jpg',      alt: 'Seragam jurusan AKL SMK Darussalam Subah',   label: 'AKL' },
  { src: '/landing/seragam-to.jpg',       alt: 'Seragam jurusan TKRO SMK Darussalam Subah',  label: 'TO' },
] as const;

export function Ekstrakurikuler() {
  return (
    <section id="ekskul" className="bg-smk-cream py-[70px] md:py-[90px]">
      <div className="mx-auto max-w-[1180px] px-5 md:px-6">

        {/* ── HEADER ── */}
        <div className="mb-10 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[520px]">
            <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-smk-emerald md:text-[13px]">
              Ekstrakurikuler &amp; Karakter
            </div>
            <h2 className="font-fraunces text-[clamp(26px,3.4vw,42px)] font-semibold leading-[1.1] tracking-tight text-smk-ink">
              Skill kerja tumbuh bersama akhlak mulia.
            </h2>
          </div>
          <p className="max-w-[38ch] text-[14px] leading-relaxed text-smk-ink-soft md:text-right md:text-[15px]">
            Pesantren bukan sekadar tempat menginap — ini ekosistem pembentukan
            karakter yang hidup setiap hari.
          </p>
        </div>

        {/* ── PROFIL PELAJAR PANCASILA ── */}
        <div className="mb-8 flex flex-wrap items-center gap-3 rounded-[16px] border border-smk-ink/8 bg-smk-sand px-5 py-4 md:rounded-[18px]">
          <p className="text-[11px] font-bold uppercase tracking-widest text-smk-ink-soft">
            Profil Pelajar Pancasila
          </p>
          <div className="flex flex-wrap gap-1.5">
            {VALUES.map((v) => (
              <span
                key={v.label}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold md:text-[12px] ${v.color}`}
              >
                {v.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── 6 EKSKUL CARDS GRID ── */}
        <div className="mb-10 grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
          {EKSKUL.map((e) => (
            <div
              key={e.title}
              className="flex gap-4 rounded-[18px] border border-smk-ink/8 bg-white p-5 md:rounded-[20px] md:p-6"
            >
              {/* Icon */}
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-smk-sand text-2xl md:h-12 md:w-12 md:rounded-[14px]">
                {e.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-fraunces mb-1 text-[15px] font-semibold text-smk-ink md:text-[17px]">
                  {e.title}
                </h3>
                <p className="mb-3 text-[12px] leading-[1.65] text-smk-ink-soft md:text-[13px]">
                  {e.desc}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {e.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-smk-emerald/10 px-2.5 py-0.5 text-[11px] font-medium text-smk-emerald-deep"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── SERAGAM STRIP dengan Dock Effect ── */}
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-smk-ink-soft">
            Seragam Siswa
          </p>
          <DockStrip items={SERAGAM} />
        </div>

      </div>
    </section>
  );
}
