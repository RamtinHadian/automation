/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        goodle: {
          blue: '#1967D2',
          darkBlue: '#1557B0',
          lightBlue: '#E8F0FE',
          activeBg: '#1A73E8',
          sidebarBg: '#185abc',
          cardBlue: '#1a73e8',
          textDark: '#202124',
          textMuted: '#5f6368',
          borderSubtle: '#dadce0',
        },
      },
      fontFamily: {
        sans: ['Vazirmatn', '"Plus Jakarta Sans"', 'Inter', 'Tahoma', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      }
    },
  },
  plugins: [],
}
