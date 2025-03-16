// Export core Firebase instances
export { app, auth, db, functions } from './core/firebase';

// Export auth utilities
export * from './auth';

// Export Firestore utilities
export * from './firestore';

// Export Firebase hooks
export * from './hooks';

// Re-export specific Firebase types and functions that will be commonly used
// For types, use export type to satisfy isolatedModules
export type {
  User as FirebaseUser,
  UserCredential,
} from 'firebase/auth';

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';

export type {
  DocumentReference,
  DocumentData,
  QueryDocumentSnapshot,
  QueryConstraint,
} from 'firebase/firestore';

export {
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
} from 'firebase/firestore';

export {
  // Functions exports
  httpsCallable,
} from 'firebase/functions';