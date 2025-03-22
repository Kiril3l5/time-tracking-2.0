#!/usr/bin/env node

/**
 * Firebase Type Definitions Module
 * 
 * Generates and manages TypeScript type definitions for Firebase testing.
 * This module is used to create mock type definitions for Firebase services,
 * making it easier to test Firebase-related functionality without connecting
 * to actual Firebase services.
 * 
 * Features:
 * - Generate mock Firebase type definitions for testing
 * - Support for Firestore, Auth, Storage, and other Firebase services
 * - Auto-detection of Firebase SDK version for compatibility
 * - Validate test type definitions against actual Firebase types
 * 
 * @module test-types/firebase-type-def
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as logger from '../core/logger.js';
import * as commandRunner from '../core/command-runner.js';

// Base Firebase mock type definitions
const FIREBASE_MOCK_BASE = `
// Generated Firebase mock type definitions for testing
// This file should not be edited manually

interface FirebaseApp {
  name: string;
  options: Record<string, any>;
  automaticDataCollectionEnabled: boolean;
}

interface FirebaseAuth {
  app: FirebaseApp;
  currentUser: FirebaseUser | null;
  languageCode: string | null;
  settings: AuthSettings;
  
  onAuthStateChanged(nextOrObserver: (user: FirebaseUser | null) => void): () => void;
  signInWithEmailAndPassword(email: string, password: string): Promise<UserCredential>;
  signOut(): Promise<void>;
  createUserWithEmailAndPassword(email: string, password: string): Promise<UserCredential>;
}

interface FirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
  refreshToken: string;
  
  getIdToken(forceRefresh?: boolean): Promise<string>;
  delete(): Promise<void>;
}

interface UserCredential {
  user: FirebaseUser;
  providerId: string | null;
  operationType: string;
}

interface AuthSettings {
  appVerificationDisabledForTesting: boolean;
}

// Firestore types
interface Firestore {
  app: FirebaseApp;
  collection(path: string): CollectionReference;
  doc(path: string): DocumentReference;
  batch(): WriteBatch;
  runTransaction<T>(updateFunction: (transaction: Transaction) => Promise<T>): Promise<T>;
}

interface CollectionReference extends Query {
  id: string;
  path: string;
  doc(documentPath?: string): DocumentReference;
  add(data: DocumentData): Promise<DocumentReference<DocumentData>>;
}

interface DocumentReference<T = DocumentData> {
  id: string;
  path: string;
  collection(collectionPath: string): CollectionReference;
  get(): Promise<DocumentSnapshot<T>>;
  set(data: T, options?: SetOptions): Promise<void>;
  update(data: Partial<T>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(observer: {
    next?: (snapshot: DocumentSnapshot<T>) => void;
    error?: (error: Error) => void;
    complete?: () => void;
  }): () => void;
}

interface Query<T = DocumentData> {
  where(fieldPath: string, opStr: WhereFilterOp, value: unknown): Query<T>;
  orderBy(fieldPath: string, directionStr?: OrderByDirection): Query<T>;
  limit(limit: number): Query<T>;
  startAfter(snapshot: DocumentSnapshot<unknown>): Query<T>;
  endBefore(snapshot: DocumentSnapshot<unknown>): Query<T>;
  get(): Promise<QuerySnapshot<T>>;
  onSnapshot(observer: {
    next?: (snapshot: QuerySnapshot<T>) => void;
    error?: (error: Error) => void;
    complete?: () => void;
  }): () => void;
}

interface DocumentData {
  [key: string]: any;
}

interface DocumentSnapshot<T = DocumentData> {
  id: string;
  ref: DocumentReference<T>;
  exists: boolean;
  data(): T | undefined;
  get(fieldPath: string): unknown;
}

interface QuerySnapshot<T = DocumentData> {
  docs: Array<DocumentSnapshot<T>>;
  empty: boolean;
  size: number;
  forEach(callback: (result: DocumentSnapshot<T>) => void): void;
}

interface WriteBatch {
  set<T>(reference: DocumentReference<T>, data: T): WriteBatch;
  update<T>(reference: DocumentReference<T>, data: Partial<T>): WriteBatch;
  delete(reference: DocumentReference<unknown>): WriteBatch;
  commit(): Promise<void>;
}

interface Transaction {
  get<T>(reference: DocumentReference<T>): Promise<DocumentSnapshot<T>>;
  set<T>(reference: DocumentReference<T>, data: T): Transaction;
  update<T>(reference: DocumentReference<T>, data: Partial<T>): Transaction;
  delete(reference: DocumentReference<unknown>): Transaction;
}

type WhereFilterOp = 
  | '<' 
  | '<=' 
  | '==' 
  | '>=' 
  | '>' 
  | 'array-contains' 
  | 'array-contains-any' 
  | 'in' 
  | 'not-in';

type OrderByDirection = 'asc' | 'desc';

interface SetOptions {
  merge?: boolean;
  mergeFields?: Array<string>;
}

// Storage types
interface FirebaseStorage {
  app: FirebaseApp;
  ref(path?: string): StorageReference;
  refFromURL(url: string): StorageReference;
}

interface StorageReference {
  bucket: string;
  fullPath: string;
  name: string;
  parent: StorageReference | null;
  root: StorageReference;
  
  child(path: string): StorageReference;
  put(data: Blob | Uint8Array | ArrayBuffer, metadata?: UploadMetadata): UploadTask;
  putString(data: string, format?: string, metadata?: UploadMetadata): UploadTask;
  delete(): Promise<void>;
  getDownloadURL(): Promise<string>;
  getMetadata(): Promise<FullMetadata>;
  updateMetadata(metadata: SettableMetadata): Promise<FullMetadata>;
  listAll(): Promise<ListResult>;
}

interface UploadMetadata {
  contentType?: string;
  customMetadata?: Record<string, string>;
}

interface FullMetadata extends UploadMetadata {
  bucket: string;
  fullPath: string;
  generation: string;
  metageneration: string;
  name: string;
  size: number;
  timeCreated: string;
  updated: string;
}

type SettableMetadata = UploadMetadata;

interface ListResult {
  items: StorageReference[];
  prefixes: StorageReference[];
  nextPageToken: string | null;
}

interface UploadTask {
  snapshot: UploadTaskSnapshot;
  on(
    event: string,
    nextOrObserver?: unknown,
    error?: (error: Error) => void,
    complete?: () => void
  ): () => void;
  then(
    onFulfilled?: (snapshot: UploadTaskSnapshot) => unknown,
    onRejected?: (error: Error) => unknown
  ): Promise<unknown>;
  catch(onRejected: (error: Error) => unknown): Promise<unknown>;
  resume(): boolean;
  pause(): boolean;
  cancel(): boolean;
}

interface UploadTaskSnapshot {
  bytesTransferred: number;
  totalBytes: number;
  state: string;
  metadata: FullMetadata;
  ref: StorageReference;
  task: UploadTask;
}

// Export these types for use in tests
export {
  FirebaseApp,
  FirebaseAuth,
  FirebaseUser,
  UserCredential,
  AuthSettings,
  Firestore,
  CollectionReference,
  DocumentReference,
  Query,
  DocumentData,
  DocumentSnapshot,
  QuerySnapshot,
  WriteBatch,
  Transaction,
  WhereFilterOp,
  OrderByDirection,
  SetOptions,
  FirebaseStorage,
  StorageReference,
  UploadMetadata,
  FullMetadata,
  SettableMetadata,
  ListResult,
  UploadTask,
  UploadTaskSnapshot
};
`;

/**
 * Generate Firebase mock type definitions file
 * 
 * @param {Object} options - Options for generating the mock definitions
 * @param {string} options.outputPath - Output path for the generated file (relative to project root)
 * @param {boolean} [options.includeComments=true] - Whether to include descriptive comments
 * @param {boolean} [options.detectVersion=true] - Whether to detect Firebase SDK version
 * @param {string[]} [options.services] - Optional array of specific Firebase services to include
 * @param {boolean} [options.verbose=false] - Enable verbose output
 * @returns {Promise<string>} - Path to the generated file
 */
