// Authentication service implementation
import {
  User,
  UserCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  getIdTokenResult,
} from 'firebase/auth';
import {
  getFirebaseAuth,
  getFirestoreDb
} from '../core/firebase';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { UserProfile, User as FirestoreUser } from '../../types/firestore';

// Remember me storage key
const REMEMBER_ME_KEY = 'time_tracking_remember_me';
const LAST_USER_KEY = 'time_tracking_last_user';

// Set persistence level - controls how long the user stays logged in
export function setPersistenceLevel(level: 'LOCAL' | 'SESSION' | 'NONE' = 'LOCAL') {
  const persistenceMap = {
    'LOCAL': browserLocalPersistence,
    'SESSION': browserSessionPersistence,
    'NONE': inMemoryPersistence
  };
  
  return setPersistence(getFirebaseAuth(), persistenceMap[level]);
}

// Store the remembered user details
export const setRememberedUser = (email: string, rememberMe: boolean): void => {
  try {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, email);
      localStorage.setItem(LAST_USER_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
      // Still store the last user for biometric login
      localStorage.setItem(LAST_USER_KEY, email);
    }
  } catch (error) {
    console.error('Failed to save remember me preference', error);
  }
};

// Get the remembered user email
export const getRememberedUser = (): string | null => {
  try {
    return localStorage.getItem(REMEMBER_ME_KEY);
  } catch (error) {
    console.error('Failed to retrieve remembered user', error);
    return null;
  }
};

// Get the last logged in user (for biometric even if not remembered)
export const getLastUser = (): string | null => {
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch (error) {
    console.error('Failed to retrieve last user', error);
    return null;
  }
};

// Login with email and password
export const login = async (
  email: string,
  password: string,
  rememberMe = false,
  persistenceLevel: 'LOCAL' | 'SESSION' | 'NONE' = 'SESSION'
): Promise<UserCredential> => {
  try {
    // Set the persistence level based on remember me
    const level = rememberMe ? 'LOCAL' : persistenceLevel;
    await setPersistenceLevel(level);
    
    // Perform login
    const userCredential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    
    // Save remember me preference
    setRememberedUser(email, rememberMe);
    
    // Record last login timestamp
    if (userCredential.user) {
      await updateDoc(doc(getFirestoreDb(), 'users', userCredential.user.uid), {
        lastLoginAt: new Date().toISOString(),
      });
    }
    
    return userCredential;
  } catch (error) {
    console.error('Login failed', error);
    throw error;
  }
};

// Sign out
export const signOut = async (): Promise<void> => {
  return firebaseSignOut(getFirebaseAuth());
};

// Send password reset email
export const sendPasswordResetEmail = async (email: string): Promise<void> => {
  return firebaseSendPasswordResetEmail(getFirebaseAuth(), email);
};

