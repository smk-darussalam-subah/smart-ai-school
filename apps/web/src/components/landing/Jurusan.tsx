const jurusan = [
  {
    num: '01',
    icon: '⚙',
    name: 'Teknik Otomotif',
    sub: 'TKRO & TBSM',
    desc: 'Perawatan & perbaikan kendaraan ringan dan sepeda motor, kelistrikan otomotif — dengan praktik bengkel nyata.',
    variant: 'dark' as const,
  },
  {
    num: '02',
    icon: '🖧',
    name: 'Jaringan & Telekomunikasi',
    sub: 'TJKT',
    desc: 'Instalasi jaringan, server, fiber optik, dan infrastruktur internet — bidang yang paling dibutuhkan industri digital.',
    variant: 'sand' as const,
  },
  {
    num: '03',
    icon: '▦',
    name: 'Akuntansi & Keuangan',
    sub: 'AKL',
    desc: 'Pembukuan, perpajakan, dan administrasi keuangan lembaga — keterampilan yang dipakai di setiap perusahaan.',
    variant: 'lime' as const,
  },
] as const;

const variantStyles = {
  dark: {
    card: 'bg-[#073f2f] text-[#d7efe4] border-transparent',
    icon: 'bg-smk-lime/18 text-smk-lime',
    desc: 'text-[#a9cdbd]',
    go: 'text-smk-lime',
  },
  sand: {
    card: 'bg-smk-sand text-smk-ink border-smk-ink/10',
    icon: 'bg-[#e7f3ec] text-smk-emerald-deep',
    desc: 'text-smk-ink-soft',
    go: 'text-smk-emerald-deep',
  },
  lime: {
    card: 'bg-smk-lime text-[#22330a] border-transparent',
    icon: 'bg-smk-emerald-deep/12 text-smk-emerald-deep',
    desc: 'text-[#3f5417]',
    go: 'text-smk-emerald-deep',
  },
} as const;

export function Jurusan() {
  return (
    <section id="jurusan" className="py-[90px] bg-smk-cream">
      <div className="max-w-[1180px] mx-auto px-6">
        <div className="max-w-[640px] mb-12">
          <div className="font-bold text-[13px] tracking-[0.12em] uppercase text-smk-emerald mb-3.5">
            Program Keahlian
          </div>
          <h2 className="font-fraunces font-semibold text-[clamp(28px,3.4vw,42px)] leading-[1.1] tracking-tight text-smk-ink">
            Tiga jurusan, satu tujuan: lulusan siap kerja.
          </h2>
          <p className="mt-3.5 text-[17px] text-smk-ink-soft leading-relaxed">
            Kurikulum berbasis industri dipadu nilai pesantren. Pilih jalur yang sesuai
            dengan minat dan masa depanmu.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-[18px]">
          {jurusan.map((j) => {
            const s = variantStyles[j.variant];
            return (
              <div
                key={j.num}
                className={`relative rounded-[22px] p-7 min-h-[280px] flex flex-col justify-between overflow-hidden border transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_26px_50px_-28px_rgba(6,69,52,0.5)] cursor-pointer ${s.card}`}
              >
                <div>
                  <div className={`w-14 h-14 rounded-[14px] grid place-items-center text-[30px] mb-4 ${s.icon}`}>
                    {j.icon}
                  </div>
                  <div className="font-fraunces text-[15px] opacity-50">{j.num}</div>
                  <h3 className="font-fraunces font-semibold text-[26px] leading-tight tracking-tight mt-2 mb-1">
                    {j.name}
                  </h3>
                  <p className={`text-[11px] font-semibold tracking-widest uppercase mb-2 ${s.go}`}>
                    {j.sub}
                  </p>
                  <p className={`text-sm leading-[1.55] ${s.desc}`}>{j.desc}</p>
                </div>
                <span className={`inline-flex items-center gap-2 font-semibold text-sm mt-5 ${s.go}`}>
                  Selengkapnya →
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
