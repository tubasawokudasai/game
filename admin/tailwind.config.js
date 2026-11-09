/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        xianxia: {
          dark: '#0d1117',
          card: '#161b22',
          border: '#30363d',
          accent: '#eab308',
          gold: '#f59e0b',
          crimson: '#ef4444',
          jade: '#10b981',
          sky: '#38bdf8',
        }
      }
    },
  },
  plugins: [],
};
