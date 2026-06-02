const stats = [
  { value: '3', label: 'Program keahlian' },
  { value: '318', label: 'Siswa aktif' },
  { value: '2008', label: 'Tahun berdiri' },
  { value: 'B', label: 'Akreditasi BAN-S/M' },
] as const;

export function Stats() {
  return (
    <section id="profil" className="py-0 pb-[90px] bg-smk-cream">
      <div className="max-w-[1180px] mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-5 text-center">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-smk-sand rounded-2xl py-8 px-4 flex flex-col items-center"
            >
              <b className="font-fraunces font-semibold text-[clamp(34px,4vw,50px)] text-smk-emerald leading-none">
                {s.value}
              </b>
              <span className="block text-smk-ink-soft text-sm mt-2 leading-snug">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
