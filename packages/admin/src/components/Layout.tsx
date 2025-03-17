import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { NetworkStatus } from '@common';

/**
 * Main layout component for the Admin application
 */
export const Layout: React.FC = () => {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>

        {/* Network status notification */}
        <NetworkStatus />
      </div>
    </div>
  );
};
