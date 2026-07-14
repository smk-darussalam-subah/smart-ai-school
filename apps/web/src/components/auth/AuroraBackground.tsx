/**
 * AuroraBackground — Multi-layer animated background for the auth experience.
 *
 * Layers (bottom → top):
 *  1. Base gradient (mesh)
 *  2. Aurora blobs (shifting gradients)
 *  3. Floating blur orbs
 *  4. Subtle grid overlay
 *  5. Noise texture (CSS-only via SVG data URI)
 *
 * Pure CSS — no JS. Respects prefers-reduced-motion.
 */
import { cn } from '@/lib/utils';

export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none fixed inset-0 z-0 overflow-hidden', className)}
    >
      {/* Layer 1: Base mesh gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 30%, var(--auth-glow-blue) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 70%, var(--auth-glow-em) 0%, transparent 55%),
            radial-gradient(ellipse 50% 40% at 50% 50%, var(--auth-glow-violet) 0%, transparent 50%),
            linear-gradient(180deg, var(--auth-bg) 0%, var(--auth-bg2) 100%)
          `,
        }}
      />

      {/* Layer 2: Aurora shifting blobs */}
      <div className="absolute inset-0">
        <div
          className="absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full opacity-40 blur-[100px] animate-aurora-shift will-change-transform"
          style={{
            background: 'linear-gradient(135deg, var(--auth-glow-blue), var(--auth-glow-em))',
          }}
        />
        <div
          className="absolute -right-24 top-1/3 h-[400px] w-[400px] rounded-full opacity-30 blur-[80px] animate-aurora-shift will-change-transform"
          style={{
            background: 'linear-gradient(225deg, var(--auth-glow-violet), var(--auth-glow-blue))',
            animationDelay: '-4s',
          }}
        />
        <div
          className="absolute -bottom-20 left-1/3 h-[450px] w-[450px] rounded-full opacity-35 blur-[90px] animate-aurora-shift will-change-transform"
          style={{
            background: 'linear-gradient(45deg, var(--auth-glow-em), var(--auth-glow-blue))',
            animationDelay: '-8s',
          }}
        />
      </div>

      {/* Layer 3: Floating orbs */}
      <div className="absolute inset-0">
        <div
          className="absolute left-[15%] top-[20%] h-3 w-3 rounded-full bg-primary-500/30 animate-float-orb"
          style={{ animationDelay: '0s' }}
        />
        <div
          className="absolute left-[70%] top-[15%] h-2 w-2 rounded-full bg-smk-emerald-bright/25 animate-float-orb"
          style={{ animationDelay: '-2s' }}
        />
        <div
          className="absolute left-[40%] top-[65%] h-4 w-4 rounded-full bg-primary-500/20 animate-float-orb"
          style={{ animationDelay: '-4s' }}
        />
        <div
          className="absolute left-[85%] top-[55%] h-2.5 w-2.5 rounded-full bg-smk-emerald-bright/20 animate-float-orb"
          style={{ animationDelay: '-1s' }}
        />
        <div
          className="absolute left-[25%] top-[80%] h-3.5 w-3.5 rounded-full bg-primary-500/15 animate-float-orb"
          style={{ animationDelay: '-3s' }}
        />
      </div>

      {/* Layer 4: Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(var(--auth-text) 1px, transparent 1px),
            linear-gradient(90deg, var(--auth-text) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Layer 5: Noise texture */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 'var(--auth-noise-opacity)',
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
        }}
      />
    </div>
  );
}
