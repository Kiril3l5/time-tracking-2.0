import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create a client
const queryClient = new QueryClient();

// Placeholder components - replace with actual components
const Dashboard = () => <div className="p-4">Dashboard Page</div>;
const Users = () => <div className="p-4">Users Page</div>;
const Settings = () => <div className="p-4">Settings Page</div>;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/users" element={<Layout><Users /></Layout>} />
          <Route path="/settings" element={<Layout><Settings /></Layout>} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
