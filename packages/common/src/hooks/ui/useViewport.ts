/**
 * useViewport hook
 * 
 * A hook that provides viewport information and responsive breakpoint helpers.
 * Use this for conditional rendering based on screen size.
 */
import { useState, useEffect } from 'react';

/**
 * Viewport breakpoints for responsive design
 */
export const BREAKPOINTS = {
  xs: 0,
  sm: 640, // Small devices (phones)
  md: 768, // Medium devices (tablets)
  lg: 1024, // Large devices (desktops)
  xl: 1280, // Extra large devices (large desktops)
  xxl: 1536, // Extra extra large devices
};

/**
 * Interface for the viewport hook return values
 */
interface ViewportValues {
  /** Current viewport width in pixels */
  width: number;
  /** Current viewport height in pixels */
  height: number;
  /** Whether the viewport is currently mobile-sized (< md breakpoint) */
  isMobile: boolean;
  /** Whether the viewport is currently tablet-sized (md-lg breakpoint) */
  isTablet: boolean;
  /** Whether the viewport is currently desktop-sized (>= lg breakpoint) */
  isDesktop: boolean;
  /** Whether the viewport is extrasmall (< sm breakpoint) */
  isXs: boolean;
  /** Whether the viewport is small (sm-md breakpoint) */
  isSm: boolean;
  /** Whether the viewport is medium (md-lg breakpoint) */
  isMd: boolean;
  /** Whether the viewport is large (lg-xl breakpoint) */
  isLg: boolean;
  /** Whether the viewport is extra large (xl-xxl breakpoint) */
  isXl: boolean;
  /** Whether the viewport is extra extra large (>= xxl breakpoint) */
  isXxl: boolean;
}

/**
 * Hook for responsive design based on viewport size
 * 
 * This hook provides viewport dimensions and breakpoint checks
 * to build responsive components that adapt to different screen sizes.
 * 
 * @returns Viewport dimensions and breakpoint flags
 * 
 * @example
 * ```tsx
 * const { isMobile, isDesktop } = useViewport();
 * 
 * return (
 *   <div>
 *     {isMobile ? (
 *       <MobileComponent />
 *     ) : (
 *       <DesktopComponent />
 *     )}
 *   </div>
 * );
 * ```
 */
export const useViewport = (): ViewportValues => {
  // Get initial dimensions (defaulting to common mobile size if on server)
  const initialWidth = typeof window !== 'undefined' ? window.innerWidth : 375;
  const initialHeight = typeof window !== 'undefined' ? window.innerHeight : 667;

  const [width, setWidth] = useState<number>(initialWidth);
  const [height, setHeight] = useState<number>(initialHeight);
  
  useEffect(() => {
    // Skip if running on server
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };
    
    // Set initial values
    handleResize();
    
    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Compute breakpoint flags
  return {
    width,
    height,
    isMobile: width < BREAKPOINTS.md,
    isTablet: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isDesktop: width >= BREAKPOINTS.lg,
    isXs: width < BREAKPOINTS.sm,
    isSm: width >= BREAKPOINTS.sm && width < BREAKPOINTS.md,
    isMd: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isLg: width >= BREAKPOINTS.lg && width < BREAKPOINTS.xl,
    isXl: width >= BREAKPOINTS.xl && width < BREAKPOINTS.xxl,
    isXxl: width >= BREAKPOINTS.xxl,
  };
};

export default useViewport; 