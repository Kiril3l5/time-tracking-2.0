/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms';

export default {
  content: [
    './packages/*/src/**/*.{js,jsx,ts,tsx}',
    './packages/*/index.html',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#4B83F1',
          DEFAULT: '#1D62F6',
          dark: '#1244B8',
        },
        secondary: {
          light: '#14B8A6',
          DEFAULT: '#0F9485',
          dark: '#0C7972',
        },
      },
      fontFamily: {
        sans: ['"Roboto Condensed"', 'sans-serif'],
      },
    },
  },
  plugins: [forms],
};