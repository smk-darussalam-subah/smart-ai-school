// C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\apps\web\src\components\landing\SPMBSection.tsx
import Image from 'next/image';

const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';
const WA_URL = 'https://wa.me/6287775564779';

/**
 * SPMB (Seleksi Penerimaan Murid Baru) section.
 * Left: info, quota badge, CTA.
 * Right: 3 preview photos (spmb-1, spmb-2, spmb-3).
 *   - Mobile: horizontal scroll.
 *   - Desktop: 3-column grid.
 *
 * Server Component.
 */

const spmbPhotos = [
  { src: '/landing/spmb-1.png', alt: 'Preview seragam & suasana SPMB SMK Darussalam Subah 2026' },
  { src: '/landing/spmb-2.png', alt: 'Kegiatan pendaftaran SPMB SMK Darussalam Subah' },
  { src: '/landing/spmb-3.png', alt: 'Siswa baru SMK Darussalam Subah' },
] as const;

const timeline = [
  { phase: 'Pendaftaran Online', period: 'Sudah dibuka' },
  { phase: 'Seleksi Berkas', period: 'Setelah pendaftaran' },
  { phase: 'Pengumuman', period: 'Menyusul' },
  { phase: 'Daftar Ulang', period: 'Setelah pengumuman' },
] as const;

export function SPMBSection() {
  return (
    <section id="spmb" className="bg-smk-cream py-[70px] md:py-[90px]">
      <div className="mx-auto max-w-[1180px] px-5 md:px-6">
        <div className="grid gap-10 md:grid-cols-2 md:gap-14 lg:gap-20 items-start">
          {/* ── LEFT: Info & CTA ── */}
          <div>
            <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-smk-emerald md:text-[13px]">
              SPMB 2026/2027
            </div>
            <h2 className="font-fraunces text-[clamp(26px,3.4vw,42px)] font-semibold leading-[1.1] tracking-tight text-smk-ink mb-4">
              Daftar sekarang,<br /> raih masa depanmu.
            </h2>
            <p className="mb-6 max-w-[44ch] text-[14px] leading-relaxed text-smk-ink-soft md:text-[15px]">
              Penerimaan siswa baru tahun ajaran 2026/2027 telah dibuka. Kuota terbatas
              — segera daftarkan dirimu atau putramu sebelum tempat habis.
            </p>

            {/* Quota badges */}
            <div className="mb-7 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-full border border-smk-ink/10 bg-smk-sand px-4 py-2.5">
                <span className="text-xl">🎓</span>
                <div>
                  <b className="block text-[15px] font-fraunces font-semibold text-smk-ink leading-none">
                    234 Kursi
                  </b>
                  <small className="text-[11px] text-smk-ink-soft">Total kuota tersedia</small>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-smk-ink/10 bg-smk-sand px-4 py-2.5">
                <span className="text-xl">👥</span>
                <div>
                  <b className="block text-[15px] font-fraunces font-semibold text-smk-ink leading-none">
                    26 Siswa
                  </b>
                  <small className="text-[11px] text-smk-ink-soft">Per kelas</small>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-smk-lime px-4 py-2.5">
                <span className="text-xl">⏳</span>
                <span className="text-[12px] font-bold text-[#22330a]">Terbatas!</span>
              </div>
            </div>

            {/* Timeline */}
            <div className="mb-7 rounded-[16px] border border-smk-ink/8 bg-smk-sand p-5 md:rounded-[18px]">
              <p className="mb-4 text-[12px] font-bold uppercase tracking-wider text-smk-ink-soft">
                Alur Pendaftaran
              </p>
              <ol className="flex flex-col gap-3">
                {timeline.map((t, i) => (
                  <li key={t.phase} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-smk-emerald-deep text-[11px] font-bold text-smk-lime">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[13px] font-medium text-smk-ink">
                      {t.phase}
                    </span>
                    <span className="text-[12px] text-smk-ink-soft">{t.period}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-3">
              <a
                href={SPMB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-smk-emerald-deep px-5 py-3 text-[14px] font-semibold text-white shadow-sm shadow-smk-emerald-deep/30 transition-all hover:-translate-y-px hover:bg-smk-emerald md:px-6 md:py-3.5 md:text-[15px]"
              >
                Daftar Online <span aria-hidden>→</span>
              </a>
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-smk-ink/12 px-5 py-3 text-[14px] font-semibold text-smk-ink transition-all hover:border-smk-emerald hover:text-smk-emerald md:px-6 md:py-3.5 md:text-[15px]"
              >
                Tanya via WhatsApp
              </a>
            </div>

            {/* WA info */}
            <p className="mt-4 text-[12px] text-smk-ink-soft">
              Hubungi panitia melalui WhatsApp:{' '}
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-smk-emerald hover:underline"
              >
                +62 877-7556-4779
              </a>
            </p>
          </div>

          {/* ── RIGHT: Photo previews ── */}
          <div>
            {/* Mobile: horizontal scroll — Desktop: 3-column grid */}
            <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 md:gap-4">
              {spmbPhotos.map((photo) => (
                <div
                  key={photo.src}
                  className="relative aspect-[3/4] w-[200px] flex-shrink-0 overflow-hidden rounded-[14px] md:w-auto md:rounded-[16px]"
                >
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 200px, (max-width: 1024px) 33vw, 200px"
                  />
                </div>
              ))}
            </div>

            {/* Supporting info */}
            <div className="mt-5 rounded-[14px] border border-smk-emerald/20 bg-[#e7f3ec] p-4 md:mt-6 md:rounded-[16px]">
              <p className="text-[13px] font-semibold text-smk-emerald-deep mb-1">
                Persyaratan Umum
              </p>
              <ul className="list-inside list-disc text-[13px] text-smk-ink-soft space-y-0.5">
                <li>Lulusan SMP/MTs atau sederajat</li>
                <li>Usia maksimal 21 tahun pada awal tahun ajaran</li>
                <li>Foto copy ijazah/SKL & raport semester 1–5</li>
                <li>Pas foto terbaru 3×4 (2 lembar)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
