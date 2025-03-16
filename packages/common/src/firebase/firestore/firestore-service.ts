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
  
  // Date converter to handle Firestore timestamps
  const dateConverter = {
    toFirestore: (data: any) => {
      const result = { ...data };
      Object.keys(data).forEach((key) => {
        if (data[key] instanceof Date) {
          result[key] = Timestamp.fromDate(data[key]);
        }
      });
      return result;
    },
    fromFirestore: (snapshot: any, options: any) => {
      const data = snapshot.data(options);
      Object.keys(data).forEach((key) => {
        if (data[key] instanceof Timestamp) {
          data[key] = data[key].toDate();
        }
      });
      return data;
    },
  };
  
  // TimeEntry collection
  const timeEntriesConverter: FirestoreDataConverter<TimeEntry> = {
    toFirestore: (timeEntry: TimeEntry) => {
      return dateConverter.toFirestore(timeEntry);
    },
    fromFirestore: (snapshot, options) => {
      return dateConverter.fromFirestore(snapshot, options) as TimeEntry;
    },
  };
  
  export const timeEntriesCollection = createCollection<TimeEntry>(
    'timeEntries',
    timeEntriesConverter
  );
  
  // Users collection
  const usersConverter: FirestoreDataConverter<User> = {
    toFirestore: (user: User) => {
      return dateConverter.toFirestore(user);
    },
    fromFirestore: (snapshot, options) => {
      return dateConverter.fromFirestore(snapshot, options) as User;
    },
  };
  
  export const usersCollection = createCollection<User>(
    'users',
    usersConverter
  );
  
  // Companies collection
  const companiesConverter: FirestoreDataConverter<Company> = {
    toFirestore: (company: Company) => {
      return dateConverter.toFirestore(company);
    },
    fromFirestore: (snapshot, options) => {
      return dateConverter.fromFirestore(snapshot, options) as Company;
    },
  };
  
  export const companiesCollection = createCollection<Company>(
    'companies',
    companiesConverter
  );
  
  // UserStats collection
  const userStatsConverter: FirestoreDataConverter<UserStats> = {
    toFirestore: (userStats: UserStats) => {
      return dateConverter.toFirestore(userStats);
    },
    fromFirestore: (snapshot, options) => {
      return dateConverter.fromFirestore(snapshot, options) as UserStats;
    },
  };
  
  export const userStatsCollection = createCollection<UserStats>(
    'userStats',
    userStatsConverter
  );
  
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
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    } as any);
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
    
    return querySnapshot.docs.map((doc) => doc.data());
  }
  
  // Subscribe to document changes
  export function subscribeToDocument<T>(
    collection: CollectionReference<T>,
    id: string,
    callback: (data: T | null) => void
  ): () => void {
    const docRef = doc(collection, id) as DocumentReference<T>;
    
    return onSnapshot(docRef, (docSnapshot) => {
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
      const results = querySnapshot.docs.map((doc) => doc.data());
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
    ): () => void => {
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
    ): () => void => {
      return subscribeToDocument(userStatsCollection, userId, callback);
    },
  };