import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useViewport } from '@common/hooks/ui/useViewport';
import { Layout } from './components/Layout';

// Import the pages we created
import TimeEntryPage from './pages/TimeEntryPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Create a client
const queryClient = new QueryClient();

// Simple auth check - will be replaced with actual auth logic
const isAuthenticated = () => {
  return localStorage.getItem('auth_token') !== null;
};

// Auth redirect component
const RequireAuth = ({ children }: { children: React.ReactElement }) => {
  if (!isAuthenticated()) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Home component to handle root path redirection
const Home = () => {
  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
};

// Placeholder components - will be replaced with actual mobile-first pages
const Dashboard = () => {
  const { isMobile } = useViewport();
  return (
    <div className={`p-4 ${isMobile ? 'text-sm' : 'text-base'}`}>
      Time Dashboard
      {isMobile && <div className="text-xs text-gray-500 mt-2">Mobile optimized view</div>}
    </div>
  );
};

const TimeHistory = () => {
  const { isMobile } = useViewport();
  return (
    <div className={`p-4 ${isMobile ? 'text-sm' : 'text-base'}`}>
      Time History Page
      {isMobile && <div className="text-xs text-gray-500 mt-2">Mobile optimized view</div>}
    </div>
  );
};

const Reports = () => {
  const { isMobile } = useViewport();
  return (
    <div className={`p-4 ${isMobile ? 'text-sm' : 'text-base'}`}>
      Reports Page
      {isMobile && <div className="text-xs text-gray-500 mt-2">Mobile optimized view</div>}
    </div>
  );
};

/**
 * Responsive App component that determines which layout to use based on viewport
 */
export default function App() {
  // For now, we're still using the old Layout component
  // As we build more mobile pages, we'll transition to MobileHoursLayout
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          {/* Root path redirects to login or dashboard */}
          <Route path="/" element={<Home />} />
          
          {/* Authentication pages */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* New mobile-first page */}
          <Route path="/time" element={
            <RequireAuth>
              <TimeEntryPage />
            </RequireAuth>
          } />
          
          {/* Legacy pages - will eventually be converted to mobile-first */}
          <Route path="/dashboard" element={
            <RequireAuth>
              <Layout><Dashboard /></Layout>
            </RequireAuth>
          } />
          <Route path="/history" element={
            <RequireAuth>
              <Layout><TimeHistory /></Layout>
            </RequireAuth>
          } />
          <Route path="/reports" element={
            <RequireAuth>
              <Layout><Reports /></Layout>
            </RequireAuth>
          } />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
