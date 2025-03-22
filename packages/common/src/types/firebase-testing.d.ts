/**
 * Type definitions for Firebase Testing utilities
 * Used in the firestore-rules.test.ts file
 * 
 * IMPORTANT: This file only provides type definitions for the Firebase testing utilities.
 * The custom matchers (toAllow, toDeny) are defined in vitest.d.ts using proper module augmentation.
 * 
 * This separation of concerns is intentional:
 * - This file focuses on Firebase-specific interfaces
 * - vitest.d.ts handles extending Vitest's types using declaration merging
 * 
 * See the TypeScript Testing Guide for more details on this approach.
 */

declare module '@firebase/rules-unit-testing' {
  export interface RulesTestContext {
    firestore(): FirebaseFirestore;
  }

  export interface RulesTestEnvironment {
    firestore(): FirebaseFirestore;
    authenticatedContext(uid: string, options?: Record<string, unknown>): RulesTestContext;
    unauthenticatedContext(): RulesTestContext;
    withSecurityRulesDisabled(fn: (context: RulesTestContext) => Promise<void>): Promise<void>;
    cleanup(): Promise<void>;
  }

  export function initializeTestEnvironment(options: {
    projectId: string;
    firestore: {
      rules: string;
      host: string;
      port: number;
    }
  }): Promise<RulesTestEnvironment>;
}

// Firebase Firestore type definitions
interface FirebaseFirestore {
  collection(path: string): FirebaseCollection;
}

interface FirebaseCollection {
  doc(path?: string): FirebaseDocument;
}

interface FirebaseDocument {
  set(data: Record<string, unknown>): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
  get(): Promise<unknown>;
  delete(): Promise<unknown>;
}