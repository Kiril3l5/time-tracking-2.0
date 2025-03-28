import React, { ReactNode } from 'react';

interface MobileContainerProps {
  /** Main content for the container */
  children: ReactNode;
  /** Additional CSS classes for the container */
  className?: string;
  /** Whether to use full height of viewport */
  fullHeight?: boolean;
  /** Whether container should have padding */
  padded?: boolean;
  /** Whether the container should have max width */
  maxWidth?: boolean;
  /** Whether to apply safe-area insets for mobile devices */
  useSafeArea?: boolean;
}

/**
 * A container component optimized for mobile layouts
 * 
 * Provides consistent padding, width constraints, and safe areas
 * for mobile-first UI.
 */
const MobileContainer: React.FC<MobileContainerProps> = ({
  children,
  className = '',
  fullHeight = true,
  padded = true,
  maxWidth = true,
  useSafeArea = true,
}) => {
  return (
    <div
      className={`
        ${fullHeight ? 'min-h-[calc(100vh-56px)]' : ''}
        ${padded ? 'px-4' : ''}
        ${maxWidth ? 'max-w-md mx-auto w-full' : ''}
        ${useSafeArea ? 'pb-safe pt-safe px-safe' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

export default MobileContainer; 