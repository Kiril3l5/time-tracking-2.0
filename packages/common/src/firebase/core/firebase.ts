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

// Function to display a user-friendly error message when Firebase config is missing
const displayConfigError = (missingKeys: string[]) => {
  // Create error container
  const errorContainer = document.createElement('div');
  errorContainer.style.fontFamily = 'Arial, sans-serif';
  errorContainer.style.position = 'fixed';
  errorContainer.style.top = '0';
  errorContainer.style.left = '0';
  errorContainer.style.width = '100%';
  errorContainer.style.height = '100%';
  errorContainer.style.backgroundColor = '#f8f9fa';
  errorContainer.style.zIndex = '9999';
  errorContainer.style.display = 'flex';
  errorContainer.style.flexDirection = 'column';
  errorContainer.style.alignItems = 'center';
  errorContainer.style.justifyContent = 'center';
  errorContainer.style.padding = '20px';
  errorContainer.style.boxSizing = 'border-box';
  errorContainer.style.textAlign = 'center';

  // Create error title
  const errorTitle = document.createElement('h1');
  errorTitle.textContent = 'Configuration Error';
  errorTitle.style.color = '#dc3545';
  errorTitle.style.marginBottom = '20px';

  // Create error message
  const errorMessage = document.createElement('p');
  errorMessage.innerHTML = `The application is missing required Firebase configuration:<br><strong>${missingKeys.join(', ')}</strong>`;
  errorMessage.style.fontSize = '18px';
  errorMessage.style.marginBottom = '20px';
  errorMessage.style.maxWidth = '600px';

  // Create technical info
  const techInfo = document.createElement('div');
  techInfo.innerHTML = `
    <p>This usually happens when environment variables are not properly set during deployment.</p>
    <p>If you're a developer, please check that environment variables are properly configured.</p>
    <p>If you're a user, please contact the site administrator.</p>
  `;
  techInfo.style.fontSize = '16px';
  techInfo.style.color = '#6c757d';
  techInfo.style.padding = '20px';
  techInfo.style.backgroundColor = '#e9ecef';
  techInfo.style.borderRadius = '5px';
  techInfo.style.maxWidth = '600px';

  // Append all elements
  errorContainer.appendChild(errorTitle);
  errorContainer.appendChild(errorMessage);
  errorContainer.appendChild(techInfo);

  // Add to document
  document.body.appendChild(errorContainer);

  // Also log to console for developers
  console.error(`Missing Firebase configuration: ${missingKeys.join(', ')}`);
};

// Get config with fallbacks and validation
const getFirebaseConfig = (): FirebaseConfig => {
  try {
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
      // Display user-friendly error and throw error to halt initialization
      if (typeof document !== 'undefined') {
        displayConfigError(missingKeys);
      }
      throw new Error(`Missing Firebase configuration: ${missingKeys.join(', ')}`);
    }

    return config;
  } catch (error: unknown) {
    // Catch any unexpected errors during config processing
    console.error('Error while loading Firebase configuration:', error);
    
    // If we're in a browser context, show error UI
    if (typeof document !== 'undefined') {
      displayConfigError(['Error loading configuration']);
    }
    
    // Rethrow the error to halt initialization
    throw error;
  }
};

// Initialize Firebase with error handling
let app, db, auth, functions;
try {
  app = initializeApp(getFirebaseConfig());
  db = getFirestore(app);
  auth = getAuth(app);
  functions = getFunctions(app);
  
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
} catch (error: unknown) {
  console.error('Firebase initialization failed:', error);
  
  // We've already displayed the error UI in getFirebaseConfig if it's a config error
  // This catch is for other initialization errors
  if (typeof document !== 'undefined' && error instanceof Error && error.message && !error.message.includes('Missing Firebase configuration')) {
    const errorMessage = document.createElement('div');
    errorMessage.textContent = `Firebase initialization failed: ${error.message}`;
    errorMessage.style.color = 'red';
    errorMessage.style.padding = '20px';
    errorMessage.style.fontFamily = 'Arial, sans-serif';
    document.body.appendChild(errorMessage);
  }
  
  // Create empty exports to prevent import errors
  app = null;
  db = null;
  auth = null;
  functions = null;
}

export { app, db, auth, functions };
