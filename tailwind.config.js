/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vanilla: {
          50:  '#FFFDF7',
          100: '#FFF8E7',
          200: '#FFF1CC',
          300: '#FFE8A8',
          400: '#FFDA80',
          500: '#F5C842',
          600: '#D4A017',
        },
        cream: {
          50:  '#FEFCF3',
          100: '#FDF8E1',
          200: '#FAF0C0',
          300: '#F5E49A',
        },
        stone: {
          warm: '#8B7355',
        }
      },
      fontFamily: {
        sans: ['Mona Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
