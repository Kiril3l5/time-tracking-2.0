/**
 * MobileContainer Component
 * 
 * A base container component for mobile layouts with proper safe area insets
 * and standard spacing. Use this as the wrapper for mobile-optimized pages.
 */
import React from 'react';

interface MobileContainerProps {
  /** Container content */
  children: React.ReactNode;
  /** Whether to add padding for iOS safe areas */
  useSafeAreas?: boolean;
  /** Whether to apply max width constraint */
  constrained?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Whether to add padding at the bottom for fixed navigation */
  withNavPadding?: boolean;
  /** Background color class */
  bgColor?: string;
}

/**
 * Base container for mobile views with proper safe area handling
 * 
 * @example
 * ```tsx
 * <MobileContainer>
 *   <h1>Page Content</h1>
 * </MobileContainer>
 * ```
 */
export const MobileContainer: React.FC<MobileContainerProps> = ({
  children,
  useSafeAreas = true,
  constrained = true,
  withNavPadding = true,
  bgColor = 'bg-white',
  className = '',
}) => {
  const baseClasses = [
    'min-h-screen',
    // For iOS Safari height fix
    'min-h-[100dvh]',
    'w-full',
    bgColor,
  ];
  
  const safeAreaClasses = useSafeAreas
    ? [
        'pt-safe-top',
        'pb-safe-bottom',
        'px-safe-left',
        'px-safe-right',
      ]
    : [];
    
  const constrainedClasses = constrained
    ? 'max-w-lg mx-auto'
    : '';
    
  const paddingClasses = [
    'px-4',
    withNavPadding ? 'pb-20' : '', // Adds padding for bottom navigation
  ];
  
  const combinedClasses = [
    ...baseClasses,
    ...safeAreaClasses,
    constrainedClasses,
    ...paddingClasses,
    className,
  ].filter(Boolean).join(' ');
  
  return (
    <div className={combinedClasses}>
      {children}
    </div>
  );
};

export default MobileContainer; 