import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create a client
const queryClient = new QueryClient();

// Placeholder components - replace with actual components
const Dashboard = () => <div className="p-4">Time Dashboard</div>;
const TimeEntries = () => <div className="p-4">Time Entries Page</div>;
const Reports = () => <div className="p-4">Reports Page</div>;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/time-entries" element={<Layout><TimeEntries /></Layout>} />
          <Route path="/reports" element={<Layout><Reports /></Layout>} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
