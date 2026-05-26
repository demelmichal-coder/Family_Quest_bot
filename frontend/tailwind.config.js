// tailwind.config.js
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
        green: '#7be495', // pastelová zelená
        orange: '#ffb86b', // pastelová oranžová
        pink: '#ffb6b9', // pastelová růžová
        yellow: '#ffe066', // pastelová žlutá
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
