const values = [
  {
    icon: '☾',
    title: 'Pendidikan Berbasis Pesantren',
    desc: 'Pembinaan akhlak, ibadah, dan kemandirian setiap hari — karakter yang tak ternilai untuk karir dan kehidupan.',
  },
  {
    icon: '⚒',
    title: 'Praktik Industri Nyata',
    desc: 'Bengkel, lab komputer, dan kemitraan PKL langsung dengan dunia usaha dan industri setempat.',
  },
  {
    icon: '◈',
    title: 'Bursa Kerja Khusus (BKK)',
    desc: 'Jaringan alumni dan penyaluran kerja aktif — lulusan kami ada di berbagai perusahaan se-Jawa Tengah.',
  },
] as const;

export function WhyUs() {
  return (
    <section id="kenapa" className="py-0 pb-[70px] md:pb-[90px] bg-smk-cream">
      <div className="max-w-[1180px] mx-auto px-5 md:px-6">
        <div className="bg-smk-emerald-deep rounded-[20px] md:rounded-[32px] p-7 md:p-16 grid md:grid-cols-[1fr_1.1fr] gap-8 md:gap-16 items-start">
          {/* Left */}
          <div>
            <div className="font-bold text-[12px] md:text-[13px] tracking-[0.12em] uppercase text-smk-lime mb-3 md:mb-3.5">
              Kenapa Darussalam
            </div>
            <h2 className="font-fraunces font-semibold text-[clamp(24px,3.2vw,40px)] leading-[1.1] tracking-tight text-white mb-4 md:mb-5">
              Bukan sekadar sekolah kejuruan.
            </h2>
            <p className="text-[14px] md:text-[15px] text-[#a9cdbd] leading-relaxed mb-6 md:mb-8">
              Di sini keahlian teknis tumbuh bersama karakter. Kamu belajar skill yang
              laku di dunia kerja, sekaligus dibimbing adab dan agama dalam lingkungan
              pesantren yang kondusif.
            </p>

            {/* Mini stat */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { val: '318+', label: 'Siswa aktif' },
                { val: '15+', label: 'Tahun berpengalaman' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-white/8 rounded-xl md:rounded-2xl px-4 py-3.5"
                >
                  <b className="block font-fraunces font-semibold text-2xl md:text-3xl text-smk-lime leading-none">
                    {s.val}
                  </b>
                  <span className="text-[12px] md:text-[13px] text-[#a9cdbd] mt-1 block">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: value list */}
          <div className="flex flex-col gap-4 md:gap-5">
            {values.map((v) => (
              <div
                key={v.title}
                className="flex gap-3.5 md:gap-4 items-start bg-white/6 rounded-xl md:rounded-2xl p-4 md:p-5 border border-white/8"
              >
                <div className="flex-shrink-0 w-10 h-10 md:w-11 md:h-11 rounded-xl bg-smk-lime/15 text-smk-lime grid place-items-center text-lg md:text-xl">
                  {v.icon}
                </div>
                <div>
                  <b className="text-[15px] md:text-[17px] text-white font-semibold block mb-1">
                    {v.title}
                  </b>
                  <p className="text-[13px] md:text-sm text-[#a9cdbd] leading-relaxed">
                    {v.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
