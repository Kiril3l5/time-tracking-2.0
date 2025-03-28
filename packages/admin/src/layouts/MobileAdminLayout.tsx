/**
 * MobileAdminLayout
 * 
 * A mobile-optimized layout for the admin portal that provides
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
// import { DashboardIcon, ApprovalIcon, UserIcon, SettingsIcon } from '@common/components/ui/icons';

// For now, using relative imports for demonstration
import MobileContainer from '../../../common/src/components/ui/containers/MobileContainer';
import BottomNav from '../../../common/src/components/navigation/BottomNav'; 
import { 
  DashboardIcon, 
  ApprovalIcon, 
  UserIcon, 
  SettingsIcon 
} from '../../../common/src/components/ui/icons';

interface MobileAdminLayoutProps {
  /** Main content to display */
  children: ReactNode;
  /** Current active nav item */
  activeRoute?: string;
}

/**
 * Mobile-optimized layout for admin portal
 * 
 * Provides a consistent layout with bottom navigation
 * for admin-specific screens.
 */
const MobileAdminLayout: React.FC<MobileAdminLayoutProps> = ({
  children,
  activeRoute,
}) => {
  const navItems = [
    {
      label: 'Dashboard',
      path: '/dashboard',
      icon: <DashboardIcon />,
      isActive: activeRoute === '/dashboard',
    },
    {
      label: 'Approvals',
      path: '/approvals',
      icon: <ApprovalIcon />,
      isActive: activeRoute === '/approvals',
    },
    {
      label: 'Users',
      path: '/users',
      icon: <UserIcon />,
      isActive: activeRoute === '/users',
    },
    {
      label: 'Settings',
      path: '/settings',
      icon: <SettingsIcon />,
      isActive: activeRoute === '/settings',
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

export default MobileAdminLayout; 