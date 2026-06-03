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
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
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
      },
      fontFamily: {
        fraunces: ['var(--font-fraunces)', 'Georgia', 'serif'],
        jakarta: ['var(--font-jakarta)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
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
      },
      animation: {
        marquee: 'marquee 26s linear infinite',
        'fade-up': 'fade-up 0.5s ease forwards',
      },
    },
  },
  plugins: [],
};

export default config;
