// C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\apps\web\src\components\landing\ParallaxLayer.tsx
'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  className?: string;
  /** Parallax speed multiplier. Default 0.15 — moves 15% of scrollY. */
  speed?: number;
}

/**
 * Wraps children (or renders a bare div) with a lightweight parallax
 * translateY effect via requestAnimationFrame + window.scrollY.
 *
 * - Respects `prefers-reduced-motion: reduce` — no transform applied.
 * - Cleanup cancels the rAF loop on unmount to prevent memory leaks.
 * - Intended only for decorative/absolute-positioned elements so there
 *   is zero layout shift.
 */
export function ParallaxLayer({ children, className = '', speed = 0.15 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rafId = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Honour user's motion preference — bail out entirely.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let running = true;

    const tick = () => {
      if (!running) return;
      if (el) {
        const ty = -(window.scrollY * speed);
        el.style.transform = `translateY(${ty}px)`;
      }
      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafId.current);
    };
  }, [speed]);

  return (
    <div ref={ref} className={className} aria-hidden>
      {children}
    </div>
  );
}
