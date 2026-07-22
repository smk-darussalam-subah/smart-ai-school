import Image from 'next/image';

const SPMB_URL = '/spmb';
const WA_URL = 'https://wa.me/6287775564779';
const IG_URL = 'https://instagram.com/smkdarussalamsubah';

export function Footer() {
  return (
    <footer id="kontak" className="bg-[#05201a] text-[#9fc3b4] text-sm">
      <div className="max-w-[1180px] mx-auto px-5 md:px-6 pt-12 md:pt-16 pb-7 md:pb-8">
        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] gap-8 md:gap-10 mb-10 md:mb-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-white/10">
                <Image
                  src="/landing/logo-smk.png"
                  alt="Logo SMK Darussalam Subah"
                  fill
                  className="object-contain"
                  sizes="40px"
                />
              </div>
              <span className="text-white font-bold text-sm leading-snug">
                SMK Darussalam Subah
                <small className="block font-normal text-[11px] text-[#9fc3b4] mt-0.5">
                  Sekolah Industri Berbasis Pesantren
                </small>
              </span>
            </div>
            <p className="text-[13px] leading-relaxed max-w-[30ch] text-[#7aab9a]">
              Jl. Lapangan Selatan No. 05, Kemiri Barat, Subah, Batang, Jawa Tengah.
              Yayasan Wakaf Darussalam.
            </p>
          </div>

          {/* Jurusan */}
          <div>
            <h4 className="text-white text-[13px] font-semibold mb-4 tracking-wide uppercase">
              Jurusan
            </h4>
            {[
              'Teknik Otomotif (TKRO & TBSM)',
              'Jaringan & Telekomunikasi (TJKT)',
              'Akuntansi & Keuangan (AKL)',
            ].map((l) => (
              <a
                key={l}
                href="#jurusan"
                className="block py-1.5 text-[13px] text-[#9fc3b4] hover:text-smk-lime transition-colors"
              >
                {l}
              </a>
            ))}
          </div>

          {/* Tautan */}
          <div>
            <h4 className="text-white text-[13px] font-semibold mb-4 tracking-wide uppercase">
              Tautan
            </h4>
            {[
              { label: 'SPMB 2027/2028', href: SPMB_URL, ext: false },
              { label: 'Profil Sekolah', href: '#profil', ext: false },
              { label: 'Portal Siswa', href: '/login', ext: false },
              { label: 'Video Profil', href: '#video', ext: false },
              { label: 'Kebijakan Privasi', href: '/privacy', ext: false },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                {...(l.ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="block py-1.5 text-[13px] text-[#9fc3b4] hover:text-smk-lime transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Kontak */}
          <div>
            <h4 className="text-white text-[13px] font-semibold mb-4 tracking-wide uppercase">
              Kontak
            </h4>
            <a
              href="mailto:smkdarussalamsubah.08@gmail.com"
              className="block py-1.5 text-[13px] text-[#9fc3b4] hover:text-smk-lime transition-colors break-all"
            >
              smkdarussalamsubah.08@gmail.com
            </a>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block py-1.5 text-[13px] text-[#9fc3b4] hover:text-smk-lime transition-colors"
            >
              +62 877-7556-4779 (WA)
            </a>
            <a
              href={IG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block py-1.5 text-[13px] text-[#9fc3b4] hover:text-smk-lime transition-colors"
            >
              @smkdarussalamsubah
            </a>
            <a
              href="https://smkdarussalamsubah.sch.id"
              className="block py-1.5 text-[13px] text-[#9fc3b4] hover:text-smk-lime transition-colors"
            >
              smkdarussalamsubah.sch.id
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/8 pt-5 flex flex-col sm:flex-row justify-between gap-2 text-[12px] text-[#5a8a78]">
          <span>
            © 2025 SMK Darussalam Subah · Yayasan Wakaf Darussalam ·{' '}
            <abbr title="Nomor Pokok Sekolah Nasional">NPSN</abbr> 20350670
          </span>
          <span>Didukung ekosistem DIIS — Smart AI School.</span>
        </div>
      </div>
    </footer>
  );
}
