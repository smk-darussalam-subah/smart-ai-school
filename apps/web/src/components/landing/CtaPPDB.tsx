import Image from 'next/image';

const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';
const WA_URL = 'https://wa.me/6287775564779';

/**
 * CTA section — "Wujudkan masa depanmu".
 * V8: sisi kiri desktop menampilkan model/cutout (bottom-aligned, object-contain).
 *     Aset model belum tersedia → pakai hero-3-removebg-preview.png sementara.
 *     TODO: ganti dgn model bawa buku saat Director upload aset model.
 * V10: hiasan geometrik islami (bintang 8 SVG) di sudut banner.
 */
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

          {/* V10: Islamic geometric star decorations */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-6 bottom-6 opacity-[0.07] text-smk-lime"
          >
            <svg width="80" height="80" viewBox="0 0 60 60" className="fill-current">
              <polygon points="52,30 38.31,26.56 45.56,14.44 33.44,21.69 30,8 26.56,21.69 14.44,14.44 21.69,26.56 8,30 21.69,33.44 14.44,45.56 26.56,38.31 30,52 33.44,38.31 45.56,45.56 38.31,33.44" />
            </svg>
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-4 opacity-[0.04] text-smk-lime hidden md:block"
          >
            <svg width="52" height="52" viewBox="0 0 60 60" className="fill-current">
              <polygon points="52,30 38.31,26.56 45.56,14.44 33.44,21.69 30,8 26.56,21.69 14.44,14.44 21.69,26.56 8,30 21.69,33.44 14.44,45.56 26.56,38.31 30,52 33.44,38.31 45.56,45.56 38.31,33.44" />
            </svg>
          </div>

          <div className="relative z-10 flex flex-col md:flex-row items-end gap-0">
            {/* V8: Model cutout sisi kiri — bottom-aligned, keluar frame ke atas */}
            <div className="hidden md:flex md:w-[240px] lg:w-[280px] flex-shrink-0 items-end justify-center pt-4 pl-8 pr-0 self-end">
              <div className="relative w-full h-[230px] lg:h-[270px]">
                <Image
                  src="/landing/model-cut-out.png"
                  alt="Siswa SMK Darussalam Subah membawa buku"
                  fill
                  className="object-contain object-bottom"
                  sizes="280px"
                />
              </div>
            </div>

            {/* Text + CTA */}
            <div className="flex-1 text-center md:text-left py-8 sm:py-10 px-6 sm:px-8 md:py-14 md:px-10 lg:px-14 w-full">
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

              {/* Buttons */}
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
