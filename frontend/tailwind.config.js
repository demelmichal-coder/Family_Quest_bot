// tailwind.config.js
const palette = require('tailwindcss/colors');

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: '#6fd3f7', // pastelová modrá
        secondary: '#1e293b', // tmavě modrá
        green: { DEFAULT: '#7be495', ...palette.green }, // pastelová zelená
        orange: { DEFAULT: '#ffb86b', ...palette.orange }, // pastelová oranžová
        pink: { DEFAULT: '#ffb6b9', ...palette.pink }, // pastelová růžová
        yellow: { DEFAULT: '#ffe066', ...palette.yellow }, // pastelová žlutá
        graybg: '#f6f8fa', // světlé pozadí
      },
      fontFamily: {
        sans: ['Poppins', 'Nunito', 'ui-sans-serif', 'system-ui'],
      },
      borderRadius: {
        xl: '1.5rem',
        '2xl': '2rem',
      },
      boxShadow: {
        card: '0 4px 24px 0 rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
