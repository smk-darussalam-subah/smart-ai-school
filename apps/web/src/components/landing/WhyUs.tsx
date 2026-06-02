const values = [
  {
    icon: '☾',
    title: 'Pendidikan Berbasis Pesantren',
    desc: 'Pembinaan akhlak, ibadah, dan kemandirian setiap hari dalam lingkungan islami.',
  },
  {
    icon: '⚒',
    title: 'Praktik Industri Nyata',
    desc: 'Bengkel, lab, dan kemitraan PKL langsung dengan dunia usaha dan industri.',
  },
  {
    icon: '◈',
    title: 'Bursa Kerja Khusus (BKK)',
    desc: 'Penyaluran lulusan ke industri, jejaring alumni, dan rekrutmen mitra kerja.',
  },
] as const;

export function WhyUs() {
  return (
    <section id="kenapa" className="py-0 pb-[90px] bg-smk-cream">
      <div className="max-w-[1180px] mx-auto px-6">
        <div className="bg-smk-emerald-deep text-[#eafaf2] rounded-[24px] md:rounded-[32px] p-8 md:p-16 grid md:grid-cols-2 gap-8 md:gap-14 items-center">
          {/* Left */}
          <div>
            <div className="font-bold text-[13px] tracking-[0.12em] uppercase text-smk-lime mb-3.5">
              Kenapa Darussalam
            </div>
            <h2 className="font-fraunces font-semibold text-[clamp(26px,3.4vw,40px)] leading-[1.1] tracking-tight text-white">
              Bukan sekadar sekolah kejuruan.
            </h2>
            <p className="mt-3.5 text-[16px] text-[#a9cdbd] leading-relaxed">
              Di sini, keahlian teknis tumbuh bersama karakter. Kamu belajar skill
              yang laku di dunia kerja, sekaligus dibimbing adab dan agama dalam
              lingkungan pesantren.
            </p>
          </div>

          {/* Right: value list */}
          <div className="flex flex-col gap-5">
            {values.map((v) => (
              <div key={v.title} className="flex gap-4 items-start">
                <div className="flex-shrink-0 w-[46px] h-[46px] rounded-xl bg-smk-lime/16 text-smk-lime grid place-items-center text-[22px]">
                  {v.icon}
                </div>
                <div>
                  <b className="text-[17px] text-white font-semibold">{v.title}</b>
                  <p className="text-[14px] text-[#a9cdbd] mt-1 leading-snug">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
