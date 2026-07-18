import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Kebijakan Privasi - DIIS Smart AI School',
  description: 'Kebijakan privasi dan perlindungan data DIIS Smart AI School SMK Darussalam Subah.',
};

const CONTACT_EMAIL = 'smkdarussalamsubah.08@gmail.com';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold text-gray-800">{title}</h2>
      <div className="space-y-2 leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-sm font-semibold text-smk-blue hover:underline">
            &larr; Kembali ke Beranda
          </Link>
          <span className="text-xs text-gray-400">SMK Darussalam Subah</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="mb-10">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Kebijakan Privasi</h1>
          <p className="text-sm text-gray-400">
            DIIS Smart AI School - SMK Darussalam Subah - Berlaku mulai: 19 Juli 2026
          </p>
        </div>

        <Section title="1. Pendahuluan">
          <p>
            Kebijakan Privasi ini menjelaskan bagaimana <strong>DIIS Smart AI School</strong> (&quot;Sistem&quot;,
            &quot;kami&quot;) yang dioperasikan oleh <strong>SMK Darussalam Subah</strong> mengumpulkan,
            menggunakan, menyimpan, dan melindungi data pribadi pengguna (&quot;Anda&quot;) sesuai peraturan
            perundang-undangan yang berlaku di Indonesia, termasuk UU No. 27 Tahun 2022 tentang Perlindungan Data
            Pribadi.
          </p>
        </Section>

        <Section title="2. Data yang Kami Kumpulkan">
          <p>Kami mengumpulkan data berikut berdasarkan jenis pengguna dan layanan yang digunakan:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Siswa:</strong> nama lengkap, NIS, kelas, nilai akademik, data kehadiran, data rapor, dan data keuangan SPP.</li>
            <li><strong>Orang tua/wali:</strong> nama, nomor telepon WhatsApp, email, dan relasi ke siswa.</li>
            <li><strong>Guru dan staf:</strong> nama, nomor induk internal, data kehadiran, penugasan mengajar, dan dokumen pembelajaran yang dikelola di sistem.</li>
            <li>
              <strong>Calon siswa SPMB 2027/2028:</strong> peran pengisi formulir, nama lengkap calon siswa, jenis
              kelamin, NISN bila diisi, asal sekolah, jurusan minat, nama orang tua/wali, hubungan wali, nomor
              WhatsApp aktif, email bila diisi, status pendaftaran, dan waktu persetujuan pemrosesan data.
            </li>
            <li><strong>Log teknis:</strong> alamat IP, browser atau user agent, waktu akses, dan aktivitas sistem untuk keamanan, audit, serta pencegahan penyalahgunaan.</li>
          </ul>
        </Section>

        <Section title="3. Dasar Hukum Pemrosesan">
          <p>Kami memproses data pribadi berdasarkan:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Pelaksanaan kewajiban hukum sekolah sebagai lembaga pendidikan formal.</li>
            <li>Persetujuan eksplisit yang diberikan saat pendaftaran, pengisian data, atau penggunaan layanan.</li>
            <li>Kepentingan yang sah untuk operasional sekolah yang aman, tertib, dan dapat diaudit.</li>
          </ul>
        </Section>

        <Section title="4. Persetujuan Data SPMB">
          <p>
            Formulir SPMB 2027/2028 dapat diisi oleh orang tua/wali atau oleh calon siswa dengan sepengetahuan dan
            izin orang tua/wali. Checkbox persetujuan tidak dicentang otomatis. Saat persetujuan diberikan, sistem
            mencatat status persetujuan, versi formulir, dan waktu persetujuan sebagai bukti operasional.
          </p>
          <p>
            Data daftar awal dipakai untuk verifikasi panitia, komunikasi melalui WhatsApp utama, dan persiapan
            daftar ulang. Bukti pendaftaran awal tidak menampilkan NISN, nomor WhatsApp, email, alamat, atau dokumen.
          </p>
        </Section>

        <Section title="5. Penggunaan Data">
          <p>Data digunakan untuk:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Manajemen akademik seperti nilai, kehadiran, jadwal, dan rapor.</li>
            <li>Administrasi keuangan sekolah seperti SPP dan BOS.</li>
            <li>Proses PPDB/SPMB, verifikasi pendaftar, daftar ulang, dan komunikasi panitia.</li>
            <li>Notifikasi WhatsApp untuk informasi akademik, keuangan, dan layanan sekolah.</li>
            <li>Asisten AI lokal untuk mendukung pembelajaran; data sensitif tidak dikirim ke penyedia AI eksternal tanpa kontrol privasi yang disetujui.</li>
            <li>Peningkatan keamanan sistem melalui audit log dan monitoring.</li>
          </ul>
        </Section>

        <Section title="6. Berbagi Data">
          <p>
            Kami <strong>tidak menjual</strong> data pribadi Anda kepada pihak ketiga. Data hanya dibagikan kepada:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Pihak berwenang sesuai kewajiban pelaporan sekolah.</li>
            <li>Mitra industri PKL atau rekrutmen hanya untuk data yang relevan dan sesuai persetujuan.</li>
            <li>Layanan infrastruktur teknis yang dibutuhkan untuk menjalankan sistem secara aman.</li>
          </ul>
        </Section>

        <Section title="7. Keamanan Data">
          <p>Kami menerapkan langkah keamanan teknis dan organisasi, termasuk:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>HTTPS untuk komunikasi data.</li>
            <li>Autentikasi melalui Keycloak untuk area internal.</li>
            <li>Permission-based access control untuk membatasi data berdasarkan tugas dan kewenangan.</li>
            <li>Backup database dan pemisahan lingkungan staging dari produksi.</li>
            <li>Audit log untuk aksi sensitif dan pemeriksaan keamanan.</li>
          </ul>
        </Section>

        <Section title="8. Retensi Data">
          <p>
            Data akademik siswa disimpan selama masa studi ditambah retensi arsip sesuai kebijakan sekolah dan
            kewajiban hukum. Data log teknis disimpan sesuai kebutuhan keamanan dan audit. Data PPDB/SPMB yang tidak
            melanjutkan pendaftaran disimpan hanya selama diperlukan untuk tindak lanjut, audit, dan kewajiban
            administrasi sekolah.
          </p>
        </Section>

        <Section title="9. Hak Anda">
          <p>Anda berhak untuk:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Mengakses data pribadi yang tersimpan di sistem.</li>
            <li>Meminta koreksi data yang tidak akurat.</li>
            <li>Meminta penghapusan data dengan tetap mempertimbangkan kewajiban hukum retensi.</li>
            <li>Menarik persetujuan, dengan pemahaman bahwa layanan tertentu mungkin tidak dapat diproses tanpa data yang diperlukan.</li>
          </ul>
          <p className="mt-2">
            Kirimkan permintaan ke:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-smk-blue hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

        <Section title="10. Cookie dan Penyimpanan Lokal">
          <p>
            Sistem menggunakan cookie sesi untuk autentikasi area internal. Formulir SPMB dapat memakai penyimpanan
            lokal sementara di browser untuk menjaga kestabilan retry pengiriman, tanpa menyimpan isi dokumen.
          </p>
        </Section>

        <Section title="11. Pembaruan Kebijakan">
          <p>
            Kebijakan ini dapat diperbarui sewaktu-waktu. Perubahan signifikan akan diinformasikan melalui
            pengumuman sekolah atau kanal komunikasi resmi. Versi terakhir selalu tersedia di halaman ini.
          </p>
        </Section>

        <Section title="12. Hubungi Kami">
          <p>Pertanyaan atau keluhan terkait privasi dapat disampaikan kepada pengelola sistem:</p>
          <address className="mt-2 not-italic text-gray-600">
            <strong>SMK Darussalam Subah</strong><br />
            Jl. Lapangan Selatan No. 05, Kemiri Barat, Subah, Batang, Jawa Tengah<br />
            Email:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-smk-blue hover:underline">
              {CONTACT_EMAIL}
            </a><br />
            WhatsApp:{' '}
            <a href="https://wa.me/6287775564779" className="text-smk-blue hover:underline">
              +62 877-7556-4779
            </a>
          </address>
        </Section>
      </main>

      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        (c) 2026 SMK Darussalam Subah - DIIS Smart AI School
      </footer>
    </div>
  );
}
