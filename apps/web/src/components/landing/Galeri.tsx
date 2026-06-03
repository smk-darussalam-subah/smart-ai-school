import Image from 'next/image';

/**
 * Galeri section — CSS columns masonry (Tailwind columns-*).
 * V5: break-inside-avoid tiap item → masonry alami, tanpa ruang kosong.
 * Responsif: 1→2→3 kolom. Rasio bervariasi untuk ritme visual rapi.
 *
 * Server Component.
 */

type Category = 'Kunjungan Industri' | 'Workshop' | 'Fasilitas';

interface GalleryItem {
  src: string;
  alt: string;
  category: Category;
  aspect: string;
}

const categoryColors: Record<Category, string> = {
  'Kunjungan Industri': 'bg-smk-emerald-deep/80 text-white',
  Workshop: 'bg-smk-lime/90 text-[#22330a]',
  Fasilitas: 'bg-white/85 text-smk-ink',
};

const items: readonly GalleryItem[] = [
  {
    src: '/landing/kunjungan-industri-1.jpg',
    alt: 'Kunjungan industri siswa SMK Darussalam Subah ke kawasan industri Batang',
    category: 'Kunjungan Industri',
    aspect: 'aspect-[4/3]',
  },
  {
    src: '/landing/workshop-1.jpg',
    alt: 'Workshop praktik kejuruan SMK Darussalam Subah',
    category: 'Workshop',
    aspect: 'aspect-[3/4]',
  },
  {
    src: '/landing/ruang-kelas.jpg',
    alt: 'Ruang kelas SMK Darussalam Subah',
    category: 'Fasilitas',
    aspect: 'aspect-[4/3]',
  },
  {
    src: '/landing/kunjungan-industri-2.jpg',
    alt: 'Kunjungan industri siswa SMK Darussalam Subah',
    category: 'Kunjungan Industri',
    aspect: 'aspect-square',
  },
  {
    src: '/landing/workshop-2.jpg',
    alt: 'Workshop jaringan komputer TJKT SMK Darussalam Subah',
    category: 'Workshop',
    aspect: 'aspect-[4/3]',
  },
  {
    src: '/landing/fasilitas-lapangan.jpg',
    alt: 'Fasilitas lapangan serbaguna SMK Darussalam Subah',
    category: 'Fasilitas',
    aspect: 'aspect-[3/4]',
  },
  {
    src: '/landing/workshop-3.jpg',
    alt: 'Workshop otomotif TKRO SMK Darussalam Subah',
    category: 'Workshop',
    aspect: 'aspect-square',
  },
  {
    src: '/landing/kunjungan-industri-3.jpg',
    alt: 'Kunjungan industri ke PLTU Batang',
    category: 'Kunjungan Industri',
    aspect: 'aspect-[4/3]',
  },
  {
    src: '/landing/workshop-4.jpg',
    alt: 'Workshop kebekerjaan siswa SMK Darussalam Subah',
    category: 'Workshop',
    aspect: 'aspect-[3/4]',
  },
] as const;

export function Galeri() {
  return (
    <section id="galeri" className="bg-smk-sand py-[70px] md:py-[90px]">
      <div className="mx-auto max-w-[1180px] px-5 md:px-6">
        {/* Header */}
        <div className="mb-10 text-center md:mb-12">
          <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-smk-emerald md:text-[13px]">
            Galeri Kegiatan
          </div>
          <h2 className="font-fraunces text-[clamp(26px,3.4vw,42px)] font-semibold leading-[1.1] tracking-tight text-smk-ink">
            Sekilas kehidupan di Darussalam.
          </h2>
          <p className="mx-auto mt-3 max-w-[48ch] text-[14px] leading-relaxed text-smk-ink-soft md:text-[15px]">
            Dari kunjungan industri hingga workshop praktik — setiap hari ada kegiatan
            bermakna yang membentuk kompetensi dan karakter siswa.
          </p>
        </div>

        {/* CSS columns masonry — 1 → 2 → 3 kolom */}
        <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 md:gap-4">
          {items.map((item) => (
            <div
              key={item.src}
              className="break-inside-avoid mb-3 overflow-hidden rounded-[14px] md:mb-4 md:rounded-[18px]"
            >
              <div className={`relative w-full ${item.aspect}`}>
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                <div className="absolute inset-0 bg-smk-ink/0 transition-colors duration-300 hover:bg-smk-ink/15" />
                <div className="absolute bottom-3 left-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm md:text-[12px] ${categoryColors[item.category]}`}
                  >
                    {item.category}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
