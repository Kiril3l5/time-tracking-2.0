import { useState, useEffect, createContext, useContext } from 'react';
import { logInfo } from '../utils/logging';

// Define the shape of the user object
interface User {
  id: string;
  email: string;
  displayName?: string;
  role: 'user' | 'manager' | 'admin';
}

// Define the shape of the auth context
interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: Error | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

// Create a mock context with placeholder functions
const defaultContext: AuthContextType = {
  user: null,
  loading: false,
  error: null,
  login: async () => {},
  logout: async () => {},
  register: async () => {},
  resetPassword: async () => {},
};

// Create the context
const AuthContext = createContext<AuthContextType>(defaultContext);

// Hook for consuming the auth context
export function useAuth() {
  return useContext(AuthContext);
}

// This would normally come from a provider component
// For now, this is just a placeholder until we implement Firebase auth
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Mock login function
  const login = async (email: string, _password: string) => {
    setLoading(true);
    try {
      // This would actually call Firebase auth
      logInfo('Login attempt with:', { email });

      // Mock successful login
      setUser({
        id: 'user-123',
        email,
        displayName: 'Test User',
        role: 'user',
      });

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Mock logout function
  const logout = async () => {
    setLoading(true);
    try {
      // This would actually call Firebase auth
      logInfo('Logout attempt');
      setUser(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Mock register function
  const register = async (email: string, password: string, displayName: string) => {
    setLoading(true);
    try {
      // This would actually call Firebase auth
      logInfo('Register attempt with:', { email, password: '********', displayName });

      // Mock successful registration
      setUser({
        id: 'user-123',
        email,
        displayName,
        role: 'user',
      });

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Mock reset password function
  const resetPassword = async (email: string) => {
    setLoading(true);
    try {
      // This would actually call Firebase auth
      logInfo('Reset password attempt for:', { email });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Simulate auth state change
  useEffect(() => {
    // This would be replaced with Firebase's onAuthStateChanged
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Create the provider value
  const providerValue: AuthContextType = {
    user,
    loading,
    error,
    login,
    logout,
    register,
    resetPassword,
  };

  // Return the provider component
  return AuthContext.Provider({ value: providerValue, children });
}
