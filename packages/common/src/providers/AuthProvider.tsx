import { createContext, useContext, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { useAuth as useFirebaseAuth } from '../firebase/auth/auth-hooks';
import { login, signOut, sendPasswordResetEmail, register } from '../firebase/auth/auth-service';
import { UserProfile, User as FirestoreUser } from '../types/firestore';

// Define context type
interface AuthContextType {
  // Auth state
  user: User | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  error: Error | null;
  
  // Access control
  isAuthenticated: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isWorker: boolean;
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
  hasCompanyAccess: (companyId: string) => boolean;
  
  // Auth methods
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (email: string, password: string, userData: Omit<FirestoreUser, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

// Create context with default values
const AuthContext = createContext<AuthContextType>({
  // Auth state defaults
  user: null,
  userProfile: null,
  isLoading: true,
  error: null,
  
  // Access control defaults
  isAuthenticated: false,
  isAdmin: false,
  isManager: false,
  isWorker: false,
  hasRole: () => false,
  hasPermission: () => false,
  hasCompanyAccess: () => false,
  
  // Auth methods with empty implementations
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  resetPassword: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  // Use the enhanced Firebase auth hook
  const { 
    user, 
    userProfile, 
    loading: isLoading, 
    error,
    hasRole,
    hasPermission,
    isAdmin,
    isManager,
    isWorker,
    hasCompanyAccess
  } = useFirebaseAuth();
  
  // Derived state
  const isAuthenticated = !!user;
  
  // Auth methods
  const handleLogin = async (email: string, password: string, remember = true) => {
    try {
      // Login with the remember boolean parameter
      await login(email, password, remember);
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    }
  };
  
  const handleRegister = async (
    email: string, 
    password: string, 
    userData: Omit<FirestoreUser, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    try {
      await register(email, password, userData);
    } catch (err) {
      console.error('Registration error:', err);
      throw err;
    }
  };
  
  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Logout error:', err);
      throw err;
    }
  };
  
  const handleResetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(email);
    } catch (err) {
      console.error('Password reset error:', err);
      throw err;
    }
  };
  
  // Create context value
  const contextValue: AuthContextType = {
    // Auth state
    user,
    userProfile,
    isLoading,
    error,
    
    // Access control
    isAuthenticated,
    isAdmin: isAdmin(),
    isManager: isManager(),
    isWorker: isWorker(),
    hasRole,
    hasPermission,
    hasCompanyAccess,
    
    // Auth methods
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    resetPassword: handleResetPassword,
  };
  
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to use authentication context
export const useAuth = () => useContext(AuthContext);

export default AuthProvider; 