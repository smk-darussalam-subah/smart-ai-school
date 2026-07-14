/**
 * AuthBranding — Hero branding section for the auth page.
 *
 * Features:
 * - Large DIIS logo with CSS 3D breathing animation
 * - "Digital Integrated Information System" title in Fraunces
 * - "Sekolah Industri Berbasis Pesantren" subtitle
 * - "20 Smart Modules" badge
 */
import { cn } from '@/lib/utils';

export function AuthBranding({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center text-center', className)}>
      {/* 3D Logo */}
      <div className="relative mb-6">
        {/* Glow ring */}
        <div
          className="absolute inset-0 rounded-3xl animate-pulse-glow"
          style={{
            background: 'radial-gradient(circle, var(--auth-glow-blue) 0%, transparent 70%)',
            transform: 'scale(1.6)',
          }}
          aria-hidden="true"
        />

        {/* Logo container */}
        <div
          className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-600 via-smk-blue to-primary-900 animate-breathe"
          style={{
            boxShadow: `
              0 0 40px var(--auth-glow-blue),
              0 0 80px var(--auth-glow-blue),
              inset 0 1px 0 rgba(255,255,255,0.15)
            `,
          }}
        >
          <span className="font-fraunces text-3xl font-bold text-white drop-shadow-lg">D</span>
        </div>
      </div>

      {/* Title */}
      <h1 className="font-fraunces text-2xl font-bold tracking-tight text-[var(--auth-text)] sm:text-3xl">
        Digital Integrated
        <br />
        <span className="bg-gradient-to-r from-primary-500 to-smk-emerald-bright bg-clip-text text-transparent">
          Information System
        </span>
      </h1>

      {/* Subtitle */}
      <p className="mt-2 text-sm text-[var(--auth-muted)]">
        Sekolah Industri Berbasis Pesantren
      </p>

      {/* Module count badge */}
      <div className="mt-4 flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium',
            'border-[var(--auth-border)] bg-[var(--auth-surface)] text-[var(--auth-muted)]',
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-smk-emerald-bright animate-pulse" />
          20 Smart Modules Active
        </span>
      </div>
    </div>
  );
}
