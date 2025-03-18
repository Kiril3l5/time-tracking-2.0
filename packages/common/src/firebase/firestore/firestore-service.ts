import {
  collection,
  CollectionReference,
  doc,
  DocumentReference,
  FirestoreDataConverter,
  getDoc,
  getDocs,
  query,
  QueryConstraint,
  setDoc,
  updateDoc,
  deleteDoc,
  DocumentData,
  Timestamp,
  serverTimestamp,
  onSnapshot,
  QuerySnapshot,
  where,
  SnapshotOptions,
  DocumentSnapshot
} from 'firebase/firestore';
import { db } from '../core/firebase';
import { TimeEntry, User, Company, UserStats } from '../../types/firestore';

// Type-safe collection references with converters
// This ensures type safety throughout your Firestore operations

// Helper function to create a typed collection reference
function createCollection<T extends DocumentData>(
  collectionName: string,
  converter: FirestoreDataConverter<T>
) {
  return collection(db, collectionName).withConverter(converter);
}

// Define interface for objects that can contain Date fields
interface DateFields {
  [key: string]: any;
}

// Date converter to handle Firestore timestamps
const dateConverter = {
  toFirestore: <T extends DateFields>(data: T): DocumentData => {
    // Create a copy to avoid direct modification
    const result: Record<string, any> = { ...data };
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (value instanceof Date) {
        result[key] = Timestamp.fromDate(value);
      }
    });
    
    return result;
  },
  fromFirestore: <T extends DateFields>(
    snapshot: DocumentSnapshot<DocumentData>,
    options: SnapshotOptions
  ): T => {
    // Create a copy to avoid direct modification
    const result: Record<string, any> = { ...snapshot.data(options) };
    
    Object.keys(result).forEach(key => {
      const value = result[key];
      if (value instanceof Timestamp) {
        result[key] = value.toDate();
      }
    });
    
    return result as T;
  },
};

// TimeEntry collection
const timeEntriesConverter: FirestoreDataConverter<TimeEntry> = {
  toFirestore: (timeEntry: TimeEntry) => {
    return dateConverter.toFirestore<TimeEntry>(timeEntry);
  },
  fromFirestore: (snapshot, options) => {
    return dateConverter.fromFirestore<TimeEntry>(snapshot, options || {});
  },
};

export const timeEntriesCollection = createCollection<TimeEntry>(
  'timeEntries',
  timeEntriesConverter
);

// Users collection
const usersConverter: FirestoreDataConverter<User> = {
  toFirestore: (user: User) => {
    return dateConverter.toFirestore<User>(user);
  },
  fromFirestore: (snapshot, options) => {
    return dateConverter.fromFirestore<User>(snapshot, options || {});
  },
};

export const usersCollection = createCollection<User>('users', usersConverter);

// Companies collection
const companiesConverter: FirestoreDataConverter<Company> = {
  toFirestore: (company: Company) => {
    return dateConverter.toFirestore<Company>(company);
  },
  fromFirestore: (snapshot, options) => {
    return dateConverter.fromFirestore<Company>(snapshot, options || {});
  },
};

export const companiesCollection = createCollection<Company>('companies', companiesConverter);

// UserStats collection
const userStatsConverter: FirestoreDataConverter<UserStats> = {
  toFirestore: (userStats: UserStats) => {
    return dateConverter.toFirestore<UserStats>(userStats);
  },
  fromFirestore: (snapshot, options) => {
    return dateConverter.fromFirestore<UserStats>(snapshot, options || {});
  },
};

export const userStatsCollection = createCollection<UserStats>('userStats', userStatsConverter);

// Generic CRUD operations

// Create a document with specified ID
export async function createDocumentWithId<T extends { id: string }>(
  collection: CollectionReference<T>,
  data: T
): Promise<void> {
  const docRef = doc(collection, data.id);
  await setDoc(docRef, data);
}

// Create a document with auto-generated ID
export async function createDocument<T extends { id: string }>(
  collection: CollectionReference<T>,
  data: Omit<T, 'id'>
): Promise<T> {
  const docRef = doc(collection) as DocumentReference<T>;
  const newData = {
    ...data,
    id: docRef.id,
  } as T;
  await setDoc(docRef, newData);
  return newData;
}

// Get a document by ID
export async function getDocument<T>(
  collection: CollectionReference<T>,
  id: string
): Promise<T | null> {
  const docRef = doc(collection, id) as DocumentReference<T>;
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data();
  }

  return null;
}

