const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-smk-cream">
      <div className="max-w-[1180px] mx-auto px-6 grid md:grid-cols-[1.05fr_0.95fr] gap-8 md:gap-12 items-center py-12 md:py-20">
        {/* Left: text */}
        <div>
          <span className="inline-flex items-center gap-2 bg-[#e7f3ec] text-smk-emerald-deep font-semibold text-[13px] px-4 py-2 rounded-full mb-5">
            <span className="w-2 h-2 rounded-full bg-smk-emerald-bright inline-block flex-shrink-0" />
            SPMB 2026/2027 Telah Dibuka
          </span>

          <h1 className="font-fraunces font-semibold text-[clamp(36px,5vw,62px)] leading-[1.04] tracking-tight text-smk-ink">
            Berakhlak,
            <br />
            Berkeahlian,
            <br />
            <em className="not-italic text-smk-emerald">Siap Masa Depan.</em>
          </h1>

          <p className="mt-5 mb-7 text-[17px] md:text-lg text-smk-ink-soft max-w-[46ch] leading-relaxed">
            SMK Darussalam Subah memadukan pendidikan pesantren dengan keahlian
            vokasi terkini — membentuk lulusan yang santun, terampil, dan melek
            teknologi.
          </p>

          <div className="flex gap-3 md:gap-4 flex-wrap">
            <a
              href={SPMB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-semibold text-[15px] px-5 md:px-6 py-3 md:py-3.5 rounded-full bg-smk-emerald-deep text-white hover:bg-smk-emerald hover:-translate-y-px transition-all"
            >
              Daftar Sekarang <span aria-hidden>→</span>
            </a>
            <a
              href="#jurusan"
              className="inline-flex items-center gap-2 font-semibold text-[15px] px-5 md:px-6 py-3 md:py-3.5 rounded-full border-[1.5px] border-smk-ink/10 text-smk-ink hover:border-smk-emerald hover:text-smk-emerald transition-all"
            >
              Jelajahi Jurusan
            </a>
          </div>

          {/* Trust stats */}
          <div className="flex gap-6 md:gap-8 mt-8 md:mt-10 flex-wrap">
            <div>
              <b className="block font-fraunces font-semibold text-[26px] text-smk-ink leading-none">
                3
              </b>
              <span className="text-[13px] text-smk-ink-soft mt-1 block">Program Keahlian</span>
            </div>
            <div>
              <b className="block font-fraunces font-semibold text-[26px] text-smk-ink leading-none">
                318
              </b>
              <span className="text-[13px] text-smk-ink-soft mt-1 block">Siswa Aktif</span>
            </div>
            <div>
              <b className="block font-fraunces font-semibold text-[26px] text-smk-ink leading-none">
                2008
              </b>
              <span className="text-[13px] text-smk-ink-soft mt-1 block">Sejak Berdiri</span>
            </div>
          </div>
        </div>

        {/* Right: collage — placeholder visual, ganti dengan foto IG asli */}
        <div className="relative h-[320px] sm:h-[400px] md:h-[480px] mt-4 md:mt-0">
          {/* Main — foto suasana belajar/praktik */}
          <div
            className="absolute inset-0 right-[28%] bottom-[34%] rounded-[20px] overflow-hidden bg-gradient-to-br from-[#0e7a5b] to-[#06392b] flex items-end p-3.5"
            aria-label="Placeholder foto suasana belajar dan praktik"
          >
            {/* TODO: ganti dengan <Image> foto dari IG @smkdarussalamsubah */}
            <span className="bg-black/28 text-white/80 text-[11px] font-medium px-2.5 py-1.5 rounded-lg backdrop-blur-sm">
              Suasana belajar &amp; praktik
            </span>
          </div>

          {/* Top-right — kegiatan santri */}
          <div
            className="absolute top-[6%] right-0 w-[46%] h-[46%] rounded-[20px] overflow-hidden bg-gradient-to-br from-[#13361f] to-smk-emerald flex items-end p-3"
            aria-label="Placeholder foto kegiatan santri"
          >
            {/* TODO: ganti dengan <Image> foto dari IG @smkdarussalamsubah */}
            <span className="bg-black/28 text-white/80 text-[11px] font-medium px-2.5 py-1.5 rounded-lg backdrop-blur-sm">
              Kegiatan santri
            </span>
          </div>

          {/* Bottom-right — bengkel/lab */}
          <div
            className="absolute bottom-0 right-[6%] w-[42%] h-[40%] rounded-[20px] overflow-hidden bg-gradient-to-br from-smk-lime to-[#7fae1b] flex items-end p-3"
            aria-label="Placeholder foto bengkel dan lab"
          >
            {/* TODO: ganti dengan <Image> foto dari IG @smkdarussalamsubah */}
            <span className="bg-black/20 text-[#22330a]/80 text-[11px] font-medium px-2.5 py-1.5 rounded-lg backdrop-blur-sm">
              Bengkel &amp; lab
            </span>
          </div>

          {/* Akreditasi floating badge */}
          <div className="absolute left-[-8px] md:left-[-10px] bottom-[30%] bg-white border border-smk-ink/10 rounded-2xl px-3.5 py-3 flex items-center gap-3 shadow-[0_18px_40px_-20px_rgba(6,69,52,0.45)]">
            <div className="w-9 h-9 rounded-xl bg-[#e7f3ec] grid place-items-center text-smk-emerald-deep text-lg flex-shrink-0">
              ✦
            </div>
            <div>
              <b className="text-sm text-smk-ink block">Akreditasi B</b>
              <small className="text-[11px] text-smk-ink-soft">Terakreditasi BAN-S/M</small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
