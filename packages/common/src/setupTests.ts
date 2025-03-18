// Test setup file for Firebase
import { beforeAll, afterAll } from 'vitest';
import { getFirestore, terminate, Firestore } from 'firebase/firestore';
import { initializeApp, FirebaseApp } from 'firebase/app';

// Properly typed Firebase config
interface TestFirebaseConfig {
  projectId: string;
  apiKey: string;
}

// Mock config and setup for tests
const firebaseConfig: TestFirebaseConfig = {
  projectId: 'test-project',
  apiKey: 'test-api-key',
};

let app: FirebaseApp;
let db: Firestore;

beforeAll(() => {
  // Initialize Firebase for testing
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.warn('Firebase initialized for testing');
});

afterAll(async () => {
  // Clean up Firebase resources
  if (db) {
    await terminate(db);
    console.warn('Firebase resources cleaned up');
  }
});
