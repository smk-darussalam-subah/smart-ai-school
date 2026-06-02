import Image from 'next/image';

const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-smk-cream">
      {/* Subtle bg texture */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 50%, #064534 0%, transparent 50%), radial-gradient(circle at 80% 20%, #c5f04a 0%, transparent 40%)',
        }}
      />

      <div className="max-w-[1180px] mx-auto px-5 md:px-6 grid md:grid-cols-[1.1fr_0.9fr] gap-8 md:gap-10 items-center py-12 md:py-[72px]">
        {/* LEFT */}
        <div className="order-2 md:order-1">
          {/* Eyebrow pill */}
          <div className="inline-flex items-center gap-2 bg-[#e7f3ec] text-smk-emerald-deep font-semibold text-[12px] md:text-[13px] px-3.5 py-1.5 rounded-full mb-5 md:mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-smk-emerald-bright animate-pulse inline-block" />
            SPMB 2026/2027 Telah Dibuka
          </div>

          <h1 className="font-fraunces font-semibold leading-[1.04] tracking-tight text-smk-ink text-[36px] sm:text-[44px] md:text-[clamp(40px,5vw,62px)]">
            Berakhlak,
            <br />
            Berkeahlian,
            <br />
            <em className="not-italic text-smk-emerald">Siap Masa Depan.</em>
          </h1>

          <p className="mt-4 md:mt-5 mb-6 md:mb-8 text-base md:text-[17px] text-smk-ink-soft max-w-[44ch] leading-relaxed">
            SMK Darussalam Subah memadukan pendidikan pesantren dengan keahlian
            vokasi terkini — lulusan santun, terampil, dan melek teknologi.
          </p>

          <div className="flex gap-3 flex-wrap">
            <a
              href={SPMB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-semibold text-[14px] md:text-[15px] px-5 md:px-6 py-3 md:py-3.5 rounded-full bg-smk-emerald-deep text-white hover:bg-smk-emerald hover:-translate-y-px transition-all shadow-sm shadow-smk-emerald-deep/30"
            >
              Daftar Sekarang <span aria-hidden>→</span>
            </a>
            <a
              href="#jurusan"
              className="inline-flex items-center gap-2 font-semibold text-[14px] md:text-[15px] px-5 md:px-6 py-3 md:py-3.5 rounded-full border-[1.5px] border-smk-ink/12 text-smk-ink hover:border-smk-emerald hover:text-smk-emerald transition-all"
            >
              Jelajahi Jurusan
            </a>
          </div>

          {/* Trust stats */}
          <div className="flex gap-5 md:gap-8 mt-8 md:mt-10 pt-6 md:pt-8 border-t border-smk-ink/8 flex-wrap">
            {[
              { val: '3', label: 'Program Keahlian' },
              { val: '234', label: 'Kursi Tersedia' },
              { val: '2008', label: 'Sejak Berdiri' },
            ].map((s) => (
              <div key={s.label}>
                <b className="block font-fraunces font-semibold text-2xl md:text-[26px] text-smk-ink leading-none">
                  {s.val}
                </b>
                <span className="text-[12px] md:text-[13px] text-smk-ink-soft mt-1 block">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — collage */}
        <div className="order-1 md:order-2 relative h-[300px] sm:h-[380px] md:h-[500px]">
          {/* Main large card */}
          <div className="absolute inset-0 right-[26%] bottom-[32%] rounded-[20px] md:rounded-[24px] overflow-hidden bg-gradient-to-br from-[#0e7a5b] to-[#06392b]">
            {/* TODO: ganti dengan <Image> foto nyata dari IG */}
            <div className="absolute inset-0 flex flex-col justify-end p-4">
              <span className="inline-block bg-black/25 text-white/70 text-[10px] px-2 py-1 rounded-md backdrop-blur-sm">
                [Ganti: foto suasana belajar]
              </span>
            </div>
          </div>

          {/* Top-right card */}
          <div className="absolute top-[4%] right-0 w-[47%] h-[47%] rounded-[16px] md:rounded-[20px] overflow-hidden bg-gradient-to-br from-[#13361f] to-smk-emerald">
            <div className="absolute inset-0 flex flex-col justify-end p-3">
              <span className="inline-block bg-black/25 text-white/70 text-[10px] px-2 py-1 rounded-md backdrop-blur-sm">
                [Ganti: foto kegiatan santri]
              </span>
            </div>
          </div>

          {/* Bottom-right card */}
          <div className="absolute bottom-0 right-[4%] w-[43%] h-[38%] rounded-[16px] md:rounded-[20px] overflow-hidden bg-gradient-to-br from-smk-lime to-[#7fae1b]">
            <div className="absolute inset-0 flex flex-col justify-end p-3">
              <span className="inline-block bg-black/15 text-[#22330a]/70 text-[10px] px-2 py-1 rounded-md backdrop-blur-sm">
                [Ganti: foto bengkel & lab]
              </span>
            </div>
          </div>

          {/* Floating badge — Akreditasi */}
          <div className="absolute left-[-4px] md:left-[-12px] bottom-[28%] bg-white border border-smk-ink/10 rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3 flex items-center gap-2.5 shadow-[0_12px_32px_-16px_rgba(6,69,52,0.45)]">
            <div className="relative w-8 h-8 md:w-9 md:h-9 flex-shrink-0">
              <Image
                src="/landing/logo-smk.jpg"
                alt="Logo SMK Darussalam Subah"
                fill
                className="object-contain rounded-lg"
                sizes="36px"
              />
            </div>
            <div>
              <b className="text-[12px] md:text-sm text-smk-ink block">Akreditasi B</b>
              <small className="text-[10px] md:text-[11px] text-smk-ink-soft">
                BAN-S/M · NPSN 20350670
              </small>
            </div>
          </div>

          {/* Decorative dot pattern */}
          <div
            aria-hidden
            className="absolute -top-3 -right-3 w-20 h-20 opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(circle, #064534 1px, transparent 1px)',
              backgroundSize: '8px 8px',
            }}
          />
        </div>
      </div>
    </section>
  );
}
