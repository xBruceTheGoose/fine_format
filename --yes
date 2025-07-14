/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#00FF41',
          light: '#39FF6B',
          dark: '#00CC33',
        },
        secondary: '#dc1aff',
        accent: '#00FFFF',
        warning: '#FFFF00',
        error: '#dc1aff',
        success: '#00FF41',
        background: '#0A0A0A',
        surface: '#1A1A1A',
        foreground: '#00FF41',
        border: '#333333',
        muted: '#666666',
      },
      fontFamily: {
        sans: ['Source Sans Pro', 'system-ui', 'sans-serif'],
        mono: ['Source Code Pro', 'monospace'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite alternate',
        'scanline': 'scanline 2s linear infinite',
        'flicker': 'flicker 0.15s infinite linear',
        'matrix-rain': 'matrix-rain 20s linear infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%': { 
            textShadow: '0 0 5px #00FF41, 0 0 10px #00FF41, 0 0 15px #00FF41',
            filter: 'brightness(1)'
          },
          '100%': { 
            textShadow: '0 0 10px #00FF41, 0 0 20px #00FF41, 0 0 30px #00FF41',
            filter: 'brightness(1.2)'
          }
        },
        'scanline': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' }
        },
        'flicker': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' }
        },
        'matrix-rain': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' }
        }
      },
      boxShadow: {
        'neon': '0 0 5px currentColor, 0 0 10px currentColor, 0 0 15px currentColor',
        'neon-lg': '0 0 10px currentColor, 0 0 20px currentColor, 0 0 30px currentColor',
        'cyber': '0 0 20px rgba(0, 255, 65, 0.5), inset 0 0 20px rgba(0, 255, 65, 0.1)',
      }
    }
  },
  plugins: [],
}