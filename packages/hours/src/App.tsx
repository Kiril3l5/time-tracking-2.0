import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useViewport } from '@common/hooks/ui/useViewport';
import { Layout } from './components/Layout';
import { auth, db } from '@common/firebase/core/firebase';
import { onAuthStateChanged } from 'firebase/auth'; 
import { useAuthActions, useAuthStatus } from '@common/store/useAuthStore'; 
// Import the correct User type from firestore types
import { User } from '@common/types/firestore'; 
// Import Firestore functions needed for fetching
import { doc, getDoc } from 'firebase/firestore';

// Import the pages we created
import TimeEntryPage from './pages/TimeEntryPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Create a client
const queryClient = new QueryClient();

/**
 * Component to protect routes, requiring authentication.
 * Redirects to /login if user is not authenticated.
 * Relies on Zustand state (`useAuthStatus`).
 */
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuthStatus(); // Use Zustand status

  if (isLoading) {
    // Optional: Render a loading spinner or similar while checking auth state
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" replace />;
  }

  return children;
};

/**
 * Component to handle root path redirection based on auth state.
 * Relies on Zustand state (`useAuthStatus`).
 */
const Home = () => {
  const { isAuthenticated, isLoading } = useAuthStatus(); // Use Zustand status

  if (isLoading) {
    return <div>Loading...</div>; // Consistent loading state
  }

  if (isAuthenticated) {
    return <Navigate to="/time" replace />; // Redirect to main app page
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
 * @component App
 * Root application component.
 * Sets up routing, global providers (QueryClient, AuthProvider), 
 * and the central Firebase auth state listener.
 */
export default function App() {
  const { setUser, setLoading, setUserProfile, setError } = useAuthActions(); 

  /**
   * Central Firebase Authentication State Listener.
   * This effect runs once on mount.
   * - Listens for changes in Firebase Authentication state.
   * - Updates the global Zustand store (`useAuthStore`) with the current Firebase user.
   * - If a user is authenticated, attempts to fetch their corresponding data 
   *   from the Firestore 'users' collection (using the `User` type) and updates the store.
   * - Manages the global loading state in Zustand.
   */
  useEffect(() => {
    setLoading(true); 

    // Ensure Firebase Auth is initialized before attaching listener
    if (!auth) {
      console.error("[App.tsx] Firebase Auth instance is not available. Cannot set up listener.");
      setError("Authentication service failed to initialize."); // Update global error state
      setLoading(false); // Ensure loading state is resolved
      return; // Stop the effect
    }

    // Auth instance exists, proceed with listener setup
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('[App.tsx] Auth state changed via listener:', user?.uid);
      // setUser action now handles setting loading to false
      setUser(user); 
      
      if (user && db) { 
        try {
          const userDocRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            console.log('[App.tsx] Fetched user data (User type):', docSnap.data());
            setUserProfile(docSnap.data() as User); 
          } else {
            console.warn('[App.tsx] User document not found for uid:', user.uid);
            setUserProfile(null); 
          }
        } catch (error) {
          console.error('[App.tsx] Error fetching user data:', error);
          setUserProfile(null); 
          setError(error instanceof Error ? error.message : 'Failed to fetch user data');
        }
      } 
      // If user is null (logged out), profile is cleared within setUser action
    });

    // Cleanup listener on unmount
    return () => {
      console.log('[App.tsx] Unsubscribing from auth state changes.');
      unsubscribe();
    };
  }, [setUser, setLoading, setUserProfile, setError]); 

  // Wrap the Router with AuthProvider to make actions available via useAuth()
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          {/* Root path redirects based on Zustand state */}
          <Route path="/" element={<Home />} />
          
          {/* Auth pages (likely use useAuth() for actions) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected routes (use useAuthStatus() for state check) */}
          <Route path="/time" element={
            <RequireAuth>
              <TimeEntryPage />
            </RequireAuth>
          } />
          
          {/* Legacy pages - adapt as needed */}
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
