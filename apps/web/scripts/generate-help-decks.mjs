import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const ROOT = process.cwd();
const SCREENSHOT_ROOT = path.join(ROOT, 'apps/web/private/help-screenshots');
const OUTPUT_ROOT = path.join(ROOT, 'docs/adoption/wave9/decks');
const ASSET_ROOT = path.join(OUTPUT_ROOT, 'assets');
const QA_ROOT = path.join(ROOT, '.tmp/wave9-checkpoint-b/deck-renders-v2');

const COLORS = {
  navy: '#08111F', navy2: '#14233C', ink: '#172235', muted: '#5C697A',
  white: '#FFFFFF', cloud: '#F4F7FA', line: '#D6DFE8', green: '#0F8A68',
  blue: '#245FD3', coral: '#E3684B', amber: '#B7791F',
  paleGreen: '#E8F7F1', paleBlue: '#EAF1FF', paleCoral: '#FCECE8', paleAmber: '#FFF5DE',
};

const COMMON_SOURCES = [
  'apps/web/src/lib/help/help-evidence.ts',
  'docs/audits/PROMPT-ARCHITECT-WAVE9-ADOPTION-READINESS-DOCUMENTATION-FREEZE-V2-2026-08-26.md',
];

const decks = [
  {
    id: 'foundation', fileName: 'presentasi-yayasan-komite.pptx',
    title: 'DIIS untuk Yayasan dan Komite',
    subtitle: 'Memahami operasi sekolah dari informasi yang utuh dan dapat ditelusuri',
    audience: 'Yayasan, Komite, dan pimpinan sekolah', illustration: 'diis-foundation-governance.png',
    illustrationAlt: 'Tim pimpinan sekolah meninjau ringkasan kehadiran, kesiapan semester, Rapor, dan akuntabilitas pada layar bersama.',
    humanDefinition: 'DIIS adalah ruang kerja digital sekolah yang menyatukan kegiatan akademik, administrasi, komunikasi, dan pemantauan dalam satu tempat. Setiap orang melihat informasi sesuai tanggung jawabnya.',
    humanMeaning: 'Bagi Yayasan dan Komite, DIIS membantu melihat keadaan sekolah secara ringkas tanpa kehilangan hubungan dengan data dan proses sumbernya.',
    problems: [
      ['Informasi tersebar', 'Data sering berada di file, pesan, dan aplikasi yang berbeda.'],
      ['Sulit melihat kemajuan', 'Pimpinan membutuhkan ringkasan yang tetap bisa ditelusuri.'],
      ['Keputusan terlambat', 'Masalah baru terlihat setelah proses akademik sudah tertinggal.'],
      ['Bukti tidak seragam', 'Laporan perlu berasal dari periode dan snapshot resmi yang sama.'],
    ],
    goal: 'Membantu pimpinan melihat gambaran besar, menemukan bagian yang perlu ditindaklanjuti, dan menjaga keputusan tetap berdasarkan data resmi.',
    journey: ['Lihat ringkasan', 'Temukan indikator', 'Buka proses sumber', 'Tindak lanjuti bersama pemilik tugas'],
    features: [
      ['Dasbor Eksekutif', 'Kehadiran, akademik, dan operasi sekolah dalam satu ringkasan.'],
      ['Rapor Resmi', 'Hasil semester dari snapshot yang sudah ditinjau dan didistribusikan.'],
      ['Penutupan Semester', 'Readiness, riwayat, cetak, dan CSV dalam alur yang terkontrol.'],
      ['Appointment', 'Kewenangan jabatan mengikuti masa tugas aktif, bukan role permanen.'],
    ],
    evidence: [
      { title: 'Ringkasan yang dapat ditelusuri', lead: 'Dasbor Eksekutif membantu pimpinan membaca kondisi sekolah, lalu berpindah ke proses sumber bila ada indikator yang perlu ditindaklanjuti.', image: 'shot-executive-desktop.png', bullets: ['Periksa periode dan waktu pembaruan', 'Gunakan angka sebagai pintu masuk, bukan kesimpulan akhir'], source: 'apps/web/src/app/dashboard/executive/page.tsx' },
      { title: 'Penutupan semester berbasis bukti', lead: 'Sekolah hanya menutup semester setelah readiness terpenuhi dan menyimpan snapshot historis yang tidak berubah.', image: 'shot-closing-desktop.png', bullets: ['Blocker harus selesai sebelum penutupan', 'Laporan historis tetap dapat dibuka, dicetak, dan diunduh'], source: 'apps/api/src/semester-closing/semester-closing.service.ts' },
    ],
  },
  {
    id: 'internal', fileName: 'presentasi-internal-sekolah.pptx',
    title: 'DIIS untuk Operasi Internal Sekolah',
    subtitle: 'Satu alur kerja yang lebih jelas untuk pimpinan, Tata Usaha, dan Guru',
    audience: 'Kepala Sekolah, Tata Usaha, dan Guru', illustration: 'diis-internal-operations.png',
    illustrationAlt: 'Guru dan petugas sekolah bekerja pada jadwal, data, dan tugas digital yang saling terhubung sesuai tanggung jawabnya.',
    humanDefinition: 'DIIS adalah tempat kerja bersama untuk mengelola kegiatan sekolah sehari-hari: mulai dari jadwal, kelas, pembelajaran, penilaian, pengumuman, hingga Rapor.',
    humanMeaning: 'Setiap petugas bekerja pada data dan tugas yang sama, tetapi tetap dibatasi sesuai peran, penugasan, kelas, dan masa jabatan aktif.',
    problems: [
      ['Input berulang', 'Data yang sama sering dicatat kembali di banyak file.'],
      ['Status sulit diketahui', 'Rekan kerja tidak selalu tahu pekerjaan sudah sampai tahap mana.'],
      ['Batas tugas kabur', 'Guru dan petugas perlu konteks kelas, mapel, dan kewenangan yang jelas.'],
      ['Serah-terima tidak rapi', 'Perubahan periode atau penanggung jawab perlu jejak yang dapat dibaca.'],
    ],
    goal: 'Membuat pekerjaan harian lebih teratur, mengurangi pencatatan ganda, dan membantu setiap orang tahu apa yang harus dilakukan berikutnya.',
    journey: ['Masuk dengan akun sendiri', 'Periksa konteks tugas', 'Kerjakan alur sumber', 'Pantau status dan tindak lanjut'],
    features: [
      ['Jadwal dan Sesi Kelas', 'Ritme kegiatan harian berdasarkan periode yang aktif.'],
      ['Modul Ajar dan Asesmen', 'Perencanaan, Bank Soal, sesi asesmen, remedial, dan koreksi.'],
      ['Data Sekolah', 'Siswa, kelas, jurusan, tahun ajaran, kalender, dan PPDB.'],
      ['Komunikasi', 'Pengumuman dan notifikasi kepada penerima yang tepat.'],
    ],
    evidence: [
      { title: 'Jadwal menjadi ritme kerja harian', lead: 'Guru dan petugas memulai dari hari, kelas, mata pelajaran, serta periode yang benar sebelum mencatat kegiatan.', image: 'shot-schedule-desktop.png', bullets: ['Pilih konteks sebelum membuka sesi', 'Perubahan periode dibatasi agar data tidak tercampur'], source: 'apps/web/src/app/dashboard/jadwal/page.tsx' },
      { title: 'Penugasan menjaga batas kerja', lead: 'Guru hanya mengelola kelas dan mata pelajaran yang memang menjadi tanggung jawabnya.', image: 'shot-teacher-assignment-desktop.png', bullets: ['Penugasan harus aktif pada tahun ajaran berjalan', 'Kewenangan tetap diverifikasi oleh server'], source: 'apps/api/src/teaching-assignment/teaching-assignment.service.ts' },
    ],
  },
  {
    id: 'student', fileName: 'presentasi-siswa.pptx',
    title: 'DIIS untuk Siswa',
    subtitle: 'Membantu siswa memahami tugas, asesmen, remedial, dan hasil belajar resmi',
    audience: 'Siswa', illustration: 'diis-student-journey.png',
    illustrationAlt: 'Siswa menggunakan perangkat belajar untuk mengikuti modul, asesmen, remedial, dan hasil belajar secara terarah.',
    humanDefinition: 'DIIS adalah tempat siswa melihat kegiatan belajar yang menjadi miliknya: jadwal, modul, tugas, asesmen, remedial, pengumuman, dan Rapor resmi.',
    humanMeaning: 'Siswa tidak perlu mencari informasi di banyak tempat. DIIS membantu menunjukkan apa yang perlu dikerjakan, kapan tenggatnya, dan bagaimana statusnya.',
    problems: [
      ['Tugas mudah terlewat', 'Informasi belajar bisa tersebar di banyak grup dan pesan.'],
      ['Tenggat tidak jelas', 'Siswa perlu melihat pekerjaan aktif dan waktunya dengan cepat.'],
      ['Hasil membingungkan', 'Nilai berjalan berbeda dari Rapor resmi yang sudah didistribusikan.'],
      ['Akun tidak aman', 'Setiap siswa harus menggunakan sesi miliknya sendiri.'],
    ],
    goal: 'Membantu siswa belajar lebih mandiri, memahami langkah berikutnya, dan membaca hasil resmi tanpa membuka data siswa lain.',
    journey: ['Lihat kegiatan hari ini', 'Kerjakan tugas atau asesmen', 'Periksa remedial bila ada', 'Baca hasil resmi'],
    features: [
      ['Beranda Akademik', 'Ringkasan kegiatan dan status yang relevan bagi siswa.'],
      ['Modul dan Tugas', 'Materi belajar serta pekerjaan yang mengikuti kelas siswa.'],
      ['Asesmen dan Remedial', 'Sesi resmi, jawaban, tenggat, dan status tindak lanjut.'],
      ['Rapor Resmi', 'Snapshot semester yang sudah ditinjau dan dibagikan sekolah.'],
    ],
    evidence: [
      { title: 'Mulai dari kegiatan yang perlu dikerjakan', lead: 'Beranda akademik menampilkan aktivitas yang sesuai dengan kelas dan periode siswa.', image: 'shot-academic-mobile.png', bullets: ['Periksa nama kelas dan periode', 'Gunakan akun sendiri dan jangan membagikan kata sandi'], source: 'apps/web/src/app/dashboard/akademik/page.tsx', mobile: true },
      { title: 'Rapor resmi tetap mudah dibaca', lead: 'Rapor siswa berasal dari snapshot semester yang sudah didistribusikan sekolah, bukan angka yang masih berubah.', image: 'shot-report-student-mobile.png', bullets: ['Pilih semester yang benar', 'Laporkan perbedaan melalui guru atau kanal bantuan sekolah'], source: 'apps/api/src/report-cards/report-cards.service.ts', mobile: true },
    ],
  },
  {
    id: 'family', fileName: 'presentasi-orang-tua-industri.pptx',
    title: 'DIIS untuk Orang Tua dan Mitra Industri',
    subtitle: 'Informasi yang tepat, terbatas, dan mudah dipahami',
    audience: 'Orang Tua dan Industri', illustration: 'diis-family-industry.png',
    illustrationAlt: 'Orang tua dan mitra industri menerima informasi sekolah melalui jalur yang jelas, terbatas, dan menjaga privasi.',
    humanDefinition: 'DIIS membantu keluarga membaca informasi resmi anak, sementara mitra industri menerima gambaran kemampuan dan kerja sama sekolah melalui jalur yang disiapkan sekolah.',
    humanMeaning: 'Akses keluarga selalu mengikuti anak yang dipilih. Akses industri disampaikan secara terbatas dan jujur, tanpa menjanjikan layanan yang belum tersedia.',
    problems: [
      ['Informasi anak tercecer', 'Orang tua membutuhkan satu tempat untuk melihat status resmi.'],
      ['Konteks mudah tertukar', 'Keluarga dengan beberapa anak harus selalu melihat anak yang tepat.'],
      ['Bahasa terlalu teknis', 'Status sekolah perlu dijelaskan dengan kata yang mudah dipahami.'],
      ['Kemitraan rawan klaim', 'Industri perlu melihat kemampuan yang nyata, bukan data simulasi.'],
    ],
    goal: 'Membangun komunikasi sekolah, keluarga, dan mitra yang lebih jelas sambil tetap menjaga privasi serta batas kewenangan.',
    journey: ['Pilih konteks yang tepat', 'Baca informasi resmi', 'Pahami status dan tenggat', 'Hubungi sekolah melalui kanal resmi'],
    features: [
      ['Rapor Anak', 'Snapshot semester resmi untuk anak yang dipilih.'],
      ['Keuangan Keluarga', 'Ringkasan pembayaran tanpa kewenangan mengubah transaksi.'],
      ['Remedial Anak', 'Status dan tenggat tanpa soal, kunci, atau data sensitif.'],
      ['Kemitraan Industri', 'Informasi terbatas tentang kemampuan dan layanan yang tersedia.'],
    ],
    evidence: [
      { title: 'Konteks anak selalu terlihat', lead: 'Orang tua memilih anak secara eksplisit sebelum membaca Rapor, keuangan, atau remedial.', image: 'shot-report-mobile.png', bullets: ['Periksa nama anak sebelum membaca', 'Tautan yang tidak sesuai kepemilikan ditolak'], source: 'apps/api/src/report-cards/report-cards.service.ts', mobile: true },
      { title: 'Kemitraan ditampilkan secara jujur', lead: 'Bila workflow industri belum tersedia, DIIS menampilkan keadaan tersebut apa adanya dan mengarahkan koordinasi melalui sekolah.', image: 'shot-industry-desktop.png', bullets: ['Tidak ada klaim lowongan atau layanan palsu', 'Fasilitator sekolah menjaga batas informasi'], source: 'apps/web/src/app/dashboard/lowongan/page.tsx' },
    ],
  },
];

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

