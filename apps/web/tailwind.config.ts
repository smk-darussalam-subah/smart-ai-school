import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1d4ed8', // primary-600 — used by bg-primary, text-primary
          foreground: '#ffffff', // used by text-primary-foreground
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#1d4ed8',
          700: '#1e40af',
          900: '#1e3a8a',
        },
        smk: {
          blue: '#1d4ed8',
          green: '#16a34a',
          // Landing page palette
          'emerald-deep': '#064534',
          emerald: '#0b6b4f',
          'emerald-bright': '#10b981',
          lime: '#c5f04a',
          sand: '#f6f4ec',
          cream: '#fbfaf5',
          ink: '#0c1f17',
          'ink-soft': '#3d544a',
        },
        // Semantic tokens (mirror globals.css :root CSS vars)
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        // Auth experience tokens
        auth: {
          surface: 'rgba(255,255,255,0.06)',
          glass: 'rgba(255,255,255,0.08)',
          glow: 'rgba(59,130,246,0.15)',
          'glow-em': 'rgba(16,185,129,0.12)',
        },
      },
      fontFamily: {
        fraunces: ['var(--font-fraunces)', 'Georgia', 'serif'],
        jakarta: ['var(--font-jakarta)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Skala bayangan lembut emerald (2L dashboard) — additive, tidak ubah default.
        'soft-sm': '0 1px 3px rgba(6,69,52,0.07), 0 1px 2px rgba(6,69,52,0.04)',
        'soft-md': '0 6px 18px rgba(6,69,52,0.08), 0 2px 6px rgba(6,69,52,0.05)',
      },
      keyframes: {
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // Auth experience keyframes
        'aurora-shift': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.5' },
          '33%': { transform: 'translate(30px, -20px) scale(1.05)', opacity: '0.7' },
          '66%': { transform: 'translate(-20px, 15px) scale(0.95)', opacity: '0.4' },
        },
        'float-orb': {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-20px) scale(1.03)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.08)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', filter: 'brightness(1)' },
          '50%': { transform: 'scale(1.04)', filter: 'brightness(1.1)' },
        },
        'card-rotate': {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.96)' },
          '10%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '30%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '40%': { opacity: '0', transform: 'translateY(-16px) scale(0.96)' },
          '100%': { opacity: '0', transform: 'translateY(-16px) scale(0.96)' },
        },
        'particle-drift': {
          '0%': { transform: 'translateY(0) translateX(0)', opacity: '0' },
          '20%': { opacity: '0.6' },
          '80%': { opacity: '0.6' },
          '100%': { transform: 'translateY(-100px) translateX(30px)', opacity: '0' },
        },
        'dash-flow': {
          from: { strokeDashoffset: '20' },
          to: { strokeDashoffset: '0' },
        },
      },
      animation: {
        marquee: 'marquee 26s linear infinite',
        'fade-up': 'fade-up 0.5s ease forwards',
        // Auth experience animations
        'aurora-shift': 'aurora-shift 12s ease-in-out infinite',
        'float-orb': 'float-orb 6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        breathe: 'breathe 4s ease-in-out infinite',
        'card-rotate': 'card-rotate 20s ease-in-out infinite',
        'particle-drift': 'particle-drift 8s ease-in-out infinite',
        'dash-flow': 'dash-flow 1s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
