/**
 * Mobile Browser Compatibility Fixes
 * 
 * This file contains utility functions and constants to handle
 * mobile browser-specific issues, particularly iOS Safari.
 */

/**
 * Detects if the current device is running iOS
 * @returns boolean indicating if current device is iOS
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Detects if the current browser is Safari
 * @returns boolean indicating if current browser is Safari
 */
export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

/**
 * Adds CSS classes to fix iOS Safari-specific issues
 * This should be called once when the app initializes
 */
export function applyIOSSafariFixes(): void {
  if (!isIOS() || !isSafari()) return;
  
  // Fix for 100vh issues in iOS Safari
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
  
  // Update on resize
  window.addEventListener('resize', () => {
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
  });
  
  // Apply iOS-specific body class
  document.body.classList.add('ios-safari');
}

/**
 * Fixes the virtual keyboard pushing fixed position elements up
 * Call this before focusing an input
 * @param inputElement The input element being focused
 */
export function fixIOSKeyboardIssues(inputElement: HTMLElement): void {
  if (!isIOS()) return;
  
  // Wait for keyboard to appear
  setTimeout(() => {
    // Scroll the element into view
    inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // If near bottom of screen, add padding to prevent cut-off
    const rect = inputElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    if (rect.bottom > viewportHeight - 150) {
      document.body.style.paddingBottom = '150px';
    }
  }, 300);
}

/**
 * Removes keyboard-related fixes when input is blurred
 */
export function removeIOSKeyboardFixes(): void {
  if (!isIOS()) return;
  
  // Remove any extra padding we added
  document.body.style.paddingBottom = '';
}

/**
 * CSS Variables for use with iOS fixes
 * Add these to your global CSS
 */
export const iOSCSSFixes = `
  /* Fix for 100vh issues in iOS Safari */
  .h-screen-ios {
    height: 100vh; /* Fallback */
    height: calc(var(--vh, 1vh) * 100);
  }

  /* Fix for position:fixed elements when keyboard is active */
  .ios-safari .ios-fixed-footer {
    position: sticky;
    bottom: 0;
    z-index: 40;
  }

  /* Fix for overscroll on iOS */
  .ios-safari .overflow-scroll-ios {
    -webkit-overflow-scrolling: touch;
  }
`;

export default {
  isIOS,
  isSafari,
  applyIOSSafariFixes,
  fixIOSKeyboardIssues,
  removeIOSKeyboardFixes,
}; 