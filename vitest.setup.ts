/**
 * Vitest setup file for global test configuration
 * Sets up mocks and testing utilities for the entire test suite
 */

// @ts-nocheck - Ignore type checking for setup file
import { expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import * as React from 'react';
import fs from 'fs';
import path from 'path';

// Ensure React is globally available for tests
global.React = React;

// Fix JSX runtime if needed
try {
  const reactDir = path.resolve(process.cwd(), 'node_modules/react');
  const jsxRuntimePath = path.join(reactDir, 'jsx-runtime.js');
  const jsxDevRuntimePath = path.join(reactDir, 'jsx-dev-runtime.js');
  
  if (!fs.existsSync(jsxRuntimePath) && fs.existsSync(jsxDevRuntimePath)) {
    console.log('Creating jsx-runtime.js from jsx-dev-runtime.js in setup...');
    fs.copyFileSync(jsxDevRuntimePath, jsxRuntimePath);
    
    // Also copy the .js.map if it exists
    const jsxDevRuntimeMapPath = path.join(reactDir, 'jsx-dev-runtime.js.map');
    const jsxRuntimeMapPath = path.join(reactDir, 'jsx-runtime.js.map');
    if (fs.existsSync(jsxDevRuntimeMapPath)) {
      fs.copyFileSync(jsxDevRuntimeMapPath, jsxRuntimeMapPath);
    }
  }
} catch (error) {
  console.warn('Failed to fix JSX runtime in setup:', error.message);
}

// Clean up after each test
afterEach(() => {
  cleanup();
});

// Note: With jest-dom properly imported, we can remove our custom matchers
// as they are now provided by jest-dom

// Mock browser APIs
if (typeof window !== 'undefined') {
  // Mock ResizeObserver
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // Mock matchMedia
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  });
}

// Firebase mocks
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: null,
  })),
  onAuthStateChanged: vi.fn(() => vi.fn()),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  startAfter: vi.fn(() => ({})),
  endBefore: vi.fn(() => ({})),
  getDocs: vi.fn(() => ({ docs: [] })),
  getDoc: vi.fn(() => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({})),
}));
