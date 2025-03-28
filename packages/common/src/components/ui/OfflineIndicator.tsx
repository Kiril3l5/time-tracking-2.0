import React, { useState, useEffect } from 'react';

interface OfflineIndicatorProps {
  /** Custom class name for styling */
  className?: string;
  /** Custom message to display when offline */
  message?: string;
  /** Position of the indicator */
  position?: 'top' | 'bottom';
  /** Variant of the indicator */
  variant?: 'warning' | 'error' | 'info';
}

/**
 * Offline status indicator component
 * 
 * Displays a banner when the user is offline, with automatic detection
 * of network status changes.
 * 
 * @example
 * <OfflineIndicator 
 *   position="bottom" 
 *   variant="warning" 
 *   message="You're working offline. Changes will sync when you reconnect."
 * />
 */
export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ 
  className = '',
  message = "You're offline. Changes will sync when you reconnect.",
  position = 'bottom',
  variant = 'warning',
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Return null if online
  if (isOnline) {
    return null;
  }
  
  // Determine variant styling
  const variantStyles = {
    warning: 'bg-amber-500 text-amber-950',
    error: 'bg-red-500 text-white',
    info: 'bg-blue-500 text-white',
  }[variant];
  
  // Determine position styling
  const positionStyles = {
    top: 'top-0 pt-safe-top',
    bottom: 'bottom-0 pb-safe-bottom',
  }[position];
  
  // When at the bottom, add space for bottom navigation if present
  const bottomNavSpace = position === 'bottom' ? 'mb-16' : '';
  
  return (
    <div 
      className={`
        fixed left-0 right-0 z-50 py-2 px-4 
        text-center text-sm font-medium
        ${variantStyles} 
        ${positionStyles}
        ${bottomNavSpace}
        ${className}
      `}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-center space-x-2">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-4 w-4" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M13 10V3L4 14h7v7l9-11h-7z" 
          />
        </svg>
        <span>{message}</span>
      </div>
    </div>
  );
};

export default OfflineIndicator; 