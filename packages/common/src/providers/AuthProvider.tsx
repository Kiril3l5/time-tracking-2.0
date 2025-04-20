import React, { createContext, useContext, ReactNode } from 'react';
import { 
  Auth, 
  User, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  UserCredential
} from 'firebase/auth';
import { doc, setDoc, Timestamp } from 'firebase/firestore'; // Import Timestamp
import { auth as firebaseAuth, db } from '../firebase/core/firebase'; // Import db
// Remove Zustand imports as the listener is now external
// import { useAuthActions } from '../store/useAuthStore'; 
import { UserProfile } from '../types/firestore'; // Keep UserProfile type

/**
 * @interface RegistrationFormData
 * Defines the shape of data expected from the registration form.
 * This data is used to create the Firestore user profile document.
 */
interface RegistrationFormData {
  firstName: string;
  lastName: string;
  companyId?: string; // Optional, might come from context/invite
  managerId?: string; // Optional
  role?: 'user' | 'manager' | 'admin'; // Optional, might have a default
  // Add other fields collected in the form if necessary
}

/**
 * @interface NewUserData
 * Defines the exact structure of data to be saved in Firestore
 * when creating a *new* user document. Excludes fields like 'id' (which is the doc ID)
 * and 'updatedAt' (usually set server-side or on edits).
 */
interface NewUserData {
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'manager' | 'admin' | 'superadmin'; // Ensure full UserRole coverage
  companyId: string;
  managerId?: string | null; // Allow null if applicable
  permissions: string[];
  isActive: boolean;
  createdAt: string; // ISO String
  lastLoginAt: string; // ISO String
  // Add metadata if needed and defined in the target structure
  // metadata?: { /* ... */ };
}

/**
 * @interface AuthContextType
 * Defines the authentication actions provided by the AuthContext.
 * Note: Authentication state (user, loading, isAuthenticated) is managed 
 * globally via the Zustand store (useAuthStore).
 */
interface AuthContextType {
  /** Initiates the login process with email and password. */
  login: (email: string, password: string) => Promise<UserCredential | void>; // Return UserCredential on success
  /** Initiates the registration process, creating both Firebase Auth user and Firestore profile. */
  register: (email: string, password: string, formData: RegistrationFormData) => Promise<UserCredential | void>; // Accept profile data, return UserCredential
  /** Initiates the logout process. */
  logout: () => Promise<void>;
  /** Sends a password reset email to the provided address. */
  resetPassword: (email: string) => Promise<void>;
}

