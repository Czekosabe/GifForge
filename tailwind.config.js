/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0a0a0c',
          1: '#121216',
          2: '#191a1f',
          3: '#212228',
          4: '#2a2b32',
          border: '#33343c',
        },
        accent: {
          DEFAULT: '#5b8cff',
          hover: '#79a1ff',
          muted: '#2c3a5f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
}
