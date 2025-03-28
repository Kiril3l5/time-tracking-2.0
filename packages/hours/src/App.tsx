import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useViewport } from '@common/hooks/ui/useViewport';
import { Layout } from './components/Layout';

// Import the pages we created
import TimeEntryPage from './pages/TimeEntryPage';

// Create a client
const queryClient = new QueryClient();

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
          {/* New mobile-first page */}
          <Route path="/time" element={<TimeEntryPage />} />
          
          {/* Legacy pages - will eventually be converted to mobile-first */}
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/history" element={<Layout><TimeHistory /></Layout>} />
          <Route path="/reports" element={<Layout><Reports /></Layout>} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
