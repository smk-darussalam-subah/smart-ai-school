const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';
const WA_URL = 'https://wa.me/6287775564779';

const jurusanLinks = [
  { label: 'Teknik Otomotif (TKRO & TBSM)', href: '#jurusan' },
  { label: 'Jaringan & Telekomunikasi (TJKT)', href: '#jurusan' },
  { label: 'Akuntansi & Keuangan (AKL)', href: '#jurusan' },
] as const;

const tautanLinks = [
  { label: 'SPMB Online', href: SPMB_URL, external: true },
  { label: 'Profil Sekolah', href: '#profil', external: false },
  { label: 'Portal Siswa', href: '/login', external: false },
] as const;

export function Footer() {
  return (
    <footer id="kontak" className="bg-[#06241b] text-[#9fc3b4] text-sm pt-16 pb-8">
      <div className="max-w-[1180px] mx-auto px-6">
        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] gap-8 md:gap-9 mb-10">
          {/* Brand + address */}
          <div>
            <div className="flex items-center gap-3 text-white font-bold mb-4">
              <span className="w-10 h-10 rounded-xl bg-smk-emerald-deep grid place-items-center text-smk-lime font-fraunces font-extrabold text-lg flex-shrink-0">
                D
              </span>
              <span className="leading-snug">
                SMK Darussalam Subah
                <small className="block font-normal text-[11px] text-[#9fc3b4] mt-0.5">
                  Sekolah Vokasi Berbasis Pesantren
                </small>
              </span>
            </div>
            <p className="leading-relaxed max-w-[32ch]">
              Jl. Lapangan Selatan No. 05, Kemiri Barat, Subah, Batang, Jawa Tengah.
              Di bawah Yayasan Wakaf Darussalam.
            </p>
          </div>

          {/* Jurusan */}
          <div>
            <h4 className="text-white text-sm font-semibold mb-4">Jurusan</h4>
            {jurusanLinks.map((l) => (
              <a key={l.label} href={l.href} className="block py-1.5 hover:text-smk-lime transition-colors">
                {l.label}
              </a>
            ))}
          </div>

          {/* Tautan */}
          <div>
            <h4 className="text-white text-sm font-semibold mb-4">Tautan</h4>
            {tautanLinks.map((l) =>
              l.external ? (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block py-1.5 hover:text-smk-lime transition-colors"
                >
                  {l.label}
                </a>
              ) : (
                <a key={l.label} href={l.href} className="block py-1.5 hover:text-smk-lime transition-colors">
                  {l.label}
                </a>
              )
            )}
          </div>

          {/* Kontak */}
          <div>
            <h4 className="text-white text-sm font-semibold mb-4">Kontak</h4>
            <a
              href="mailto:smkdarussalamsubah.08@gmail.com"
              className="block py-1.5 hover:text-smk-lime transition-colors break-all"
            >
              smkdarussalamsubah.08@gmail.com
            </a>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block py-1.5 hover:text-smk-lime transition-colors"
            >
              WhatsApp: +62 877-7556-4779
            </a>
            <a
              href="https://instagram.com/smkdarussalamsubah"
              target="_blank"
              rel="noopener noreferrer"
              className="block py-1.5 hover:text-smk-lime transition-colors"
            >
              Instagram @smkdarussalamsubah
            </a>
            <a
              href="https://smkdarussalamsubah.sch.id"
              className="block py-1.5 hover:text-smk-lime transition-colors"
            >
              smkdarussalamsubah.sch.id
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row justify-between gap-3 text-[13px] text-[#6f9486]">
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
