import { useState, useEffect } from 'react';

// Breakpoint definitions (matching Tailwind defaults)
export const breakpoints = {
  sm: 640,   // Small devices (e.g. phones)
  md: 768,   // Medium devices (e.g. tablets)
  lg: 1024,  // Large devices (e.g. laptops)
  xl: 1280,  // Extra large devices (e.g. desktops)
  '2xl': 1536, // 2X large devices (e.g. large desktops)
};

export interface ViewportState {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isSmall: boolean;  // < sm
  isMedium: boolean; // >= sm && < md
  isLarge: boolean;  // >= md && < lg
  isXLarge: boolean; // >= lg && < xl
  is2XLarge: boolean; // >= xl && < 2xl
  is3XLarge: boolean; // >= 2xl
}

/**
 * Hook that provides viewport size information and device type detection
 * 
 * @returns ViewportState with width, height, and device type flags
 */
export const useViewport = (): ViewportState => {
  // Default to reasonable values for SSR
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [height, setHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 768);

  useEffect(() => {
    // Skip if not in browser
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };

    // Add resize event listener
    window.addEventListener('resize', handleResize);
    
    // Call once to initialize correctly
    handleResize();

    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Compute device type indicators
  return {
    width,
    height,
    // Device type flags
    isMobile: width < breakpoints.md,  // Mobile: < 768px
    isTablet: width >= breakpoints.md && width < breakpoints.lg, // Tablet: 768-1023px
    isDesktop: width >= breakpoints.lg, // Desktop: >= 1024px
    
    // Specific breakpoint flags
    isSmall: width < breakpoints.sm, // < 640px
    isMedium: width >= breakpoints.sm && width < breakpoints.md, // 640-767px
    isLarge: width >= breakpoints.md && width < breakpoints.lg, // 768-1023px
    isXLarge: width >= breakpoints.lg && width < breakpoints.xl, // 1024-1279px
    is2XLarge: width >= breakpoints.xl && width < breakpoints['2xl'], // 1280-1535px
    is3XLarge: width >= breakpoints['2xl'], // >= 1536px
  };
};

export default useViewport; 