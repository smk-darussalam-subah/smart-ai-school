// C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\apps\web\src\components\landing\TiltCard.tsx
'use client';

import {
  useRef,
  useCallback,
  type ReactNode,
  type PointerEvent,
  type CSSProperties,
} from 'react';

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * Card wrapper that applies a 3D tilt effect on pointer move.
 *
 * - Max tilt: ±8 degrees on both axes.
 * - Throttled via a single rAF flag — no jank.
 * - Respects `prefers-reduced-motion: reduce` — returns children unchanged.
 * - No external dependency.
 */
export function TiltCard({ children, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rafPending = useRef(false);
  const rotateX = useRef(0);
  const rotateY = useRef(0);

  // Detect reduced-motion once at first render (client-side only).
  // We memoize by reading the media query during the first pointer event.
  const prefersReducedMotion = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const applyTilt = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `perspective(800px) rotateX(${rotateX.current}deg) rotateY(${rotateY.current}deg)`;
    rafPending.current = false;
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (prefersReducedMotion()) return;
      if (rafPending.current) return;

      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      // Normalise to [-1, 1] then scale to max ±8 deg
      const MAX_DEG = 8;
      rotateY.current = (dx / (rect.width / 2)) * MAX_DEG;
      rotateX.current = -(dy / (rect.height / 2)) * MAX_DEG;

      rafPending.current = true;
      requestAnimationFrame(applyTilt);
    },
    [prefersReducedMotion, applyTilt]
  );

  const handlePointerLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    rotateX.current = 0;
    rotateY.current = 0;
    el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg)';
  }, []);

  const baseStyle: CSSProperties = {
    transition: 'transform 0.25s ease',
    willChange: 'transform',
  };

  return (
    <div
      ref={ref}
      className={className}
      style={baseStyle}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {children}
    </div>
  );
}
