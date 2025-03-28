import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export interface NavItem {
  /** Text label for the navigation item */
  label: string;
  /** URL path for the navigation item */
  path: string;
  /** Icon component to display */
  icon: React.ReactNode;
  /** Whether this item should be highlighted */
  isActive?: boolean;
}

interface BottomNavProps {
  /** Array of navigation items to display */
  items: NavItem[];
  /** Optional callback when an item is clicked */
  onItemClick?: (item: NavItem) => void;
  /** Additional CSS classes for the container */
  className?: string;
}

/**
 * Mobile bottom navigation bar component
 * 
 * Displays a fixed navigation bar at the bottom of the screen
 * with icons and labels for primary navigation actions.
 */
const BottomNav: React.FC<BottomNavProps> = ({
  items,
  onItemClick,
  className = '',
}) => {
  const location = useLocation();
  
  // Calculate active state based on current path if not explicitly provided
  const navItems = items.map(item => ({
    ...item,
    isActive: item.isActive ?? location.pathname.startsWith(item.path),
  }));

  return (
    <nav className={`fixed bottom-0 left-0 right-0 z-10 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 h-14 px-safe pb-safe shadow-lg ${className}`}>
      <div className="grid h-full grid-flow-col auto-cols-fr max-w-md mx-auto">
        {navItems.map((item, index) => (
          <Link
            key={index}
            to={item.path}
            className={`flex flex-col items-center justify-center transition-colors ${
              item.isActive
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
            onClick={() => onItemClick?.(item)}
          >
            <div className="w-6 h-6">
              {item.icon}
            </div>
            <span className="text-xs mt-0.5 font-medium">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav; 