// Register new user with email, password, and profile data
export const register = async (
  email: string,
  password: string,
  userData: Omit<FirestoreUser, 'id' | 'createdAt' | 'updatedAt'>
): Promise<UserCredential> => {
  // Create the user account
  const userCredential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  const user = userCredential.user;

  // Add user data to Firestore
  const newUserData: FirestoreUser = {
    id: user.uid,
    email: user.email || email,
    firstName: userData.firstName,
    lastName: userData.lastName,
    companyId: userData.companyId,
    managerId: userData.managerId,
    role: userData.role || 'user',
    permissions: userData.permissions || [],
    isActive: true,
    lastLoginAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      registrationMethod: 'email',
      registrationTime: new Date().toISOString(),
      userAgent: window.navigator.userAgent
    }
  };

  // Create user document
  await setDoc(doc(getFirestoreDb(), 'users', user.uid), newUserData);

  // Create user profile
  const userProfile: UserProfile = {
    id: user.uid,
    userId: user.uid,
    displayName: `${userData.firstName} ${userData.lastName}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Create user profile document
  await setDoc(doc(getFirestoreDb(), 'userProfiles', user.uid), userProfile);

  return userCredential;
};

// Get current authenticated user
export const getCurrentUser = (): User | null => {
  return getFirebaseAuth().currentUser;
};

// Get user profile data from Firestore
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const userDoc = await getDoc(doc(getFirestoreDb(), 'userProfiles', userId));

  if (userDoc.exists()) {
    return userDoc.data() as UserProfile;
  }

  return null;
};

// Get user role and permissions from token
export const getUserClaims = async (user: User): Promise<{
  role?: string;
  companyId?: string;
  permissions?: string[];
  [key: string]: unknown;
}> => {
  const idTokenResult = await getIdTokenResult(user);
  return idTokenResult.claims;
};

// Check if user has specific role
export const hasRole = async (user: User, role: string): Promise<boolean> => {
  const claims = await getUserClaims(user);
  return claims.role === role;
};

// Check if user has specific permission
export const hasPermission = async (user: User, permission: string): Promise<boolean> => {
  const claims = await getUserClaims(user);
  return Array.isArray(claims.permissions) && claims.permissions.includes(permission);
};

// Store credential for biometric login
export const storeCredential = async (userId: string, credential: string): Promise<void> => {
  // In a production app, this would use the Credential Management API or WebAuthn
  try {
    // Only store in a specific localStorage compartment for demo purposes
    localStorage.setItem(`biometric_cred_${userId}`, credential);
    
    // Update user profile to indicate biometric is enabled
    await updateDoc(doc(getFirestoreDb(), 'userProfiles', userId), {
      'preferences.biometricEnabled': true,
      updatedAt: new Date().toISOString(),
    });
    
    return;
  } catch (error) {
    console.error('Failed to store biometric credential', error);
    throw new Error('Failed to store biometric credential');
  }
};

// Retrieve credential for biometric login
export const getStoredCredential = async (userId: string): Promise<string | null> => {
  // This is a placeholder for the implementation
  // In production, this would use platform-specific secure storage
  try {
    return localStorage.getItem(`biometric_cred_${userId}`);
  } catch (error) {
    console.error('Failed to retrieve biometric credential', error);
    return null;
  }
};

// Auth state observer
export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(getFirebaseAuth(), callback);
};

// Check if biometric authentication is available
export const isBiometricAvailable = (): boolean => {
  // Check for WebAuthn/Credential Management API support
  return window && 
         window.PublicKeyCredential && 
         typeof window.PublicKeyCredential === 'function';
};

// Check if biometric is enabled for a user
export const isBiometricEnabled = async (userId: string): Promise<boolean> => {
  try {
    const profile = await getUserProfile(userId);
    return profile?.preferences?.biometricEnabled === true;
  } catch (error) {
    console.error('Failed to check biometric status', error);
    return false;
  }
};

// Authenticate with biometric
export const authenticateWithBiometric = async (userId: string): Promise<UserCredential | null> => {
  try {
    // This is a placeholder for actual WebAuthn implementation
    // In a real app, this would use the WebAuthn API to verify the user
    
    // For now, we'll simulate by checking if we have a stored credential
    const credential = await getStoredCredential(userId);
    
    if (!credential) {
      throw new Error('No stored biometric credential found');
    }
    
    // In a real implementation, we would verify the credential
    // and then use a custom token or session cookie approach
    
    // For now, we'll just get the user's email and log them in automatically
    // This is NOT secure and is just for demonstration
    const userDoc = await getDoc(doc(getFirestoreDb(), 'users', userId));
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    // Uncomment when implementing biometric authentication
    // const userData = userDoc.data() as FirestoreUser;
    
    // This would be replaced with a secure authentication method
    // using the verified credential
    return null; // Return null since we're not implementing the actual biometric auth yet
  } catch (error) {
    console.error('Biometric authentication failed', error);
    throw error;
  }
};

// Export authentication hooks index
export * from './auth-hooks';
