/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      /**
       * Mobile-first safe area utilities
       * These provide padding that respects the safe areas on iOS devices
       */
      padding: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-right': 'env(safe-area-inset-right)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe': 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      },
      margin: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-right': 'env(safe-area-inset-right)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
      },
      height: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-bottom))',
      },
      minHeight: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-bottom))',
        'touch': '44px', // Minimum touch target height
      },
      // Mobile-first touch target sizes
      minWidth: {
        'touch': '44px', // Minimum touch target width
      },
    },
  },
  plugins: [
    // Add custom plugin for screen reader utilities
    function({ addUtilities }) {
      const newUtilities = {
        // Bottom navigation safe area utilities
        '.pb-safe-bottom': {
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
        '.mb-safe-bottom': {
          marginBottom: 'env(safe-area-inset-bottom)',
        },
        // Top (notch) safe area utilities
        '.pt-safe-top': {
          paddingTop: 'env(safe-area-inset-top)',
        },
        '.mt-safe-top': {
          marginTop: 'env(safe-area-inset-top)',
        },
        // Full safe area padding
        '.p-safe': {
          padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        },
        // Mobile-specific utilities for better touch interactions
        '.touch-manipulation': {
          touchAction: 'manipulation',
        },
        '.no-tap-highlight': {
          WebkitTapHighlightColor: 'transparent',
        },
      };
      
      addUtilities(newUtilities, ['responsive']);
    },
  ],
}; 