import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';
// Import the centrally defined User type for Firestore data
import { User } from '../types/firestore'; 

/**
 * @interface AuthState
 * Represents the state structure for authentication managed by Zustand.
 * This store is the primary source of truth for authentication status 
 * and associated user data throughout the application.
 */
interface AuthState {
  /** The Firebase Auth user object, or null if not logged in. */
  user: FirebaseUser | null;
  /** 
   * The user's data fetched from Firestore, matching the structure defined 
   * by the `User` type in `../types/firestore.ts`, or null if not logged in/fetched. 
   */
  userProfile: User | null; 
  /** Indicates if the initial authentication check is ongoing. */
  isLoading: boolean;
  /** A flag derived from user state, true if a user is logged in. */
  isAuthenticated: boolean;
  /** Potential error message related to auth state fetching or processing. */
  error: string | null;
}

/**
 * @interface AuthActions
 * Defines the actions available to modify the authentication state.
 */
interface AuthActions {
  /** 
   * Sets the Firebase user object and updates loading/authenticated status.
   * Typically called by the central onAuthStateChanged listener.
   * @param {FirebaseUser | null} user - The Firebase user object or null.
   */
  setUser: (user: FirebaseUser | null) => void;
  /** 
   * Sets the Firestore user data.
   * @param {User | null} profile - The user data object (matching the `User` type 
   *                                from `../types/firestore.ts`) or null.
   */
  setUserProfile: (profile: User | null) => void; 
  /** Sets the loading state (e.g., during initial auth check). */
  setLoading: (loading: boolean) => void;
  /** Sets an authentication-related error message. */
  setError: (error: string | null) => void;
  /** Resets the store to its initial logged-out state. */
  resetAuthStore: () => void; 
}

// Initial state definition
const initialState: AuthState = {
  user: null,
  userProfile: null,
  isLoading: true, 
  isAuthenticated: false,
  error: null,
};

/**
 * @store useAuthStore
 * Zustand store for managing global authentication state.
 *
 * Contains the Firebase Auth user object and the corresponding Firestore user data (`User` type).
 * State is typically updated by a single `onAuthStateChanged` listener
 * located in the main application component (`App.tsx`).
 *
 * Components should subscribe to this store for auth state using the selector hooks.
 */
export const useAuthStore = create<AuthState & AuthActions>((set, _get) => ({
  ...initialState,

  // --- Actions --- 
  setUser: (user) => {
    console.log('[AuthStore] Setting user:', user?.uid);
    set({
      user,
      isAuthenticated: !!user,
      isLoading: false, 
      error: null, 
    });
    if (!user) {
      set({ userProfile: null });
    }
  },

  setUserProfile: (profile) => {
    console.log('[AuthStore] Setting user profile (User type):', profile);
    set({ userProfile: profile });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  resetAuthStore: () => set(initialState),
}));

// --- Selector Hooks for convenience --- 

/**
 * Selects authentication status (isLoading, isAuthenticated) from the store.
 * @returns {{ isLoading: boolean; isAuthenticated: boolean }} Authentication status.
 */
export const useAuthStatus = () => useAuthStore((state) => ({ 
  isLoading: state.isLoading, 
  isAuthenticated: state.isAuthenticated 
}));

/**
 * Selects the current Firebase user object from the store.
 * @returns {FirebaseUser | null} The current Firebase user or null.
 */
export const useCurrentUser = () => useAuthStore((state) => state.user);

/**
 * Selects the current Firestore user data object (`User` type) from the store.
 * @returns {User | null} The current user data from Firestore or null.
 */
export const useCurrentUserProfile = () => useAuthStore((state) => state.userProfile);

/**
 * Selects the authentication actions from the store.
 * Primarily used by the central `onAuthStateChanged` listener to update the store.
 * @returns {AuthActions} Object containing auth state manipulation actions.
 */
export const useAuthActions = () => useAuthStore((state) => ({ 
  setUser: state.setUser, 
  setUserProfile: state.setUserProfile, 
  setLoading: state.setLoading, 
  setError: state.setError, 
  resetAuthStore: state.resetAuthStore 
}));

// --- Role-based selectors (Now using the correct User type via useCurrentUserProfile) --- 

/** Checks if the current user has an 'admin' or 'superadmin' role. */
export const useIsAdmin = () => {
  const profile = useCurrentUserProfile();
  // Check profile exists and has the role property
  return !!profile && (profile.role === 'admin' || profile.role === 'superadmin');
};

/** Checks if the current user has a 'manager' role. */
export const useIsManager = () => {
  const profile = useCurrentUserProfile();
  return !!profile && profile.role === 'manager';
};

/** Checks if the current user has a 'user' role. */
export const useIsWorker = () => {
  const profile = useCurrentUserProfile();
  return !!profile && profile.role === 'user';
};
