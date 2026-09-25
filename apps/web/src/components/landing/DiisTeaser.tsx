import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, LogIn } from 'lucide-react';

const flow = ['Jadwal', 'Kehadiran', 'Pembelajaran', 'Tindak lanjut', 'Keputusan'];

export function DiisTeaser() {
  return (
    <section id="diis" className="overflow-hidden bg-[#062b25] text-white">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 py-14 md:px-6 md:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-smk-lime">
            DIIS · Dibangun dari keseharian sekolah
          </p>
          <h2 className="mt-4 max-w-2xl font-fraunces text-[clamp(2rem,4.2vw,3.35rem)] font-semibold leading-[1.08]">
            Ketika sekolah bergerak, semua orang ikut maju.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-white/76">
            Jadwal tersusun. Kehadiran tercatat. Pembelajaran bergerak. Orang tua merasa dekat.
            Pimpinan melihat langkah berikutnya. DIIS menyambungkan semuanya agar setiap kemajuan
            kecil menjadi gerak sekolah yang lebih besar.
          </p>

          <ol className="mt-7 flex flex-wrap gap-x-2 gap-y-3" aria-label="Alur kerja DIIS">
            {flow.map((item, index) => (
              <li
                key={item}
                className="flex items-center gap-2 text-sm font-semibold text-white/90"
              >
                <span className="grid h-7 w-7 place-items-center border border-smk-lime/45 text-xs text-smk-lime">
                  {index + 1}
                </span>
                {item}
                {index < flow.length - 1 && (
                  <ArrowRight aria-hidden="true" className="h-4 w-4 text-white/35" />
                )}
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/diis"
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-smk-lime px-5 py-3 text-sm font-bold text-smk-ink transition-colors hover:bg-[#d5f778] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Jelajahi DIIS <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-white/25 px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-white/55 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <LogIn aria-hidden="true" className="h-4 w-4" /> Sudah punya akun? Masuk
            </Link>
          </div>

          <p className="mt-6 flex items-start gap-2 text-sm text-white/65">
            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-smk-lime" />
            DIIS membantu menyiapkan informasi; keputusan tetap ada pada sekolah.
          </p>
        </div>

        <Link
          href="/diis"
          aria-label="Lihat pengalaman DIIS secara lengkap"
          className="group relative block aspect-[16/9] overflow-hidden border border-white/15 bg-[#031b18] focus:outline-none focus-visible:ring-2 focus-visible:ring-smk-lime"
        >
          <Image
            src="/diis/product-overview.webp"
            alt="Tampilan DIIS pada komputer, tablet, dan ponsel untuk sekolah, guru, siswa, dan orang tua."
            fill
            sizes="(max-width: 1024px) 100vw, 620px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.015] motion-reduce:transition-none"
          />
        </Link>
      </div>
    </section>
  );
}
