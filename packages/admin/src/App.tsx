import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useViewport } from '@common/hooks/ui/useViewport';
import { Layout } from './components/Layout';

// Import the pages we created
import ApprovalsPage from './pages/ApprovalsPage';

// Create a client
const queryClient = new QueryClient();

// Placeholder components - will be replaced with actual mobile-first pages
const Dashboard = () => {
  const { isMobile } = useViewport();
  return (
    <div className={`p-4 ${isMobile ? 'text-sm' : 'text-base'}`}>
      Dashboard Page
      {isMobile && <div className="text-xs text-gray-500 mt-2">Mobile optimized view</div>}
    </div>
  );
};

const Users = () => {
  const { isMobile } = useViewport();
  return (
    <div className={`p-4 ${isMobile ? 'text-sm' : 'text-base'}`}>
      Users Page
      {isMobile && <div className="text-xs text-gray-500 mt-2">Mobile optimized view</div>}
    </div>
  );
};

const Settings = () => {
  const { isMobile } = useViewport();
  return (
    <div className={`p-4 ${isMobile ? 'text-sm' : 'text-base'}`}>
      Settings Page
      {isMobile && <div className="text-xs text-gray-500 mt-2">Mobile optimized view</div>}
    </div>
  );
};

/**
 * Responsive App component that determines which layout to use based on viewport
 */
export default function App() {
  // For now, we're still using the old Layout component
  // As we build more mobile pages, we'll transition to MobileAdminLayout
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          {/* New mobile-first page */}
          <Route path="/approvals" element={<ApprovalsPage />} />
          
          {/* Legacy pages - will eventually be converted to mobile-first */}
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/users" element={<Layout><Users /></Layout>} />
          <Route path="/settings" element={<Layout><Settings /></Layout>} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
