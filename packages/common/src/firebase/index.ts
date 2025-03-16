// Export core Firebase instances
export { app, auth, db, functions } from './core/firebase';

// Export auth utilities
export * from './auth';

// Export Firestore utilities
export * from './firestore';

// Export Firebase hooks
export * from './hooks';

// Re-export specific Firebase types and functions that will be commonly used
export {
  // Auth exports
  User as FirebaseUser,
  UserCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';

export {
  // Firestore exports
  DocumentReference,
  DocumentData,
  QueryDocumentSnapshot,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  QueryConstraint,
} from 'firebase/firestore';

export {
  // Functions exports
  httpsCallable,
} from 'firebase/functions';