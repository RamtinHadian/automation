/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cherry: {
          DEFAULT: '#6E1B1B',
          50: '#FAF2F2',
          100: '#F5E4E4',
          200: '#EBCDC7',
          300: '#DB9E96',
          400: '#C26557',
          500: '#A13727',
          600: '#872517',
          700: '#6E1B1B', // DEEP CHERRY
          800: '#581717',
          900: '#3D0E0E',
          950: '#260808',
        },
        tomato: {
          DEFAULT: '#D34A32',
          50: '#FDF5F3',
          100: '#FBE9E5',
          200: '#F6D5CE',
          300: '#EEB1A4',
          400: '#E48371',
          500: '#D34A32', // TOMATO RED
          600: '#B83A24',
          700: '#992E1B',
          800: '#7D2719',
          900: '#672418',
        },
        clay: {
          DEFAULT: '#C98B6A',
          50: '#FAF6F3',
          100: '#F5ECE6',
          200: '#EBDBCE',
          300: '#DDC2B0',
          400: '#C98B6A', // SOFT CLAY
          500: '#B8724D',
          600: '#9E5B3A',
          700: '#7E462D',
          800: '#673926',
          900: '#543021',
        },
        cream: {
          DEFAULT: '#F6D9CD',
          50: '#FDFBF9',
          100: '#FAF5F1',
          200: '#F6D9CD', // BLUSH CREAM
          300: '#EEBFAC',
          400: '#E49F87',
          500: '#D47E64',
          600: '#BD5F45',
        },
        cocoa: {
          DEFAULT: '#3A241F',
          50: '#F5F3F2',
          100: '#EAE5E3',
          200: '#D7CBCE',
          300: '#B8A39C',
          400: '#8C6F66',
          500: '#664C44',
          600: '#503730',
          700: '#422C26',
          800: '#3A241F', // COCOA LINE
          900: '#2E1A16',
          950: '#1F0F0C',
        },
        palette: {
          cherry: '#6E1B1B',
          tomato: '#D34A32',
          clay: '#C98B6A',
          cream: '#F6D9CD',
          cocoa: '#3A241F',
        },
      },
      fontFamily: {
        sans: ['Vazirmatn', '"Plus Jakarta Sans"', 'Inter', 'Tahoma', 'system-ui', 'sans-serif'],
        // Numbers, times, IDs and addresses that used a monospace font now use Vazirmatn too, so Persian digits look the same everywhere.
        mono: ['Vazirmatn', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      }
    },
  },
  plugins: [],
}