export async function generateFirebaseMockTypes(options) {
  const {
    outputPath = 'src/tests/types/firebase-mocks.d.ts',
    includeComments = true,
    detectVersion = true,
    services = ['auth', 'firestore', 'storage'],
    verbose = false
  } = options;
  
  logger.info(`Generating Firebase mock type definitions...`);
  
  try {
    // Ensure the directory exists
    const dirPath = path.dirname(outputPath);
    await fs.mkdir(dirPath, { recursive: true });
    
    // Start with the base definitions
    let content = FIREBASE_MOCK_BASE;
    
    // Detect Firebase SDK version if requested
    let detectedVersion = null;
    if (detectVersion) {
      try {
        const packageJsonPath = 'package.json';
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        
        // Check for Firebase dependencies
        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
        const firebasePkg = dependencies['firebase'] || dependencies['@firebase/app'];
        
        if (firebasePkg) {
          // Extract version (remove ^ or ~ if present)
          detectedVersion = firebasePkg.replace(/[\^~]/, '');
          logger.info(`Detected Firebase SDK version: ${detectedVersion}`);
          
          // Add version information to the generated file
          content = `// Generated for Firebase SDK version ${detectedVersion}\n${content}`;
        }
      } catch (error) {
        logger.warn(`Could not detect Firebase SDK version: ${error.message}`);
      }
    }
    
    // Write the file
    await fs.writeFile(outputPath, content, 'utf-8');
    logger.success(`Firebase mock type definitions generated at: ${outputPath}`);
    
    if (verbose) {
      logger.info(`Included services: ${services.join(', ')}`);
      logger.info(`File size: ${content.length} bytes`);
    }
    
    return outputPath;
  } catch (error) {
    logger.error(`Failed to generate Firebase mock type definitions: ${error.message}`);
    throw error;
  }
}

