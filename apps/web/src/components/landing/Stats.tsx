const stats = [
  { value: '3', label: 'Program Keahlian', sub: 'TO · TJKT · AKL' },
  { value: '318', label: 'Siswa Aktif', sub: 'Tahun ajaran 2025/2026' },
  { value: '2008', label: 'Tahun Berdiri', sub: '15+ tahun pengalaman' },
  { value: 'B', label: 'Akreditasi', sub: 'BAN-S/M Kemdikbud' },
] as const;

export function Stats() {
  return (
    <section id="profil" className="py-[70px] md:py-[90px] bg-smk-cream">
      <div className="max-w-[1180px] mx-auto px-5 md:px-6">
        <div className="text-center mb-8 md:mb-12">
          <div className="font-bold text-[12px] md:text-[13px] tracking-[0.12em] uppercase text-smk-emerald mb-3">
            Sekolah dalam Angka
          </div>
          <h2 className="font-fraunces font-semibold text-[clamp(24px,3.2vw,38px)] leading-tight tracking-tight text-smk-ink">
            Satu dekade lebih membangun generasi.
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`rounded-[18px] md:rounded-[22px] px-5 md:px-6 py-6 md:py-8 text-center flex flex-col items-center ${
                i === 0
                  ? 'bg-smk-emerald-deep text-white'
                  : 'bg-smk-sand text-smk-ink'
              }`}
            >
              <b
                className={`font-fraunces font-semibold text-[clamp(32px,5vw,50px)] leading-none mb-2 ${
                  i === 0 ? 'text-smk-lime' : 'text-smk-emerald'
                }`}
              >
                {s.value}
              </b>
              <span
                className={`text-[13px] md:text-sm font-semibold block ${
                  i === 0 ? 'text-white' : 'text-smk-ink'
                }`}
              >
                {s.label}
              </span>
              <span
                className={`text-[11px] md:text-[12px] mt-1 block ${
                  i === 0 ? 'text-smk-lime/70' : 'text-smk-ink-soft'
                }`}
              >
                {s.sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
