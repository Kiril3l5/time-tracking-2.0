/**
 * MobileHoursLayout
 * 
 * A mobile-optimized layout for the hours portal that provides
 * a consistent structure with bottom navigation and mobile container.
 * 
 * NOTE: For these imports to work correctly, make sure tsconfig.json includes the path alias:
 * "paths": {
 *   "@common/*": ["../common/src/*"]
 * }
 */
import React, { ReactNode } from 'react';
// In a real implementation you would use path aliases:
// import MobileContainer from '@common/components/ui/containers/MobileContainer';
// import BottomNav from '@common/components/navigation/BottomNav';
// import { HomeIcon, ClockIcon, HistoryIcon, ReportsIcon } from '@common/components/ui/icons';

// For now, using relative imports for demonstration
import MobileContainer from '../../../common/src/components/ui/containers/MobileContainer';
import BottomNav from '../../../common/src/components/navigation/BottomNav'; 
import { 
  HomeIcon, 
  ClockIcon, 
  HistoryIcon, 
  ReportsIcon 
} from '../../../common/src/components/ui/icons';

interface MobileHoursLayoutProps {
  /** Main content to display */
  children: ReactNode;
  /** Current active nav item */
  activeRoute?: string;
}

/**
 * Mobile-optimized layout for hours portal
 * 
 * Provides a consistent layout with bottom navigation
 * for time tracking screens.
 */
const MobileHoursLayout: React.FC<MobileHoursLayoutProps> = ({
  children,
  activeRoute,
}) => {
  const navItems = [
    {
      label: 'Home',
      path: '/dashboard',
      icon: <HomeIcon />,
      isActive: activeRoute === '/dashboard',
    },
    {
      label: 'Time Entry',
      path: '/time-entry',
      icon: <ClockIcon />,
      isActive: activeRoute === '/time-entry',
    },
    {
      label: 'History',
      path: '/history',
      icon: <HistoryIcon />,
      isActive: activeRoute === '/history',
    },
    {
      label: 'Reports',
      path: '/reports',
      icon: <ReportsIcon />,
      isActive: activeRoute === '/reports',
    },
  ];

  return (
    <div className="bg-gray-50 dark:bg-gray-950 min-h-screen">
      {/* Main content area */}
      <MobileContainer>
        {children}
      </MobileContainer>
      
      {/* Bottom navigation */}
      <BottomNav items={navItems} />
      
      {/* Add space at bottom to account for bottom nav */}
      <div className="h-14 pb-safe"></div>
    </div>
  );
};

export default MobileHoursLayout; 