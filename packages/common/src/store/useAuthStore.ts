import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { User } from 'firebase/auth';
import { UserRole } from '../utils/permissions';

/**
 * User profile interface
 */
interface UserProfile {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  companyId: string;
  permissions: Record<string, boolean>;
  assignedWorkers?: string[];
}

/**
 * Authentication state interface
 */
interface AuthState {
  // User state
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  error: Error | null;
  
  // Authentication status
  isAuthenticated: boolean;
  
  // Actions
  actions: {
    setUser: (user: User | null) => void;
    setProfile: (profile: UserProfile | null) => void;
    setLoading: (isLoading: boolean) => void;
    setError: (error: Error | null) => void;
    reset: () => void;
  };
}

/**
 * Default state
 */
const defaultState = {
  user: null,
  profile: null,
  isLoading: true,
  error: null,
  isAuthenticated: false,
};

/**
 * Authentication state store
 * Manages user authentication state
 */
export const useAuthStore = create<AuthState>()(
  immer((set) => ({
    // Initial state
    ...defaultState,
    
    // Actions
    actions: {
      setUser: (user) => 
        set((state) => {
          state.user = user;
          state.isAuthenticated = !!user;
        }),
      
      setProfile: (profile) => 
        set((state) => {
          state.profile = profile;
        }),
      
      setLoading: (isLoading) => 
        set((state) => {
          state.isLoading = isLoading;
        }),
      
      setError: (error) => 
        set((state) => {
          state.error = error;
        }),
      
      reset: () => 
        set(() => ({ ...defaultState, isLoading: false })),
    },
  }))
);

// Selector hooks for better performance
export const useUser = () => useAuthStore((state) => state.user);
export const useProfile = () => useAuthStore((state) => state.profile);
export const useAuthStatus = () => useAuthStore((state) => ({
  isAuthenticated: state.isAuthenticated,
  isLoading: state.isLoading,
  error: state.error,
}));

// Role-based selectors
export const useIsAdmin = () => {
  const profile = useProfile();
  return !!profile && (profile.role === 'admin' || profile.role === 'super-admin');
};

export const useIsManager = () => {
  const profile = useProfile();
  return !!profile && profile.role === 'manager';
};

export const useIsWorker = () => {
  const profile = useProfile();
  return !!profile && profile.role === 'worker';
};

// Action hooks
export const useAuthActions = () => useAuthStore((state) => state.actions); 