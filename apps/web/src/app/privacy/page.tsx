import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Kebijakan Privasi — DIIS Smart AI School',
  description: 'Kebijakan privasi dan perlindungan data DIIS Smart AI School SMK Darussalam Subah.',
};

const CONTACT_EMAIL = 'smkdarussalamsubah.08@gmail.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-3">{title}</h2>
      <div className="text-gray-600 space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link href="/" className="text-smk-blue font-semibold text-sm hover:underline">
            ← Kembali ke Beranda
          </Link>
          <span className="text-xs text-gray-400">SMK Darussalam Subah</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-12">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Kebijakan Privasi</h1>
          <p className="text-sm text-gray-400">
            DIIS Smart AI School · SMK Darussalam Subah · Berlaku mulai: Juni 2026
          </p>
        </div>

        <Section title="1. Pendahuluan">
          <p>
            Kebijakan Privasi ini menjelaskan bagaimana <strong>DIIS Smart AI School</strong> (&ldquo;Sistem&rdquo;, &ldquo;kami&rdquo;)
            yang dioperasikan oleh <strong>SMK Darussalam Subah</strong> mengumpulkan, menggunakan, menyimpan, dan
            melindungi data pribadi pengguna (&ldquo;Anda&rdquo;) sesuai dengan peraturan perundang-undangan yang berlaku
            di Indonesia, termasuk UU No. 27 Tahun 2022 tentang Perlindungan Data Pribadi.
          </p>
        </Section>

        <Section title="2. Data yang Kami Kumpulkan">
          <p>Kami mengumpulkan data berikut berdasarkan jenis pengguna:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Siswa:</strong> nama lengkap, NIS, kelas, nilai akademik, data kehadiran, data keuangan SPP.</li>
            <li><strong>Orang Tua/Wali:</strong> nama, nomor telepon (WhatsApp), email, relasi ke siswa.</li>
            <li><strong>Guru:</strong> nama, NIY, data kehadiran, penugasan mengajar, RPP yang diunggah.</li>
            <li><strong>Calon Siswa (PPDB):</strong> nama, nomor telepon, asal sekolah, minat jurusan.</li>
            <li><strong>Log Teknis:</strong> alamat IP, browser, waktu akses, aktivitas sistem (untuk audit keamanan).</li>
          </ul>
        </Section>

        <Section title="3. Dasar Hukum Pemrosesan">
          <p>Kami memproses data pribadi Anda berdasarkan:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Pelaksanaan kewajiban hukum sekolah sebagai lembaga pendidikan formal.</li>
            <li>Persetujuan eksplisit yang Anda berikan saat pendaftaran atau pengisian data.</li>
            <li>Kepentingan yang sah (legitimate interest) untuk operasional sekolah yang aman dan efisien.</li>
          </ul>
        </Section>

        <Section title="4. Persetujuan Data (R-05)">
          <p>
            Sesuai regulasi internal R-05, operator wajib mencatat timestamp persetujuan saat data orang tua/wali
            dimasukkan ke sistem. Data tidak akan dimasukkan tanpa persetujuan eksplisit dari wali siswa.
          </p>
        </Section>

        <Section title="5. Penggunaan Data">
          <p>Data digunakan untuk:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Manajemen akademik (nilai, kehadiran, jadwal, rapor).</li>
            <li>Administrasi keuangan (SPP, BOS).</li>
            <li>Notifikasi melalui WhatsApp (via Fonnte) untuk informasi akademik dan keuangan.</li>
            <li>Asisten AI lokal (Ollama) untuk mendukung pembelajaran — data tidak dikirim ke server eksternal.</li>
            <li>Peningkatan sistem dan keamanan (audit log, monitoring).</li>
          </ul>
        </Section>

        <Section title="6. Berbagi Data">
          <p>
            Kami <strong>tidak menjual</strong> data pribadi Anda kepada pihak ketiga. Data hanya dibagikan kepada:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Pihak berwenang (Dinas Pendidikan, Kemendikbud) sesuai kewajiban pelaporan sekolah.</li>
            <li>Mitra industri PKL/Prakerin — hanya data profil siswa yang relevan, setelah persetujuan.</li>
            <li>Layanan infrastruktur teknis (server VPS lokal Indonesia, tidak keluar negeri).</li>
          </ul>
        </Section>

        <Section title="7. Keamanan Data">
          <p>Kami menerapkan langkah keamanan teknis dan organisasi, termasuk:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Enkripsi HTTPS untuk semua komunikasi data.</li>
            <li>Autentikasi multi-faktor via Keycloak (server autentikasi terpercaya).</li>
            <li>Backup harian database dengan retensi 14 hari.</li>
            <li>Audit log setiap aksi sensitif di sistem.</li>
            <li>Isolasi database staging (N-20) — data uji tidak bercampur data produksi.</li>
          </ul>
        </Section>

        <Section title="8. Retensi Data">
          <p>
            Data akademik siswa disimpan selama masa studi ditambah <strong>5 tahun</strong> sesuai peraturan
            arsip lembaga pendidikan. Data log teknis disimpan maksimal <strong>90 hari</strong>.
            Data PPDB yang tidak melanjutkan pendaftaran dihapus dalam <strong>1 tahun</strong>.
          </p>
        </Section>

        <Section title="9. Hak Anda">
          <p>Anda berhak untuk:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Mengakses data pribadi Anda yang tersimpan di sistem.</li>
            <li>Meminta koreksi data yang tidak akurat.</li>
            <li>Meminta penghapusan data (dengan mempertimbangkan kewajiban hukum retensi).</li>
            <li>Menarik persetujuan — namun ini dapat mempengaruhi layanan yang dapat diterima.</li>
          </ul>
          <p className="mt-2">Kirimkan permintaan ke: <a href={`mailto:${CONTACT_EMAIL}`} className="text-smk-blue hover:underline">{CONTACT_EMAIL}</a></p>
        </Section>

        <Section title="10. Cookie dan Penyimpanan Lokal">
          <p>
            Sistem menggunakan cookie sesi untuk autentikasi (httpOnly, secure) dan tidak menggunakan
            cookie pelacak pihak ketiga. Data sesi tidak pernah disimpan di localStorage.
          </p>
        </Section>

        <Section title="11. Pembaruan Kebijakan">
          <p>
            Kebijakan ini dapat diperbarui sewaktu-waktu. Perubahan signifikan akan diinformasikan
            melalui pengumuman di portal atau notifikasi WhatsApp kepada pengguna terdaftar.
            Versi terakhir selalu tersedia di halaman ini.
          </p>
        </Section>

        <Section title="12. Hubungi Kami">
          <p>
            Pertanyaan atau keluhan terkait privasi dapat disampaikan kepada pengelola sistem:
          </p>
          <address className="mt-2 not-italic text-gray-600">
            <strong>SMK Darussalam Subah</strong><br />
            Jl. Lapangan Selatan No. 05, Kemiri Barat, Subah, Batang, Jawa Tengah<br />
            Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-smk-blue hover:underline">{CONTACT_EMAIL}</a><br />
            WhatsApp: <a href="https://wa.me/6287775564779" className="text-smk-blue hover:underline">+62 877-7556-4779</a>
          </address>
        </Section>
      </main>

      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        © 2025 SMK Darussalam Subah · DIIS Smart AI School
      </footer>
    </div>
  );
}
