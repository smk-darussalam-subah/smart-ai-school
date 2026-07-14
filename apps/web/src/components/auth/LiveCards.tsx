'use client';

/**
 * LiveCards — Rotating feature showcase cards.
 *
 * Auto-rotates through AI Teacher, Student Analytics, Finance, Industry, Executive cards.
 * CSS-only animation loop with smooth fade/slide transitions.
 */
import { useState, useEffect } from 'react';
import {
  GraduationCap,
  BarChart3,
  Wallet,
  Factory,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CardDef {
  icon: LucideIcon;
  title: string;
  metric: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  accentColor: string;
}

const CARDS: CardDef[] = [
  {
    icon: GraduationCap,
    title: 'AI Teacher',
    metric: '12',
    subtitle: "Today's Classes",
    badge: 'AI Ready',
    badgeColor: 'bg-emerald-500/15 text-emerald-400',
    accentColor: 'from-emerald-500/20 to-emerald-600/5',
  },
  {
    icon: BarChart3,
    title: 'Student Analytics',
    metric: '97%',
    subtitle: 'Attendance Rate',
    badge: 'Live',
    badgeColor: 'bg-blue-500/15 text-blue-400',
    accentColor: 'from-blue-500/20 to-blue-600/5',
  },
  {
    icon: Wallet,
    title: 'Finance',
    metric: 'Rp 12.4M',
    subtitle: "Today's Income",
    badge: 'Updated',
    badgeColor: 'bg-amber-500/15 text-amber-400',
    accentColor: 'from-amber-500/20 to-amber-600/5',
  },
  {
    icon: Factory,
    title: 'Industry',
    metric: '7',
    subtitle: 'Active Partners',
    badge: '23 Interns',
    badgeColor: 'bg-violet-500/15 text-violet-400',
    accentColor: 'from-violet-500/20 to-violet-600/5',
  },
  {
    icon: Building2,
    title: 'Executive',
    metric: '84%',
    subtitle: 'School KPI',
    badge: 'Realtime',
    badgeColor: 'bg-emerald-500/15 text-emerald-400',
    accentColor: 'from-emerald-500/20 to-emerald-600/5',
  },
];

export function LiveCards({ className }: { className?: string }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % CARDS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={cn('relative', className)} aria-live="polite" aria-label="Feature showcase">
      {/* Active card */}
      <div className="relative h-[120px] w-full max-w-[280px]">
        {CARDS.map((card, i) => {
          const Icon = card.icon;
          const isActive = i === activeIndex;
          return (
            <div
              key={card.title}
              className={cn(
                'glass-card absolute inset-0 flex items-center gap-4 p-4 transition-all duration-500',
                isActive
                  ? 'translate-y-0 scale-100 opacity-100'
                  : 'pointer-events-none translate-y-4 scale-95 opacity-0',
              )}
              aria-hidden={!isActive}
            >
              {/* Icon container */}
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br',
                  card.accentColor,
                )}
              >
                <Icon className="h-6 w-6 text-[var(--auth-text)]" strokeWidth={1.5} />
              </div>

              {/* Content */}
              <div className="flex flex-col">
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--auth-dim)]">
                  {card.title}
                </span>
                <span className="text-xl font-bold text-[var(--auth-text)]">{card.metric}</span>
                <span className="text-[11px] text-[var(--auth-muted)]">{card.subtitle}</span>
              </div>

              {/* Badge */}
              <span
                className={cn(
                  'ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium',
                  card.badgeColor,
                )}
              >
                {card.badge}
              </span>
            </div>
          );
        })}
      </div>

      {/* Dot indicators */}
      <div className="mt-3 flex justify-center gap-1.5">
        {CARDS.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveIndex(i)}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              i === activeIndex
                ? 'w-4 bg-primary-500'
                : 'w-1.5 bg-[var(--auth-border2)] hover:bg-[var(--auth-muted)]',
            )}
            aria-label={`Show card ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