// Create the context with a default value 
// Provide dummy functions in default to satisfy the type, or use undefined
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the props for the provider component
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * @component AuthProvider
 * Provides authentication action functions (`login`, `register`, `logout`, `resetPassword`) via context.
 * 
 * This component DOES NOT manage authentication state directly.
 * State (user object, loading status, isAuthenticated flag) is handled globally 
 * by the Zustand store (`useAuthStore`), which is updated by a listener 
 * typically located in the main App component (`App.tsx`).
 * 
 * Wrap the application or relevant parts needing auth actions with this provider.
 * 
 * @param {AuthProviderProps} props - Component props.
 * @param {ReactNode} props.children - Child components to render.
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  // Remove internal state:
  // const [user, setUserState] = useState<User | null>(null);
  // const [loading, setLoading] = useState(true);
  // const { setUser: setZustandUser } = useAuthActions(); 

  // Remove useEffect listener - it's now in App.tsx

  /**
   * Logs in a user with email and password.
   * Updates the lastLogin field in Firestore upon successful login.
   * @param {string} email - User's email.
   * @param {string} password - User's password.
   * @returns {Promise<UserCredential | void>} Firebase UserCredential on success.
   * @throws Error if Firebase Auth/DB is not initialized or login fails.
   */
  const login = async (email: string, password: string): Promise<UserCredential | void> => {
    if (!firebaseAuth || !db) { // Also check if db is initialized
      console.error("[AuthProvider] Firebase Auth or Firestore DB is not initialized. Cannot log in.");
      throw new Error("Authentication service or database is not available.");
    }
    // No need to manage loading state here, handled globally
    try {
      const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
      // The listener in App.tsx will update Zustand state
      console.log("[AuthProvider] Login successful for:", userCredential.user.uid);
      // Update lastLogin timestamp in Firestore (optional, but good practice)
      try {
        const userDocRef = doc(db, "users", userCredential.user.uid);
        await setDoc(userDocRef, { lastLoginAt: new Date().toISOString() }, { merge: true });
      } catch (firestoreError) {
        console.error("[AuthProvider] Failed to update lastLoginAt:", firestoreError);
        // Non-critical error, don't block login
      }
      return userCredential;
    } catch (error) {
      console.error("[AuthProvider] Login error:", error);
      // No need to set loading state here
      throw error; // Re-throw error
    }
  };

  /**
   * Registers a new user.
   * Creates a Firebase Auth user and a corresponding Firestore document in the 'users' collection.
   * @param {string} email - User's email.
   * @param {string} password - User's password.
   * @param {RegistrationFormData} formData - User profile data collected from the registration form.
   * @returns {Promise<UserCredential | void>} Firebase UserCredential on success.
   * @throws Error if Firebase Auth/DB is not initialized or registration fails.
   */
  const register = async (
    email: string, 
    password: string, 
    formData: RegistrationFormData // Use the new type
  ): Promise<UserCredential | void> => {
    if (!firebaseAuth || !db) { // Also check if db is initialized
      console.error("[AuthProvider] Firebase Auth or Firestore DB is not initialized. Cannot register.");
      throw new Error("Authentication service or database is not available.");
    }
    // No need to manage loading state here
    try {
      // 1. Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      const user = userCredential.user;
      console.log("[AuthProvider] Firebase Auth user created:", user.uid);

      // 2. Create Firestore user document data using the specific NewUserData interface
      const nowISO = new Date().toISOString();
      const userDataForFirestore: NewUserData = {
        email: user.email || email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role || 'user',
        companyId: formData.companyId || 'default',
        managerId: formData.managerId || undefined,
        permissions: [],
        isActive: true,
        createdAt: nowISO,
        lastLoginAt: nowISO,
      };

      // Use user.uid as the document ID
      const userDocRef = doc(db, "users", user.uid);
      // Save the strongly-typed data
      await setDoc(userDocRef, userDataForFirestore);
      console.log("[AuthProvider] Firestore user document created for:", user.uid);
      
      return userCredential;
    } catch (error) {
      console.error("[AuthProvider] Registration error:", error);
      // No need to set loading state here
      throw error; // Re-throw error
    }
  };

  /**
   * Logs out the current user.
   * @returns {Promise<void>}
   * @throws Error if Firebase Auth is not initialized or logout fails.
   */
  const logout = async () => {
    if (!firebaseAuth) {
      console.error("[AuthProvider] Firebase Auth is not initialized. Cannot log out.");
      return; 
    }
    // No need to manage loading state here
    try {
      await firebaseSignOut(firebaseAuth);
      console.log("[AuthProvider] Logout successful.");
      // The listener in App.tsx will update Zustand state
    } catch (error) {
      console.error("[AuthProvider] Logout error:", error);
      // No need to set loading state here
      throw error; // Re-throw error
    }
  };
  
  /**
   * Sends a password reset email.
   * @param {string} email - The email address to send the reset link to.
   * @returns {Promise<void>}
   * @throws Error if Firebase Auth is not initialized or sending fails.
   */
  const resetPassword = async (email: string) => {
    if (!firebaseAuth) {
      console.error("[AuthProvider] Firebase Auth is not initialized. Cannot reset password.");
      throw new Error("Authentication service is not available.");
    }
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      console.log("[AuthProvider] Password reset email sent to:", email);
    } catch (error) {
      console.error("[AuthProvider] Password Reset error:", error);
      throw error; // Re-throw error
    }
  };

  // Value provided by the context - only actions
  const value: AuthContextType = {
    login,
    register,
    logout,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children} 
      {/* Render children immediately. Loading is handled globally */}
    </AuthContext.Provider>
  );
};

/**
 * @hook useAuth
 * Custom hook to access the authentication action functions provided by AuthProvider.
 * Must be used within a component wrapped by AuthProvider.
 * 
 * @returns {AuthContextType} The authentication context value (action functions).
 * @throws Error if used outside of an AuthProvider.
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Remove default export if it exists and isn't needed, 
// or keep if it's used for dynamic imports etc.
// Assuming named export is sufficient:
// export default AuthProvider; 