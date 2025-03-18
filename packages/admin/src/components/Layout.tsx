import { ReactNode } from 'react';
// import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { NetworkStatus } from '@common';

interface LayoutProps {
  children: ReactNode;
}

/**
 * Main layout component for the Admin application
 */
export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4">
          {children}
        </main>

        {/* Network status notification */}
        <NetworkStatus />
      </div>
    </div>
  );
};