async function readBlob(filePath) {
  const bytes = await fs.readFile(filePath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function addText(slide, text, position, style = {}) {
  const shape = slide.shapes.add({ geometry: 'textbox', position, fill: 'none', line: { style: 'solid', fill: 'none', width: 0 } });
  shape.text = text;
  shape.text.style = { fontFamily: 'Aptos', fontSize: 22, color: COLORS.ink, ...style };
  return shape;
}

function addRect(slide, position, fill, line = fill, radius = 0) {
  return slide.shapes.add({ geometry: radius ? 'roundRect' : 'rect', position, fill, line: { style: 'solid', fill: line, width: 1 } });
}

function setNotes(slide, body, sources) {
  slide.speakerNotes.textFrame.setText(`${body}\n\nCatatan fasilitator: Gunakan bahasa sehari-hari. Beri ruang untuk pertanyaan dan jangan membacakan semua teks di layar.\n\n[Sources]\n${sources.map((source) => `- ${source}`).join('\n')}`);
  slide.speakerNotes.setVisible(true);
}

function addFooter(slide, deck, index) {
  addText(slide, `DIIS | ${deck.audience}`, { left: 64, top: 682, width: 980, height: 20 }, { fontSize: 11, color: '#8493A5' });
  addText(slide, String(index), { left: 1175, top: 682, width: 40, height: 20 }, { fontSize: 11, color: '#8493A5', textAlign: 'right' });
}

function addKicker(slide, text) {
  addText(slide, text.toUpperCase(), { left: 70, top: 42, width: 520, height: 24 }, { fontSize: 13, bold: true, color: COLORS.green, letterSpacing: 0 });
}

async function addImage(slide, filePath, position, alt, fit = 'cover') {
  slide.images.add({ blob: await readBlob(filePath), contentType: 'image/png', alt, fit, position });
}

function addTitleSlide(presentation, deck) {
  const slide = presentation.slides.add();
  slide.background.fill = COLORS.navy;
  addRect(slide, { left: 0, top: 0, width: 20, height: 720 }, COLORS.green);
  addText(slide, 'DIIS SMK DARUSSALAM SUBAH', { left: 82, top: 70, width: 550, height: 28 }, { fontSize: 15, bold: true, color: '#8DE0C2' });
  addText(slide, deck.title, { left: 82, top: 158, width: 1080, height: 140 }, { fontSize: deck.title.length > 37 ? 38 : 44, bold: true, color: COLORS.white });
  addText(slide, deck.subtitle, { left: 84, top: 326, width: 980, height: 84 }, { fontSize: 24, color: '#CAD6E4' });
  addRect(slide, { left: 82, top: 490, width: 480, height: 46 }, '#173049', '#254967', 8);
  addText(slide, `Untuk ${deck.audience}`, { left: 106, top: 501, width: 430, height: 28 }, { fontSize: 16, bold: true, color: COLORS.white });
  addText(slide, 'Presentasi pengenalan dan panduan adopsi', { left: 84, top: 565, width: 680, height: 32 }, { fontSize: 15, color: '#93A5B8' });
  addFooter(slide, deck, 1);
  setNotes(slide, `Buka dengan pertanyaan sederhana: informasi sekolah apa yang paling sering sulit ditemukan atau ditelusuri? Deck ini menjelaskan bagaimana DIIS membantu ${deck.audience}.`, COMMON_SOURCES);
}

async function addDefinitionSlide(presentation, deck) {
  const slide = presentation.slides.add();
  slide.background.fill = COLORS.cloud;
  addKicker(slide, 'Mengenal DIIS');
  addText(slide, 'Apa itu DIIS?', { left: 70, top: 76, width: 500, height: 58 }, { fontSize: 38, bold: true, color: COLORS.navy });
  addText(slide, deck.humanDefinition, { left: 72, top: 164, width: 475, height: 170 }, { fontSize: 23, color: COLORS.ink });
  addRect(slide, { left: 70, top: 390, width: 500, height: 132 }, COLORS.paleGreen, '#9FD7C3', 8);
  addText(slide, 'Artinya bagi Anda', { left: 96, top: 412, width: 250, height: 26 }, { fontSize: 15, bold: true, color: '#086647' });
  addText(slide, deck.humanMeaning, { left: 96, top: 452, width: 448, height: 66 }, { fontSize: 17, color: '#245E4A' });
  addRect(slide, { left: 616, top: 92, width: 590, height: 500 }, COLORS.navy2, COLORS.navy2, 8);
  await addImage(slide, path.join(ASSET_ROOT, 'diis-school-ecosystem.png'), { left: 628, top: 104, width: 566, height: 476 }, 'Ilustrasi ekosistem sekolah Indonesia yang terhubung melalui DIIS.');
  addText(slide, 'Satu sumber kerja bersama, dengan akses sesuai tanggung jawab.', { left: 650, top: 610, width: 530, height: 30 }, { fontSize: 14, color: COLORS.muted, textAlign: 'center' });
  addFooter(slide, deck, 2);
  setNotes(slide, 'Jelaskan bahwa DIIS bukan sekadar kumpulan menu. DIIS menyatukan alur kerja sekolah dan menjaga setiap pengguna tetap pada konteks yang sah.', COMMON_SOURCES);
}

function addProblemSlide(presentation, deck) {
  const slide = presentation.slides.add();
  slide.background.fill = COLORS.white;
  addKicker(slide, 'Mengapa DIIS dibuat');
  addText(slide, 'Masalah yang ingin diselesaikan', { left: 70, top: 76, width: 900, height: 58 }, { fontSize: 36, bold: true, color: COLORS.navy });
  addText(slide, 'Masalahnya bukan kekurangan data, melainkan data yang tersebar, sulit ditelusuri, dan tidak selalu berada pada konteks yang tepat.', { left: 72, top: 137, width: 1080, height: 56 }, { fontSize: 19, color: COLORS.muted });
  const fills = [COLORS.paleCoral, COLORS.paleAmber, COLORS.paleBlue, COLORS.paleGreen];
  const accents = [COLORS.coral, COLORS.amber, COLORS.blue, COLORS.green];
  deck.problems.forEach(([title, body], index) => {
    const left = 72 + (index % 2) * 568;
    const top = 224 + Math.floor(index / 2) * 178;
    addRect(slide, { left, top, width: 530, height: 146 }, fills[index], accents[index], 8);
    addRect(slide, { left, top, width: 10, height: 146 }, accents[index]);
    addText(slide, title, { left: left + 34, top: top + 20, width: 455, height: 34 }, { fontSize: 22, bold: true, color: COLORS.ink });
    addText(slide, body, { left: left + 34, top: top + 66, width: 455, height: 60 }, { fontSize: 17, color: COLORS.muted });
  });
  addFooter(slide, deck, 3);
  setNotes(slide, 'Ajak audiens memilih satu masalah yang paling sering mereka alami. Hubungkan jawabannya dengan workflow yang akan ditunjukkan.', COMMON_SOURCES);
}

function addGoalSlide(presentation, deck) {
  const slide = presentation.slides.add();
  slide.background.fill = COLORS.navy;
  addText(slide, 'Tujuan DIIS', { left: 72, top: 58, width: 420, height: 56 }, { fontSize: 38, bold: true, color: COLORS.white });
  addText(slide, deck.goal, { left: 74, top: 136, width: 1080, height: 88 }, { fontSize: 25, color: '#D5E0EA' });
  addText(slide, 'Alur yang sederhana', { left: 76, top: 276, width: 360, height: 34 }, { fontSize: 17, bold: true, color: '#8DE0C2' });
  deck.journey.forEach((step, index) => {
    const left = 72 + index * 292;
    const color = index % 2 === 0 ? COLORS.green : COLORS.blue;
    addRect(slide, { left, top: 340, width: 238, height: 142 }, '#14243B', '#35506F', 8);
    addRect(slide, { left: left + 20, top: 360, width: 40, height: 40 }, color, color, 8);
    addText(slide, String(index + 1), { left: left + 20, top: 367, width: 40, height: 26 }, { fontSize: 18, bold: true, color: COLORS.white, textAlign: 'center' });
    addText(slide, step, { left: left + 20, top: 418, width: 198, height: 52 }, { fontSize: 19, bold: true, color: COLORS.white });
    if (index < 3) addText(slide, '→', { left: left + 246, top: 389, width: 44, height: 48 }, { fontSize: 30, bold: true, color: '#7C91AA', textAlign: 'center' });
  });
  addRect(slide, { left: 72, top: 548, width: 1116, height: 74 }, '#182940', '#38516E', 8);
  addText(slide, 'DIIS membantu pekerjaan lebih terlihat dan teratur. Keputusan tetap berada pada petugas yang berwenang.', { left: 98, top: 568, width: 1060, height: 36 }, { fontSize: 18, color: '#F4F7FA', textAlign: 'center' });
  addFooter(slide, deck, 4);
  setNotes(slide, 'Tekankan bahwa DIIS memperjelas alur dan tanggung jawab, bukan menggantikan pertimbangan profesional guru atau pimpinan.', ['apps/web/src/lib/help/help-authority.ts', 'apps/web/src/lib/help/help-projection.ts']);
}

async function addFeatureSlide(presentation, deck) {
  const slide = presentation.slides.add();
  slide.background.fill = COLORS.cloud;
  addKicker(slide, 'Fitur utama');
  addText(slide, 'Apa saja yang tersedia?', { left: 70, top: 76, width: 650, height: 54 }, { fontSize: 36, bold: true, color: COLORS.navy });
  addText(slide, 'Fitur DIIS saling terhubung, tetapi tampilan dan tindakannya tetap mengikuti peran masing-masing.', { left: 72, top: 134, width: 710, height: 54 }, { fontSize: 18, color: COLORS.muted });
  deck.features.forEach(([title, body], index) => {
    const top = 214 + index * 100;
    const color = index % 2 === 0 ? COLORS.green : COLORS.blue;
    addRect(slide, { left: 70, top, width: 610, height: 82 }, COLORS.white, COLORS.line, 8);
    addRect(slide, { left: 70, top, width: 9, height: 82 }, color);
    addText(slide, title, { left: 100, top: top + 12, width: 240, height: 28 }, { fontSize: 19, bold: true, color: COLORS.ink });
    addText(slide, body, { left: 100, top: top + 42, width: 545, height: 32 }, { fontSize: 14, color: COLORS.muted });
  });
  addRect(slide, { left: 728, top: 190, width: 478, height: 424 }, COLORS.navy2, COLORS.navy2, 8);
  await addImage(slide, path.join(ASSET_ROOT, deck.illustration), { left: 740, top: 202, width: 454, height: 400 }, deck.illustrationAlt);
  addFooter(slide, deck, 5);
  setNotes(slide, 'Tidak perlu menjelaskan semua menu. Pilih dua fitur terdekat dengan pekerjaan audiens, lalu gunakan screenshot sampel sebagai bukti.', COMMON_SOURCES);
}

async function addEvidenceSlide(presentation, deck, evidence, index) {
  const slide = presentation.slides.add();
  slide.background.fill = COLORS.white;
  addRect(slide, { left: 0, top: 0, width: 1280, height: 14 }, index % 2 === 0 ? COLORS.green : COLORS.blue);
  addKicker(slide, 'Sampel tampilan');
  addText(slide, evidence.title, { left: 64, top: 82, width: 520, height: 82 }, { fontSize: 33, bold: true, color: COLORS.navy });
  addText(slide, evidence.lead, { left: 64, top: 182, width: 500, height: 110 }, { fontSize: 20, color: COLORS.muted });
  evidence.bullets.forEach((bullet, bulletIndex) => {
    const top = 328 + bulletIndex * 82;
    addRect(slide, { left: 66, top: top + 5, width: 18, height: 18 }, bulletIndex === 0 ? COLORS.green : COLORS.blue);
    addText(slide, bullet, { left: 104, top, width: 430, height: 56 }, { fontSize: 18, bold: true, color: COLORS.ink });
  });
  addRect(slide, { left: 64, top: 520, width: 490, height: 94 }, COLORS.paleGreen, '#9DD8C3', 8);
  addText(slide, 'Screenshot adalah pelengkap', { left: 88, top: 538, width: 260, height: 26 }, { fontSize: 15, bold: true, color: '#096747' });
  addText(slide, 'Gunakan untuk menunjukkan alur, bukan untuk memenuhi slide dengan detail kecil.', { left: 88, top: 572, width: 430, height: 34 }, { fontSize: 14, color: '#245E4A' });
  const imagePosition = evidence.mobile ? { left: 758, top: 104, width: 292, height: 510 } : { left: 610, top: 164, width: 598, height: 374 };
  addRect(slide, { left: imagePosition.left - 16, top: imagePosition.top - 16, width: imagePosition.width + 32, height: imagePosition.height + 32 }, COLORS.navy2, COLORS.navy2, 8);
  await addImage(slide, path.join(SCREENSHOT_ROOT, evidence.image), imagePosition, `${evidence.title}. Screenshot DIIS dengan fixture sintetis.`, 'contain');
  addText(slide, 'Tampilan aktual dari aplikasi frozen, menggunakan data sintetis.', { left: imagePosition.left, top: imagePosition.top + imagePosition.height + 18, width: imagePosition.width, height: 28 }, { fontSize: 12, color: COLORS.muted, textAlign: 'center' });
  addFooter(slide, deck, index);
  setNotes(slide, evidence.lead, [evidence.source, `apps/web/private/help-screenshots/${evidence.image}`]);
}

function addCloseSlide(presentation, deck) {
  const slide = presentation.slides.add();
  slide.background.fill = COLORS.navy;
  addText(slide, 'Mulai dari langkah kecil yang aman', { left: 80, top: 66, width: 980, height: 64 }, { fontSize: 40, bold: true, color: COLORS.white });
  addText(slide, 'DIIS paling mudah dipahami ketika langsung dicoba pada alur yang dekat dengan pekerjaan sehari-hari.', { left: 84, top: 145, width: 1030, height: 64 }, { fontSize: 22, color: '#C9D5E3' });
  const steps = [['1', 'Gunakan akun latihan dan data sintetis'], ['2', 'Pilih satu workflow sesuai peran'], ['3', 'Catat pertanyaan atau hambatan yang nyata'], ['4', 'Gunakan data nyata setelah readiness disetujui']];
  steps.forEach(([number, text], index) => {
    const left = 82 + (index % 2) * 558;
    const top = 268 + Math.floor(index / 2) * 114;
    addRect(slide, { left, top, width: 518, height: 88 }, '#15263E', '#36506F', 8);
    addRect(slide, { left: left + 18, top: top + 22, width: 44, height: 44 }, index % 2 === 0 ? COLORS.green : COLORS.blue, undefined, 8);
    addText(slide, number, { left: left + 18, top: top + 30, width: 44, height: 28 }, { fontSize: 19, bold: true, color: COLORS.white, textAlign: 'center' });
    addText(slide, text, { left: left + 82, top: top + 22, width: 410, height: 48 }, { fontSize: 18, bold: true, color: COLORS.white });
  });
  addRect(slide, { left: 80, top: 534, width: 1110, height: 88 }, '#2D271E', '#715E38', 8);
  addText(slide, 'Catatan go-live', { left: 104, top: 551, width: 180, height: 26 }, { fontSize: 14, bold: true, color: '#F6D794' });
  addText(slide, 'Automation aktivasi Appointment harian di production belum aktif dan wajib diselesaikan sebelum penggunaan operasional penuh.', { left: 104, top: 582, width: 1040, height: 32 }, { fontSize: 16, color: '#FFF3D4' });
  addFooter(slide, deck, 9);
  setNotes(slide, 'Tutup dengan ajakan mencoba satu workflow yang relevan. Jangan menyatakan Appointment automation production sudah operasional.', ['docs/audits/WAVE9-SHARED-AUTH-CONTROLLED-CUTOVER-INDEPENDENT-REVIEW-2026-08-28.md', ...COMMON_SOURCES]);
}

function addGlossarySlide(presentation, deck) {
  const slide = presentation.slides.add();
  slide.background.fill = COLORS.white;
  addKicker(slide, 'Istilah yang sering muncul');
  addText(slide, 'Bahasa sederhananya', { left: 70, top: 76, width: 680, height: 58 }, { fontSize: 36, bold: true, color: COLORS.navy });
  addText(slide, 'Istilah ini membantu menjelaskan cara DIIS menjaga informasi dan alur kerja tetap tertib.', { left: 72, top: 140, width: 980, height: 42 }, { fontSize: 18, color: COLORS.muted });
  const terms = [
    ['Authority', 'Batas akses dan tindakan sesuai tanggung jawab pengguna.'],
    ['Appointment', 'Jabatan dengan masa tugas aktif, misalnya Kepala Sekolah atau WAKA.'],
    ['Workflow', 'Urutan kerja dari mulai, ditinjau, sampai selesai.'],
    ['Snapshot', 'Salinan resmi data pada satu waktu yang tidak ikut berubah.'],
    ['Data pribadi', 'Informasi seseorang yang harus dijaga dan tidak dibagikan sembarangan.'],
    ['Fixture sintetis', 'Data latihan buatan yang aman dan bukan data warga sekolah nyata.'],
  ];
  terms.forEach(([term, meaning], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const left = 72 + col * 568;
    const top = 216 + row * 126;
    addRect(slide, { left, top, width: 530, height: 100 }, index % 2 === 0 ? COLORS.paleGreen : COLORS.paleBlue, COLORS.line, 8);
    addText(slide, term, { left: left + 24, top: top + 15, width: 170, height: 28 }, { fontSize: 19, bold: true, color: index % 2 === 0 ? '#086647' : '#174A9C' });
    addText(slide, meaning, { left: left + 24, top: top + 48, width: 478, height: 42 }, { fontSize: 15, color: COLORS.ink });
  });
  addFooter(slide, deck, 8);
  setNotes(slide, 'Gunakan glosarium hanya ketika istilah muncul dalam percakapan. Hindari jargon bila kata sehari-hari sudah cukup.', ['apps/web/src/lib/help/help-catalog.ts', ...COMMON_SOURCES]);
}

async function buildDeck(deck) {
  const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });
  addTitleSlide(presentation, deck);
  await addDefinitionSlide(presentation, deck);
  addProblemSlide(presentation, deck);
  addGoalSlide(presentation, deck);
  await addFeatureSlide(presentation, deck);
  await addEvidenceSlide(presentation, deck, deck.evidence[0], 6);
  await addEvidenceSlide(presentation, deck, deck.evidence[1], 7);
  addGlossarySlide(presentation, deck);
  addCloseSlide(presentation, deck);
  const deckQa = path.join(QA_ROOT, deck.id);
  await fs.rm(deckQa, { recursive: true, force: true });
  await fs.mkdir(deckQa, { recursive: true });
  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, '0')}`;
    await writeBlob(path.join(deckQa, `${stem}.png`), await presentation.export({ slide, format: 'png', scale: 1 }));
    const layout = await slide.export({ format: 'layout' });
    await fs.writeFile(path.join(deckQa, `${stem}.layout.json`), await layout.text());
  }
  await writeBlob(path.join(deckQa, 'montage.webp'), await presentation.export({ format: 'webp', montage: true, scale: 1 }));
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(path.join(OUTPUT_ROOT, deck.fileName));
}

async function main() {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  await fs.mkdir(QA_ROOT, { recursive: true });
  for (const deck of decks) await buildDeck(deck);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
