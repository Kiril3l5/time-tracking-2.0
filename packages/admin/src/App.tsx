import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useViewport } from '@common/hooks/ui/useViewport';
import { Layout } from './components/Layout';

// Import common auth components and hooks
import { 
  AdminRoute, 
  ManagerRoute 
} from '@common/components/auth/ProtectedRoute';
import { useAuthStore } from '@common/store/useAuthStore';
import { auth } from '@common/firebase/core/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getDocument, usersCollection } from '@common/firebase/firestore/firestore-service';

// Import the pages we created
import ApprovalsPage from './pages/ApprovalsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Create a client
const queryClient = new QueryClient();

// Home component updated to use Zustand state
const Home = () => {
  const { isAuthenticated, isLoading } = useAuthStore(state => ({ 
    isAuthenticated: state.isAuthenticated, 
    isLoading: state.isLoading 
  }));

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
};

// Placeholder components - will be replaced with actual mobile-first pages
const Dashboard = () => {
  const { isMobile } = useViewport();
  return (
    <div className={`p-4 ${isMobile ? 'text-sm' : 'text-base'}`}>
      Admin Dashboard Page
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

export default function App() {
  const { setUser, setUserProfile, setLoading, setError } = useAuthStore(state => ({ 
    setUser: state.setUser, 
    setUserProfile: state.setUserProfile,
    setLoading: state.setLoading,
    setError: state.setError,
  }));

  // Central listener for Firebase Auth state changes
  useEffect(() => {
    setLoading(true);
    // Check if auth object is initialized before subscribing
    if (!auth) {
      console.error("Firebase auth is not initialized.");
      setError("Authentication service failed to load.");
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Use getDocument with usersCollection
          const profile = await getDocument(usersCollection, user.uid);
          setUser(user);
          // Handle case where profile might not exist yet 
          // (e.g., right after registration before Firestore doc is created)
          if (profile) {
            setUserProfile(profile);
          } else {
            // Set profile to null or a default state if not found
            setUserProfile(null); 
            console.warn(`Firestore profile not found for UID: ${user.uid}`);
            // Optionally set an error or wait/retry
          }
        } catch (err) {
          console.error("Failed to fetch user profile:", err);
          setError(err instanceof Error ? err.message : 'Failed to fetch profile');
          // Keep user authenticated with Firebase auth but clear profile
          setUser(user);
          setUserProfile(null);
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setError(null);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [setUser, setUserProfile, setLoading, setError]);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          {/* Root path redirects based on auth state */}
          <Route path="/" element={<Home />} />
          
          {/* Authentication pages (public) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected Routes using common components */}
          <Route path="/approvals" element={
            <ManagerRoute>
              <ApprovalsPage />
            </ManagerRoute>
          } />
          
          {/* Assuming Dashboard, Users, Settings need Admin */}
          <Route path="/dashboard" element={
            <AdminRoute>
              <Layout><Dashboard /></Layout>
            </AdminRoute>
          } />
          <Route path="/users" element={
            <AdminRoute>
              <Layout><Users /></Layout>
            </AdminRoute>
          } />
          <Route path="/settings" element={
            <AdminRoute>
              <Layout><Settings /></Layout>
            </AdminRoute>
          } />

          {/* Fallback for unknown routes (optional) */}
          {/* <Route path="*" element={<NotFoundPage />} /> */}
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
