   /** @type {import('tailwindcss').Config} */
   module.exports = {
    content: [
      "./packages/*/src/**/*.{js,jsx,ts,tsx}",
      "./packages/*/index.html",
    ],
    theme: {
      extend: {
        colors: {
          primary: {
            DEFAULT: '#ff8d00',
            dark: '#e57e00',
            light: '#ffa333',
          },
        },
        fontFamily: {
          sans: ['"Roboto Condensed"', 'sans-serif'],
        },
      },
    },
    plugins: [require('@tailwindcss/forms')],
  };