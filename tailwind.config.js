/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import aspectRatio from '@tailwindcss/aspect-ratio';

export default {
  content: [
    './packages/*/src/**/*.{js,jsx,ts,tsx}',
    './packages/*/index.html',
  ],
  theme: {
    extend: {
      /* BRAND COLORS - Shared color palette for consistent branding */
      colors: {
        /* Primary brand colors - Amber */
        primary: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B', // Primary default - Amber
          600: '#D97706', // Primary dark (for hover states)
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        /* Secondary colors - Cool Gray */
        secondary: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280', // Secondary default - Main Cool Gray shade
          600: '#4B5563', // Secondary dark (was previously the main secondary color)
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
        /* Neutral colors for text, backgrounds, etc. */
        neutral: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280', // Same as secondary.500 for consistency
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
        /* Semantic status colors */
        success: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          500: '#10B981',
          700: '#047857',
        },
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B', // Same as primary for consistency
          700: '#B45309',
        },
        error: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          700: '#B91C1C',
        },
        info: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          700: '#1D4ED8',
        },
      },
      
      /* TYPOGRAPHY SYSTEM - Consistent text styling */
      fontFamily: {
        sans: ['"Roboto Condensed"', 'sans-serif'],
        display: ['"Roboto"', 'sans-serif'],
        mono: ['"Roboto Mono"', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
      },
      fontWeight: {
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      
      /* SPACING SYSTEM - Consistent spacing throughout the UI */
      spacing: {
        px: '1px',
        0: '0',
        0.5: '0.125rem',
        1: '0.25rem',
        1.5: '0.375rem',
        2: '0.5rem',
        2.5: '0.625rem',
        3: '0.75rem',
        3.5: '0.875rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        7: '1.75rem',
        8: '2rem',
        9: '2.25rem',
        10: '2.5rem',
        11: '2.75rem',
        12: '3rem',
        14: '3.5rem',
        16: '4rem',
        20: '5rem',
        24: '6rem',
        28: '7rem',
        32: '8rem',
        36: '9rem',
        40: '10rem',
        44: '11rem',
        48: '12rem',
        52: '13rem',
        56: '14rem',
        60: '15rem',
        64: '16rem',
        72: '18rem',
        80: '20rem',
        96: '24rem',
      },
      
      /* BORDER RADIUS - Consistent rounding */
      borderRadius: {
        none: '0',
        sm: '0.125rem',
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
      },
      
      /* SHADOWS - Consistent elevation system */
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        none: 'none',
      },
      
      /* TRANSITIONS - Consistent animations */
      transitionProperty: {
        'height': 'height',
        'spacing': 'margin, padding',
        'colors': 'color, background-color, border-color, text-decoration-color, fill, stroke',
        'opacity': 'opacity',
        'shadow': 'box-shadow',
        'transform': 'transform',
        'all': 'all',
      },
      transitionDuration: {
        DEFAULT: '150ms', // Our standard transition time
        75: '75ms',
        100: '100ms',
        150: '150ms',
        200: '200ms',
        300: '300ms',
        500: '500ms',
        700: '700ms',
        1000: '1000ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)', // Standard ease-in-out
        linear: 'linear',
        in: 'cubic-bezier(0.4, 0, 1, 1)',
        out: 'cubic-bezier(0, 0, 0.2, 1)',
        'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-in-material': 'cubic-bezier(0.4, 0, 0.6, 1)', // Material Design ease-in
        'ease-out-material': 'cubic-bezier(0.0, 0, 0.2, 1)', // Material Design ease-out
        'ease-in-out-material': 'cubic-bezier(0.4, 0, 0.2, 1)', // Material Design ease-in-out
        'ease-bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', // Bouncy effect for emphasis
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        'bounce-gentle': 'bounce-gentle 1s infinite',
        'fade-in': 'fade-in 150ms ease-in-out',
        'fade-out': 'fade-out 150ms ease-in-out',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.8 },
        },
        'bounce-gentle': {
          '0%, 100%': {
            transform: 'translateY(-5%)',
            animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)',
          },
          '50%': {
            transform: 'translateY(0)',
            animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
          },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'fade-out': {
          '0%': { opacity: 1 },
          '100%': { opacity: 0 },
        },
      },
      
      /* COMPONENT-SPECIFIC STYLES */
      /* These help ensure consistency between the admin and hours portals */
      
      /* Form elements */
      extend: {
        /* Custom form styles for consistent look */
        form: {
          input: {
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            borderColor: 'var(--color-neutral-300)',
            focus: {
              outline: 'none',
              borderColor: 'var(--color-primary-500)',
              ring: '2px',
              ringColor: 'var(--color-primary-100)',
            },
          },
        },
      },
    },
  },
  
  /* CUSTOM UTILITY CLASSES */
  plugins: [
    forms,
    typography,
    aspectRatio,
    
    // Add custom utilities and components 
    function({ addUtilities, addComponents }) {
      const newUtilities = {
        '.text-body': {
          fontFamily: 'var(--font-sans)',
          fontSize: '1rem',
          lineHeight: '1.5rem',
          color: 'var(--color-neutral-800)',
        },
        '.text-body-sm': {
          fontFamily: 'var(--font-sans)',
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          color: 'var(--color-neutral-800)',
        },
        '.text-caption': {
          fontFamily: 'var(--font-sans)',
          fontSize: '0.75rem',
          lineHeight: '1rem',
          color: 'var(--color-neutral-600)',
        },
        '.text-heading-1': {
          fontFamily: 'var(--font-display)',
          fontSize: '2.25rem',
          lineHeight: '2.5rem',
          fontWeight: '700',
          color: 'var(--color-neutral-900)',
        },
        '.text-heading-2': {
          fontFamily: 'var(--font-display)',
          fontSize: '1.875rem',
          lineHeight: '2.25rem',
          fontWeight: '700',
          color: 'var(--color-neutral-900)',
        },
        '.text-heading-3': {
          fontFamily: 'var(--font-display)',
          fontSize: '1.5rem',
          lineHeight: '2rem',
          fontWeight: '600',
          color: 'var(--color-neutral-900)',
        },
        '.text-heading-4': {
          fontFamily: 'var(--font-display)',
          fontSize: '1.25rem',
          lineHeight: '1.75rem',
          fontWeight: '600',
          color: 'var(--color-neutral-900)',
        },
      };
      
      const newComponents = {
        '.btn': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.5rem 1rem',
          fontWeight: '500',
          borderRadius: '0.375rem',
          transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          cursor: 'pointer',
        },
        '.btn-primary': {
          backgroundColor: 'var(--color-primary-500)',
          color: 'white',
          '&:hover': {
            backgroundColor: 'var(--color-primary-600)',
          },
          '&:focus': {
            outline: 'none',
            boxShadow: '0 0 0 3px rgba(29, 98, 246, 0.3)',
          },
        },
        '.btn-secondary': {
          backgroundColor: 'var(--color-secondary-500)',
          color: 'white',
          '&:hover': {
            backgroundColor: 'var(--color-primary-500)',
          },
          '&:focus': {
            outline: 'none',
            boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.3)',
          },
        },
        '.btn-accent': {
          backgroundColor: 'var(--color-accent-500)',
          color: 'white',
          '&:hover': {
            backgroundColor: 'var(--color-accent-600)',
          },
          '&:focus': {
            outline: 'none',
            boxShadow: '0 0 0 3px rgba(255, 141, 0, 0.3)',
          },
        },
        '.btn-outline': {
          backgroundColor: 'transparent',
          borderWidth: '1px',
          borderColor: 'var(--color-primary-500)',
          color: 'var(--color-primary-500)',
          '&:hover': {
            backgroundColor: 'var(--color-primary-50)',
          },
        },
        '.btn-ghost': {
          backgroundColor: 'transparent',
          color: 'var(--color-primary-500)',
          '&:hover': {
            backgroundColor: 'var(--color-primary-50)',
          },
        },
        '.card': {
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          padding: '1.5rem',
        },
        '.data-table': {
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: '0',
          '& th': {
            textAlign: 'left',
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--color-neutral-50)',
            fontWeight: '600',
            color: 'var(--color-neutral-700)',
            borderBottom: '1px solid var(--color-neutral-200)',
          },
          '& td': {
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--color-neutral-200)',
          },
          '& tr:hover': {
            backgroundColor: 'var(--color-neutral-50)',
          },
        },
      };
      
      addUtilities(newUtilities, ['responsive']);
      addComponents(newComponents);
    },
  ],
  
  /* USEFUL VARIANTS AND STATES */
  variants: {
    extend: {
      opacity: ['disabled'],
      backgroundColor: ['disabled', 'active'],
      textColor: ['disabled'],
      cursor: ['disabled'],
    },
  },
};