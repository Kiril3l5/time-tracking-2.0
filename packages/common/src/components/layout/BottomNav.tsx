/**
 * BottomNav Component
 * 
 * A mobile-friendly bottom navigation bar that sticks to the bottom of the screen
 * and provides touch-friendly navigation controls.
 */
import React from 'react';
import { Link } from 'react-router-dom';

export interface NavItem {
  /** Navigation label */
  label: string;
  /** URL to navigate to */
  to: string;
  /** Icon element */
  icon: React.ReactNode;
  /** Whether the item is currently active */
  active?: boolean;
}

interface BottomNavProps {
  /** Navigation items to display */
  items: NavItem[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Mobile bottom navigation component that provides a touch-friendly
 * navigation bar at the bottom of the screen.
 * 
 * @example
 * ```tsx
 * <BottomNav
 *   items={[
 *     { label: 'Home', to: '/', icon: <HomeIcon />, active: true },
 *     { label: 'Time', to: '/time', icon: <ClockIcon /> },
 *     { label: 'Profile', to: '/profile', icon: <UserIcon /> },
 *   ]}
 * />
 * ```
 */
export const BottomNav: React.FC<BottomNavProps> = ({
  items,
  className = '',
}) => {
  const containerClasses = [
    // Base styles
    'fixed bottom-0 left-0 right-0',
    'pb-safe-bottom', // iOS safe area
    'bg-white',
    'border-t border-gray-200',
    'flex items-center justify-around',
    'h-16', // Touch-friendly height
    'z-50', // Stay above other content
    'shadow-lg shadow-gray-900/5',
    // Custom classes
    className,
  ].filter(Boolean).join(' ');

  return (
    <nav className={containerClasses}>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={`
            flex flex-col items-center justify-center
            py-1 px-3
            min-w-[72px]
            h-full
            text-xs
            transition-colors
            ${item.active 
              ? 'text-primary-600 font-medium' 
              : 'text-gray-500 hover:text-gray-700'
            }
          `}
        >
          <div className="h-6 w-6 mb-1">
            {item.icon}
          </div>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
};

export default BottomNav; 