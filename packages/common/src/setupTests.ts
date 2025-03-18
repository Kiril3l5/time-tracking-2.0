// @ts-nocheck - Ignore type issues while we complete the migration
import { beforeAll, afterAll, vi } from 'vitest';
import { getFirestore, terminate } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

// Mock config and setup for tests
const firebaseConfig = {
  projectId: 'test-project',
  apiKey: 'test-api-key',
};

beforeAll(() => {
  // Initialize Firebase for testing
  initializeApp(firebaseConfig);
  console.log('Firebase initialized for testing');
});

afterAll(() => {
  // Clean up Firebase resources
  const db = getFirestore();
  terminate(db);
  console.log('Firebase resources cleaned up');
});
