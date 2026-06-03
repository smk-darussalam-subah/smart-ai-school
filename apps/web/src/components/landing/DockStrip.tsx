'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';

interface DockItem {
  src: string;
  alt: string;
  label: string;
}

interface Props {
  items: readonly DockItem[];
  className?: string;
}

function getScale(idx: number, activeIdx: number | null, isMobile: boolean): number {
  if (activeIdx === null) return 1;
  if (isMobile) return idx === activeIdx ? 1.08 : 1;
  const dist = Math.abs(idx - activeIdx);
  if (dist === 0) return 1.32;
  if (dist === 1) return 1.14;
  if (dist === 2) return 1.06;
  return 1;
}

/**
 * DockStrip — Apple dock magnify effect pada baris foto.
 * Hover: item membesar + tetangga sedikit ikut besar (smooth, ringan, CSS transform).
 * Mobile: efek disederhanakan (scale kecil, tanpa magnify tetangga).
 * Hormati prefers-reduced-motion.
 */
export function DockStrip({ items, className = '' }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mqMotion.matches);
    const handleMotion = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mqMotion.addEventListener('change', handleMotion);

    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      mqMotion.removeEventListener('change', handleMotion);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  const cols = items.length;

  return (
    <div
      className={`grid gap-3 md:gap-4 ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      onMouseLeave={() => setActiveIdx(null)}
    >
      {items.map((item, idx) => {
        const scale = reducedMotion ? 1 : getScale(idx, activeIdx, isMobile);
        const isActive = activeIdx === idx;
        return (
          <div
            key={item.src}
            className="relative aspect-square"
            style={{ overflow: 'visible' }}
            onMouseEnter={() => setActiveIdx(idx)}
          >
            <div
              className="relative w-full h-full overflow-hidden rounded-[12px] md:rounded-[14px]"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'bottom center',
                transition: reducedMotion
                  ? 'none'
                  : 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
                zIndex: isActive ? 20 : scale > 1 ? 10 : 1,
                position: 'relative',
              }}
            >
              <Image
                src={item.src}
                alt={item.alt}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 25vw, (max-width: 1024px) 12vw, 8vw"
              />
              <div
                className="absolute inset-0 transition-colors duration-300"
                style={{ background: isActive ? 'rgba(6,69,52,0.08)' : 'transparent' }}
              />
              <div className="absolute bottom-2 left-2">
                <span className="rounded-md bg-smk-emerald-deep/75 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  {item.label}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
