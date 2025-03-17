import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { NetworkStatus } from '@common';

/**
 * Main layout component for the Hours application
 */
export const Layout: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-grow container mx-auto px-4 py-8">
        <Outlet />
      </main>
      <Footer />

      {/* Network status notification */}
      <NetworkStatus />
    </div>
  );
};
