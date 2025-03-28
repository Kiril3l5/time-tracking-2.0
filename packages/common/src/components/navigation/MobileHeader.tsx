import React, { ReactNode } from 'react';

interface MobileHeaderProps {
  /** Title text to display in the header */
  title: string;
  /** Optional left action (like back button) */
  leftAction?: ReactNode;
  /** Optional right action (like settings, filter, etc.) */
  rightAction?: ReactNode;
  /** Whether to add a shadow to the header */
  withShadow?: boolean;
  /** Whether to add a border to the header */
  withBorder?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Mobile-optimized header component
 * 
 * Provides a consistent header for mobile views with
 * customizable title and action buttons.
 */
const MobileHeader: React.FC<MobileHeaderProps> = ({
  title,
  leftAction,
  rightAction,
  withShadow = true,
  withBorder = true,
  className = '',
}) => {
  return (
    <header
      className={`
        sticky top-0 z-10 bg-white dark:bg-gray-900 pt-safe 
        ${withShadow ? 'shadow-sm' : ''}
        ${withBorder ? 'border-b border-gray-200 dark:border-gray-800' : ''}
        ${className}
      `}
    >
      <div className="flex items-center justify-between h-14 px-4">
        <div className="w-12">
          {leftAction}
        </div>
        
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
          {title}
        </h1>
        
        <div className="w-12 flex justify-end">
          {rightAction}
        </div>
      </div>
    </header>
  );
};

export default MobileHeader; 