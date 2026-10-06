/** @type {import('tailwindcss').Config} */
import formsPlugin from '@tailwindcss/forms';
import containerQueriesPlugin from '@tailwindcss/container-queries';

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cosmic: { DEFAULT: 'var(--color-cosmic-cream)' },
        celestial: { DEFAULT: 'var(--color-celestial)' },
        cerulean: { DEFAULT: 'var(--color-cerulean)' },
        cobalt: { DEFAULT: 'var(--color-cobalt)' },
        navy: { DEFAULT: 'var(--color-navy)' },
        signal: { cyan: 'var(--color-signal-cyan)' },
        tier2: { amber: 'var(--color-tier2-amber)' },
        error: { red: 'var(--color-error-red)' },
        carbon: {
          950: 'var(--color-carbon-950)',
          900: 'var(--color-carbon-900)',
          850: 'var(--color-carbon-850)',
          800: 'var(--color-carbon-800)',
        }
      },
      fontFamily: {
        sans: ['JetBrains Mono', 'monospace'],
        mono: ['JetBrains Mono', 'monospace'],
        pixel: ['Silkscreen', 'monospace'],
      },
      animation: {
        'shimmer': 'shimmer 3.5s infinite linear',
        'gemini-pulse': 'geminiPulse 2.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float-subtle': 'floatSubtle 4s ease-in-out infinite',
        'flash-success': 'flashSuccess 1.5s ease-out forwards',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        geminiPulse: {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.95', transform: 'scale(1.12)' },
        },
        floatSubtle: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        flashSuccess: {
          '0%': { boxShadow: '0 0 0 0 rgba(140, 193, 233, 0.85)', borderColor: 'rgba(255, 248, 231, 1)' },
          '60%': { boxShadow: '0 0 35px 8px rgba(67, 139, 196, 0.5)', borderColor: 'rgba(140, 193, 233, 0.95)' },
          '100%': { boxShadow: '0 0 0 0 rgba(140, 193, 233, 0)', borderColor: 'rgba(140, 193, 233, 0.35)' },
        },
      }
    },
  },
  plugins: [
    formsPlugin,
    containerQueriesPlugin
  ],
}
