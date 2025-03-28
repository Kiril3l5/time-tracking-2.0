// Create this file with this content
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// Type-safe environment variable access
interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

// Get config with fallbacks and validation
const getFirebaseConfig = (): FirebaseConfig => {
  const config: FirebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  if (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) {
    config.measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
  }

  // Validate required config
  const missingKeys = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(`Missing Firebase configuration: ${missingKeys.join(', ')}`);
  }

  return config;
};

// Initialize Firebase
export const app = initializeApp(getFirebaseConfig());
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);

// Configure Firestore for offline persistence
// This should be called as early as possible in your app
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, persistence can only be enabled in one tab at a time
    console.warn('Firestore persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    // The current browser doesn't support offline persistence
    console.warn('Firestore persistence not supported in this browser');
  } else {
    // Handle other errors
    console.error('Firestore persistence error:', err);
  }
});

// Connect to emulators if in development mode
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  // Use localhost for emulators with fallbacks to standard ports
  const HOST = 'localhost';
  const AUTH_PORT = 9099;
  const FIRESTORE_PORT = 8080;
  const FUNCTIONS_PORT = 5001;

  connectAuthEmulator(auth, `http://${HOST}:${AUTH_PORT}`);
  connectFirestoreEmulator(db, HOST, FIRESTORE_PORT);
  connectFunctionsEmulator(functions, HOST, FUNCTIONS_PORT);

  console.warn('Using Firebase Emulators');
}
