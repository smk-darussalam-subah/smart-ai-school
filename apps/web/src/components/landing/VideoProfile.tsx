'use client';

import Image from 'next/image';
import { useState } from 'react';

const VIDEO_ID = 'rsDM1EkWf0E';
const EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0`;

export function VideoProfile() {
  const [playing, setPlaying] = useState(false);

  return (
    <section id="video" className="py-[70px] md:py-[90px] bg-smk-sand">
      <div className="max-w-[1180px] mx-auto px-5 md:px-6">
        <div className="grid md:grid-cols-2 gap-8 md:gap-14 items-center">
          {/* Left: text */}
          <div>
            <div className="font-bold text-[12px] md:text-[13px] tracking-[0.12em] uppercase text-smk-emerald mb-3">
              Video Profil
            </div>
            <h2 className="font-fraunces font-semibold text-[clamp(24px,3.2vw,38px)] leading-[1.1] tracking-tight text-smk-ink mb-4">
              Lihat sendiri seperti apa belajar di Darussalam.
            </h2>
            <p className="text-[15px] md:text-[16px] text-smk-ink-soft leading-relaxed mb-6">
              Suasana pesantren, praktik bengkel, lab komputer, hingga kegiatan
              BKK penyaluran kerja — semuanya ada di satu ekosistem pendidikan
              yang unik.
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              {['Bengkel Otomotif', 'Lab Jaringan', 'Kajian Pesantren', 'BKK & Alumni'].map(
                (tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 rounded-full bg-smk-emerald/10 text-smk-emerald-deep font-medium text-[13px]"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Right: YouTube embed / thumbnail */}
          <div className="relative rounded-[20px] md:rounded-[24px] overflow-hidden aspect-video bg-smk-emerald-deep shadow-[0_24px_64px_-24px_rgba(6,69,52,0.5)]">
            {playing ? (
              <iframe
                src={EMBED_URL}
                title="Video Profil SMK Darussalam Subah"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            ) : (
              <button
                onClick={() => setPlaying(true)}
                className="absolute inset-0 w-full h-full group cursor-pointer"
                aria-label="Putar video profil SMK Darussalam Subah"
              >
                {/* Thumbnail */}
                <Image
                  src="/landing/video-thumb.jpg"
                  alt="Thumbnail video profil SMK Darussalam Subah"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
                {/* Overlay */}
                <div className="absolute inset-0 bg-smk-emerald-deep/40 group-hover:bg-smk-emerald-deep/30 transition-colors" />
                {/* Play button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/95 grid place-items-center shadow-xl group-hover:scale-105 transition-transform">
                    <svg
                      className="w-6 h-6 md:w-8 md:h-8 text-smk-emerald-deep translate-x-0.5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
                {/* Label */}
                <div className="absolute bottom-4 left-4 right-4">
                  <span className="bg-black/50 text-white text-[12px] md:text-[13px] font-medium px-3 py-1.5 rounded-lg backdrop-blur-sm">
                    Video Profil SMK Darussalam Subah
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
