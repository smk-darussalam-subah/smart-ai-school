const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';

const jurusan = [
  {
    num: '01',
    emoji: '⚙',
    name: 'Teknik Otomotif',
    sub: 'TKRO & TBSM',
    desc: 'Perawatan & perbaikan kendaraan ringan dan sepeda motor, sistem kelistrikan, hingga teknologi mesin terkini — dengan praktik bengkel nyata berstandar industri.',
    tags: ['Kendaraan Ringan', 'Sepeda Motor', 'Kelistrikan'],
    variant: 'dark' as const,
  },
  {
    num: '02',
    emoji: '🖧',
    name: 'Jaringan & Telekomunikasi',
    sub: 'TJKT',
    desc: 'Instalasi jaringan komputer, server, fiber optik, dan infrastruktur digital — kompetensi paling dibutuhkan di era industri 4.0.',
    tags: ['Network', 'Fiber Optik', 'Server'],
    variant: 'sand' as const,
  },
  {
    num: '03',
    emoji: '▦',
    name: 'Akuntansi & Keuangan',
    sub: 'AKL',
    desc: 'Pembukuan, perpajakan, dan administrasi keuangan lembaga — keterampilan fundamental yang dibutuhkan semua jenis usaha.',
    tags: ['Pembukuan', 'Perpajakan', 'Administrasi'],
    variant: 'lime' as const,
  },
] as const;

const styles = {
  dark: {
    card: 'bg-[#073f2f] text-[#d7efe4]',
    num: 'text-smk-lime/50',
    title: 'text-[#d7efe4]',
    ico: 'bg-smk-lime/15 text-smk-lime',
    desc: 'text-[#a9cdbd]',
    tag: 'bg-white/10 text-smk-lime/80',
    go: 'text-smk-lime',
    border: 'border-white/5',
  },
  sand: {
    card: 'bg-white text-smk-ink',
    num: 'text-smk-ink/30',
    title: 'text-smk-ink',
    ico: 'bg-[#e7f3ec] text-smk-emerald-deep',
    desc: 'text-smk-ink-soft',
    tag: 'bg-smk-emerald/8 text-smk-emerald-deep',
    go: 'text-smk-emerald-deep',
    border: 'border-smk-ink/8',
  },
  lime: {
    card: 'bg-smk-lime text-[#22330a]',
    num: 'text-[#22330a]/30',
    title: 'text-[#22330a]',
    ico: 'bg-smk-emerald-deep/12 text-smk-emerald-deep',
    desc: 'text-[#3f5417]',
    tag: 'bg-smk-emerald-deep/10 text-smk-emerald-deep',
    go: 'text-smk-emerald-deep',
    border: 'border-[#22330a]/10',
  },
} as const;

export function Jurusan() {
  return (
    <section id="jurusan" className="py-[70px] md:py-[90px] bg-smk-cream">
      <div className="max-w-[1180px] mx-auto px-5 md:px-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10 md:mb-12">
          <div className="max-w-[560px]">
            <div className="font-bold text-[12px] md:text-[13px] tracking-[0.12em] uppercase text-smk-emerald mb-3">
              Program Keahlian
            </div>
            <h2 className="font-fraunces font-semibold text-[clamp(26px,3.4vw,42px)] leading-[1.1] tracking-tight text-smk-ink">
              Tiga jurusan, satu tujuan: lulusan siap kerja.
            </h2>
          </div>
          <p className="text-[14px] md:text-[15px] text-smk-ink-soft max-w-[36ch] md:text-right leading-relaxed">
            Kurikulum berbasis industri, dipadu nilai pesantren. Pilih jalur sesuai
            minat dan masa depanmu.
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-[18px]">
          {jurusan.map((j) => {
            const s = styles[j.variant];
            return (
              <div
                key={j.num}
                className={`relative rounded-[20px] md:rounded-[22px] p-6 md:p-7 min-h-[280px] md:min-h-[300px] flex flex-col justify-between border transition-all duration-200 hover:-translate-y-1.5 hover:shadow-[0_24px_48px_-24px_rgba(6,69,52,0.45)] ${s.card} ${s.border}`}
              >
                {/* Icon */}
                <div>
                  <div
                    className={`w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-[14px] grid place-items-center text-2xl md:text-3xl mb-5 ${s.ico}`}
                  >
                    {j.emoji}
                  </div>
                  <p className={`font-fraunces text-sm mb-1.5 ${s.num}`}>{j.num}</p>
                  <h3 className={`font-fraunces font-semibold text-[22px] md:text-2xl leading-tight tracking-tight mb-1 ${s.title}`}>
                    {j.name}
                  </h3>
                  <p className={`text-[11px] font-bold tracking-widest uppercase mb-3 ${s.go}`}>
                    {j.sub}
                  </p>
                  <p className={`text-[13px] md:text-sm leading-[1.6] ${s.desc}`}>{j.desc}</p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {j.tags.map((t) => (
                      <span
                        key={t}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${s.tag}`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <a
                  href={SPMB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 font-semibold text-[13px] md:text-sm mt-5 ${s.go}`}
                >
                  Daftar Jurusan Ini →
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