/**
 * Validate the generated mock types against actual Firebase types
 * 
 * @param {Object} options - Validation options
 * @param {string} options.mockTypesPath - Path to the mock type definitions
 * @param {boolean} [options.verbose=false] - Enable verbose output
 * @returns {Promise<boolean>} - Whether validation was successful
 */
export async function validateFirebaseMockTypes(options) {
  const {
    mockTypesPath = 'src/tests/types/firebase-mocks.d.ts',
    verbose = false
  } = options;
  
  logger.info(`Validating Firebase mock type definitions...`);
  
  try {
    // Create a temporary validation file
    const validationFilePath = 'temp-firebase-validation.ts';
    
    // Content to validate the mock types against real Firebase usage
    const validationContent = `
    // Temporary file to validate Firebase mock types
    import * as firebase from 'firebase/app';
    import 'firebase/auth';
    import 'firebase/firestore';
    import 'firebase/storage';
    
    // Import the mock types
    /// <reference path="${mockTypesPath}" />
    
    // Test type compatibility
    function testTypes() {
      // Initialize app
      const app: FirebaseApp = firebase.initializeApp({
        apiKey: 'test',
        authDomain: 'test.firebaseapp.com',
        projectId: 'test'
      });
      
      // Auth tests
      const auth: FirebaseAuth = firebase.auth();
      auth.onAuthStateChanged(user => {
        if (user) {
          const token = user.getIdToken();
        }
      });
      
      // Firestore tests
      const db: Firestore = firebase.firestore();
      const docRef: DocumentReference = db.collection('users').doc('user1');
      docRef.get().then(snapshot => {
        if (snapshot.exists) {
          const data = snapshot.data();
        }
      });
      
      // Storage tests
      const storage: FirebaseStorage = firebase.storage();
      const storageRef: StorageReference = storage.ref('images/logo.png');
      storageRef.getDownloadURL().then(url => {
        console.log(url);
      });
    }
    `;
    
    await fs.writeFile(validationFilePath, validationContent, 'utf-8');
    
    // Run TypeScript compiler for validation
    logger.info(`Running TypeScript compiler to validate mock types...`);
    const result = await commandRunner.runCommandAsync(`npx tsc ${validationFilePath} --noEmit`, {
      ignoreError: true,
      verbose
    });
    
    // Cleanup
    await fs.unlink(validationFilePath);
    
    if (result.success) {
      logger.success(`Firebase mock types validation successful!`);
      return true;
    } else {
      logger.error(`Firebase mock types validation failed with errors:`);
      logger.error(result.error || result.output);
      return false;
    }
  } catch (error) {
    logger.error(`Failed to validate Firebase mock types: ${error.message}`);
    return false;
  }
}

export default {
  generateFirebaseMockTypes,
  validateFirebaseMockTypes
}; 