// Update a document
export async function updateDocument<T extends { id: string }>(
  collection: CollectionReference<T>,
  id: string,
  data: Partial<T>
): Promise<void> {
  const docRef = doc(collection, id) as DocumentReference<T>;
  // Use a properly typed object for the update
  const updateData: DocumentData = {
    ...data,
    updatedAt: serverTimestamp(),
  };
  await updateDoc(docRef, updateData);
}

// Delete a document
export async function deleteDocument<T>(
  collection: CollectionReference<T>,
  id: string
): Promise<void> {
  const docRef = doc(collection, id) as DocumentReference<T>;
  await deleteDoc(docRef);
}

// Query documents
export async function queryDocuments<T>(
  collection: CollectionReference<T>,
  ...queryConstraints: QueryConstraint[]
): Promise<T[]> {
  const q = query(collection, ...queryConstraints);
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map(doc => doc.data());
}

// Subscribe to document changes
export function subscribeToDocument<T>(
  collection: CollectionReference<T>,
  id: string,
  callback: (data: T | null) => void
): () => void {
  const docRef = doc(collection, id) as DocumentReference<T>;

  return onSnapshot(docRef, docSnapshot => {
    if (docSnapshot.exists()) {
      callback(docSnapshot.data());
    } else {
      callback(null);
    }
  });
}

// Subscribe to query changes
export function subscribeToQuery<T>(
  collection: CollectionReference<T>,
  callback: (data: T[]) => void,
  ...queryConstraints: QueryConstraint[]
): () => void {
  const q = query(collection, ...queryConstraints);

  return onSnapshot(q, (querySnapshot: QuerySnapshot<T>) => {
    const results = querySnapshot.docs.map(doc => doc.data());
    callback(results);
  });
}

// TimeEntry specific operations
export const timeEntryService = {
  // Get time entries for a specific user and week
  getUserWeekEntries: async (userId: string, yearWeek: string): Promise<TimeEntry[]> => {
    return queryDocuments(
      timeEntriesCollection,
      where('userId', '==', userId),
      where('yearWeek', '==', yearWeek)
    );
  },

  // Subscribe to a user's time entries for a specific week
  subscribeToUserWeekEntries: (
    userId: string,
    yearWeek: string,
    callback: (entries: TimeEntry[]) => void
  ): (() => void) => {
    return subscribeToQuery(
      timeEntriesCollection,
      callback,
      where('userId', '==', userId),
      where('yearWeek', '==', yearWeek)
    );
  },

  // Submit time entries for approval
  submitForApproval: async (entryIds: string[]): Promise<void> => {
    // In a real app, you would use a batched write here
    for (const id of entryIds) {
      await updateDocument(timeEntriesCollection, id, {
        submitted: true,
        submittedAt: new Date(),
      } as Partial<TimeEntry>);
    }
  },

  // Get time entries for a specific project
  getProjectEntries: async (projectId: string): Promise<TimeEntry[]> => {
    return queryDocuments(
      timeEntriesCollection,
      where('projectId', '==', projectId)
    );
  },

  // Get time entries that need approval for a specific manager
  getEntriesNeedingApproval: async (managerId: string): Promise<TimeEntry[]> => {
    return queryDocuments(
      timeEntriesCollection,
      where('submitted', '==', true),
      where('approved', '==', false),
      where('managerId', '==', managerId)
    );
  },
};

// Company specific operations
export const companyService = {
  // Get a company and its week configuration
  getCompany: async (companyId: string): Promise<Company | null> => {
    return getDocument(companiesCollection, companyId);
  },
};

// User specific operations
export const userService = {
  // Get team members (users with the same managerId)
  getTeamMembers: async (managerId: string): Promise<User[]> => {
    return queryDocuments(
      usersCollection,
      where('managerId', '==', managerId),
      where('isActive', '==', true)
    );
  },

  // Update user profile
  updateUserProfile: async (userId: string, profileData: Partial<User>): Promise<void> => {
    await updateDocument(usersCollection, userId, profileData);
  },
};

// UserStats specific operations
export const userStatsService = {
  // Get user stats
  getUserStats: async (userId: string): Promise<UserStats | null> => {
    return getDocument(userStatsCollection, userId);
  },

  // Subscribe to user stats changes
  subscribeToUserStats: (
    userId: string,
    callback: (stats: UserStats | null) => void
  ): (() => void) => {
    return subscribeToDocument(userStatsCollection, userId, callback);
  },
};
