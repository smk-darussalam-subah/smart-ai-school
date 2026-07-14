'use client';

/**
 * AuthShell — Client-side orchestrator for the auth landing experience.
 *
 * Responsibilities:
 * - Dark/light mode toggle (auto-detect system, manual override, localStorage persistence)
 * - Responsive layout composition
 * - Compose all auth sub-components
 *
 * Layout:
 * - Desktop (≥1024px): 60/40 split — left: branding + AI network + live cards, right: glass login card
 * - Tablet (768–1023px): stacked — hero above login
 * - Mobile (<768px): logo, login card, swipeable live cards below
 */
import { useEffect, useState, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuroraBackground } from '@/components/auth/AuroraBackground';
import { AiNetwork } from '@/components/auth/AiNetwork';
import { GlassLoginCard } from '@/components/auth/GlassLoginCard';
import { LiveCards } from '@/components/auth/LiveCards';
import { SystemStatus } from '@/components/auth/SystemStatus';
import { AuthBranding } from '@/components/auth/AuthBranding';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'diis-auth-theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function AuthShell() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Initialize theme after mount (avoid hydration mismatch)
  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
    // Track desktop breakpoint for single LiveCards render
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    function handleChange(e: MediaQueryListEvent) { setIsDesktop(e.matches); }
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    function handleChange(e: MediaQueryListEvent) {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setTheme(e.matches ? 'light' : 'dark');
      }
    }
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <div
      data-auth-theme={theme}
      className={cn(
        'relative flex min-h-screen w-full',
        'bg-[var(--auth-bg)] text-[var(--auth-text)]',
        'transition-colors duration-300',
      )}
    >
      {/* Background layers */}
      <AuroraBackground />

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className={cn(
          'fixed right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full',
          'border border-[var(--auth-border)] bg-[var(--auth-surface)] backdrop-blur-md',
          'text-[var(--auth-muted)] transition-all duration-200',
          'hover:bg-[var(--auth-surface2)] hover:text-[var(--auth-text)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          !mounted && 'opacity-0',
        )}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      {/* Main content */}
      <div className="relative z-10 flex w-full flex-col lg:flex-row">
        {/* ── Left panel: Branding + AI Network + Live Cards ─────────── */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-12 lg:py-0">
          {/* Branding */}
          <AuthBranding className="mb-8 lg:mb-10" />

          {/* AI Network visualization */}
          <div className="mb-8 h-[240px] w-full max-w-[360px] lg:h-[300px] lg:max-w-[420px]">
            <AiNetwork />
          </div>

          {/* Live Cards — desktop only, rendered in left panel */}
          {isDesktop && <LiveCards />}
        </div>

        {/* ── Right panel: Login Card ────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center px-6 pb-12 lg:w-[420px] lg:shrink-0 lg:px-8 lg:pb-0">
          <GlassLoginCard />

          {/* System Status */}
          <div className="mt-4">
            <SystemStatus />
          </div>

          {/* Live Cards — mobile/tablet only, rendered below login */}
          {!isDesktop && <LiveCards className="mt-8" />}
        </div>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-3 left-0 right-0 z-10 text-center">
        <p className="text-[11px] text-[var(--auth-dim)]">
          &copy; {new Date().getFullYear()} SMK Darussalam Subah &middot; DIIS v1.0
        </p>
      </footer>
    </div>
  );
}
