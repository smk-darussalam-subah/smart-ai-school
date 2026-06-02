const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';
const WA_URL = 'https://wa.me/6287775564779';

export function CtaPPDB() {
  return (
    <section id="ppdb" className="py-0 pb-[90px] bg-smk-cream">
      <div className="max-w-[1180px] mx-auto px-6">
        <div className="relative bg-gradient-to-br from-smk-emerald to-smk-emerald-deep rounded-[24px] md:rounded-[32px] py-14 md:py-[72px] px-7 md:px-[72px] text-center text-white overflow-hidden">
          {/* Decorative blobs */}
          <div
            aria-hidden
            className="absolute top-[-120px] right-[-80px] w-[340px] h-[340px] rounded-full bg-smk-lime/14 blur-[10px] pointer-events-none"
          />
          <div
            aria-hidden
            className="absolute bottom-[-140px] left-[-60px] w-[340px] h-[340px] rounded-full bg-smk-lime/14 blur-[10px] pointer-events-none"
          />

          <div className="relative z-10">
            {/* Urgency badge */}
            <span className="inline-flex items-center gap-2 bg-smk-lime/20 border border-smk-lime/30 text-smk-lime text-[12px] font-semibold px-4 py-1.5 rounded-full mb-5 tracking-wide">
              ⏳ Terbatas 234 kursi · 26 siswa/kelas
            </span>

            <h2 className="font-fraunces font-semibold text-[clamp(24px,4vw,44px)] leading-tight tracking-tight">
              Wujudkan masa depanmu,
              <br className="hidden sm:block" /> mulai dari sini.
            </h2>
            <p className="text-[#bfe6d4] text-[15px] md:text-[17px] mt-4 mb-8 max-w-[44ch] mx-auto leading-relaxed">
              SPMB 2026/2027 sudah dibuka. Daftar online sekarang atau kunjungi
              kami langsung di Subah, Batang.
            </p>

            <div className="flex gap-3 md:gap-4 justify-center flex-wrap">
              <a
                href={SPMB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-semibold text-[15px] px-6 py-3.5 rounded-full bg-smk-lime text-[#22330a] hover:bg-white transition-all hover:-translate-y-px"
              >
                Daftar Online <span aria-hidden>→</span>
              </a>
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-semibold text-[15px] px-6 py-3.5 rounded-full border-[1.5px] border-white/40 text-white hover:bg-white/10 transition-all"
              >
                Hubungi via WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
