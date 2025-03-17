// Authentication service implementation
import {
  User,
  UserCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, db } from '../core/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { UserProfile, User as FirestoreUser } from '../../types/firestore';

// Login with email and password
export const login = async (email: string, password: string): Promise<UserCredential> => {
  return signInWithEmailAndPassword(auth, email, password);
};

// Sign out
export const signOut = async (): Promise<void> => {
  return firebaseSignOut(auth);
};

// Send password reset email
export const sendPasswordResetEmail = async (email: string): Promise<void> => {
  return firebaseSendPasswordResetEmail(auth, email);
};

// Register new user with email, password, and profile data
export const register = async (
  email: string,
  password: string,
  userData: Omit<FirestoreUser, 'id' | 'createdAt' | 'updatedAt'>
): Promise<UserCredential> => {
  // Create the user account
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Create user document
  await setDoc(doc(db, 'users', user.uid), newUserData);

  // Create user profile
  const userProfile: UserProfile = {
    id: user.uid,
    userId: user.uid,
    displayName: `${userData.firstName} ${userData.lastName}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Create user profile document
  await setDoc(doc(db, 'userProfiles', user.uid), userProfile);

  return userCredential;
};

// Get current authenticated user
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

// Get user profile data from Firestore
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const userDoc = await getDoc(doc(db, 'userProfiles', userId));

  if (userDoc.exists()) {
    return userDoc.data() as UserProfile;
  }

  return null;
};

// Auth state observer
export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// Export authentication hooks index
export * from './auth-hooks';
