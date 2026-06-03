const VALUES = [
  'Tahfidz & Akhlak',
  'Praktik Industri',
  'Teknologi Terkini',
  'BKK & Penyaluran Kerja',
  'Lingkungan Pesantren',
] as const;

export function MarqueeStrip() {
  // Duplikat untuk seamless loop
  const items = [...VALUES, ...VALUES];

  return (
    <div
      className="bg-smk-emerald-deep text-[#bfe6d4] overflow-hidden whitespace-nowrap py-0"
      aria-label="Nilai-nilai unggulan SMK Darussalam Subah"
    >
      <div className="inline-block animate-marquee py-3.5 text-[15px] font-medium">
        {items.map((value, i) => (
          <span key={i} className="mx-6">
            <i className="not-italic text-smk-lime">✦</i> {value}
          </span>
        ))}
      </div>
    </div>
  );
}
