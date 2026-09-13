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
        cosmic: {
          cream: '#FFF8E7',
          DEFAULT: '#FFF8E7',
          light: '#FFFDF6',
          dark: '#F5E8C9',
        },
        celestial: {
          DEFAULT: '#8CC1E9',
          light: '#bce0f8',
          dark: '#6aa8d6',
        },
        cerulean: {
          DEFAULT: '#438BC4',
          light: '#62a5dc',
          dark: '#3071a3',
        },
        cobalt: {
          DEFAULT: '#0055A0',
          light: '#0a6fc7',
          dark: '#00407a',
        },
        navy: {
          DEFAULT: '#12284B',
          light: '#1c3d70',
          dark: '#0c1a32',
        },
        carbon: {
          950: '#07080a',
          900: '#090a0d',
          850: '#0e1117',
          800: '#12151c',
          750: '#161922',
          700: '#1d222e',
          border: 'rgba(140, 193, 233, 0.16)',
          borderActive: 'rgba(140, 193, 233, 0.5)'
        }
      },
      fontFamily: {
        sans: ['Google Sans', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
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
