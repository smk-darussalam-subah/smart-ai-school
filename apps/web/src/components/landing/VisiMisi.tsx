// C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\apps\web\src\components\landing\VisiMisi.tsx

/**
 * VisiMisi section — official school vision & mission.
 * Left: large serif Visi text with indicator pills.
 * Right: numbered Misi list.
 *
 * Server Component — no client interactivity needed.
 */

const VISI =
  'Menjadi SMK Unggulan Berbasis Industri dan Teknologi yang menghasilkan lulusan Kompeten, Religius, Berkarakter, dan Siap Bersaing di Era Digital dan Hijau.';

const MISI: readonly string[] = [
  'Menyelenggarakan pembelajaran vokasi yang relevan dengan kebutuhan industri dan perkembangan teknologi terkini.',
  'Membentuk karakter peserta didik yang religius, disiplin, dan berakhlak mulia melalui pendidikan berbasis nilai pesantren.',
  'Mengembangkan kemitraan strategis dengan dunia usaha, industri, dan lembaga pendidikan tinggi untuk peningkatan kompetensi.',
  'Menyediakan fasilitas pembelajaran berstandar industri dan Teaching Factory (TEFA) guna menghasilkan pengalaman kerja nyata.',
  'Membudayakan inovasi, kreativitas, dan kewirausahaan dalam ekosistem pendidikan yang dinamis dan kolaboratif.',
  'Mendukung pembangunan berkelanjutan melalui literasi digital dan kepedulian terhadap lingkungan (Industri Hijau).',
];

const INDICATORS = [
  { label: 'Kompeten', color: 'bg-smk-emerald-deep text-white' },
  { label: 'Religius', color: 'bg-smk-lime text-[#22330a]' },
  { label: 'Berkarakter', color: 'bg-smk-sand text-smk-ink border border-smk-ink/10' },
  { label: 'Digital & Hijau', color: 'bg-smk-emerald text-white' },
] as const;

export function VisiMisi() {
  return (
    <section id="visi-misi" className="bg-smk-cream py-[70px] md:py-[90px]">
      <div className="mx-auto max-w-[1180px] px-5 md:px-6">
        {/* Section label */}
        <div className="mb-10 text-center md:mb-12">
          <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-smk-emerald md:text-[13px]">
            Visi &amp; Misi
          </div>
          <h2 className="font-fraunces text-[clamp(26px,3.4vw,42px)] font-semibold leading-[1.1] tracking-tight text-smk-ink">
            Arah yang jelas menuju sekolah unggul.
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr] md:gap-10 lg:gap-16">
          {/* ── LEFT: VISI ── */}
          <div className="flex flex-col justify-between gap-6 rounded-[20px] bg-smk-sand px-7 py-8 md:rounded-[24px] md:px-9 md:py-10">
            <div>
              <span className="mb-4 inline-block rounded-full bg-smk-emerald-deep px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-smk-lime md:text-[12px]">
                Visi Sekolah
              </span>

              <blockquote className="font-fraunces text-[clamp(18px,2.4vw,28px)] font-semibold leading-[1.3] tracking-tight text-smk-ink">
                &ldquo;{VISI}&rdquo;
              </blockquote>
            </div>

            {/* Indicator pills */}
            <div>
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-smk-ink-soft">
                Kata Kunci Visi
              </p>
              <div className="flex flex-wrap gap-2">
                {INDICATORS.map((ind) => (
                  <span
                    key={ind.label}
                    className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold md:text-[13px] ${ind.color}`}
                  >
                    {ind.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT: MISI ── */}
          <div>
            <span className="mb-5 inline-block rounded-full bg-[#e7f3ec] px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-smk-emerald-deep md:mb-6 md:text-[12px]">
              Misi Sekolah
            </span>

            <ol className="flex flex-col gap-4">
              {MISI.map((misi, idx) => (
                <li key={idx} className="flex gap-4 items-start">
                  <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-smk-emerald-deep text-[12px] font-bold text-smk-lime">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <p className="text-[14px] leading-[1.65] text-smk-ink-soft md:text-[15px]">
                    {misi}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
