import Image from 'next/image';

const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';
const WA_URL = 'https://wa.me/6287775564779';

export function CtaPPDB() {
  return (
    <section id="ppdb" className="py-0 pb-[70px] md:pb-[90px] bg-smk-cream">
      <div className="max-w-[1180px] mx-auto px-5 md:px-6">
        <div className="relative bg-smk-emerald-deep rounded-[20px] md:rounded-[32px] overflow-hidden">
          {/* Decorative blobs */}
          <div
            aria-hidden
            className="absolute top-[-100px] right-[-60px] w-[280px] md:w-[340px] h-[280px] md:h-[340px] rounded-full bg-smk-lime/12 blur-[60px] pointer-events-none"
          />
          <div
            aria-hidden
            className="absolute bottom-[-120px] left-[-40px] w-[260px] md:w-[320px] h-[260px] md:h-[320px] rounded-full bg-white/5 blur-[50px] pointer-events-none"
          />

          <div className="relative z-10 flex flex-col md:flex-row items-center gap-0 p-6 sm:p-8 md:p-0">
            {/* Logo side decoration — desktop only */}
            <div className="hidden md:flex md:w-[260px] lg:w-[300px] flex-shrink-0 items-center justify-center py-14 pl-12 pr-0">
              <div className="w-[130px] h-[130px] lg:w-[150px] lg:h-[150px] rounded-3xl overflow-hidden border-4 border-smk-lime/30 shadow-[0_0_0_8px_rgba(197,240,74,0.08)] bg-smk-emerald">
                <Image
                  src="/landing/logo-smk.png"
                  alt="Logo SMK Darussalam Subah"
                  width={150}
                  height={150}
                  className="object-contain w-full h-full p-2"
                />
              </div>
            </div>

            {/* Text + CTA */}
            <div className="flex-1 text-center md:text-left py-4 sm:py-6 md:py-14 md:px-10 lg:px-14 w-full">
              {/* Urgency badge */}
              <span className="inline-flex items-center gap-1.5 bg-smk-lime/20 border border-smk-lime/30 text-smk-lime text-[11px] md:text-[12px] font-semibold px-3 py-1.5 rounded-full mb-4 tracking-wide">
                ⏳ Terbatas 234 kursi · 26 siswa/kelas
              </span>

              <h2 className="font-fraunces font-semibold text-[clamp(20px,3.5vw,40px)] leading-tight tracking-tight text-white mb-3 md:mb-4">
                Wujudkan masa depanmu,
                <br className="hidden sm:block" /> mulai dari sini.
              </h2>
              <p className="text-[#bfe6d4] text-[13px] sm:text-[14px] md:text-[16px] mb-6 md:mb-8 max-w-[42ch] mx-auto md:mx-0 leading-relaxed">
                SPMB 2026/2027 sudah dibuka. Daftar online sekarang atau
                kunjungi kami langsung di Jl. Lapangan Selatan No. 05, Subah, Batang.
              </p>

              {/* Buttons — stacked on mobile, row on sm+ */}
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 items-stretch sm:items-center justify-center md:justify-start">
                <a
                  href={SPMB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 font-semibold text-[14px] md:text-[15px] px-5 md:px-6 py-3 md:py-3.5 rounded-full bg-smk-lime text-[#22330a] hover:bg-white transition-all hover:-translate-y-px shadow-lg shadow-smk-lime/25"
                >
                  Daftar Online <span aria-hidden>→</span>
                </a>
                <a
                  href={WA_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 font-semibold text-[14px] md:text-[15px] px-5 md:px-6 py-3 md:py-3.5 rounded-full border-[1.5px] border-white/30 text-white hover:bg-white/10 transition-all"
                >
                  WhatsApp Panitia
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
