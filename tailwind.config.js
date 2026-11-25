/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#0b0f17',
        panel: '#121826',
        amberjeb: '#f59e0b',
      },
    },
  },
  plugins: [],
};
