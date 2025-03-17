# Firebase Data Access Patterns

## 1. Purpose and Scope

This guide documents the recommended data access patterns for the Time Tracking System, focusing on efficient and scalable interaction with Firebase services. It covers:

- Firestore data modeling and access strategies
- React Query integration for state management
- Optimistic UI updates for responsive user experience
- Batching and transaction patterns for data consistency
- Performance optimization techniques
- Offline data handling

These patterns align with the system architecture, State Management Guide, and Time Entry Workflow to ensure consistent implementation across both the /hours and /admin sites.

## 2. Firestore Data Access Fundamentals

### 2.1 Core Access Patterns

The application employs three primary data access patterns:

| Pattern | Description | Best Used For | Implementation |
|---------|-------------|---------------|----------------|
| **Real-time Listeners** | Live data subscription that pushes updates | Active time entries, approvals in progress | `onSnapshot()` with React Query's `useQuery` |
| **One-time Reads** | Single fetch of data | Reports, historical data, reference data | `getDocs()` or `getDoc()` with React Query's `useQuery` |
| **Paginated Queries** | Fetch data in chunks | Large lists, search results, reports | `startAfter()` with React Query's `useInfiniteQuery` |

### 2.2 Data Access Layer Structure

All Firebase interactions are abstracted through a service layer:

```
src/
└── firebase/
    ├── config.ts             # Firebase initialization
    ├── service/
    │   ├── timeEntries.ts    # Time entry operations
    │   ├── users.ts          # User operations
    │   ├── companies.ts      # Company operations
    │   ├── reports.ts        # Report operations
    │   └── index.ts          # Service exports
    └── hooks/
        ├── useTimeEntries.ts # Time entry hooks
        ├── useUsers.ts       # User hooks
        └── ...
```

### 2.3 Service Layer Implementation

Each service follows a consistent pattern:

```typescript
// Example: timeEntriesService.ts
import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  getDocs, getDoc, query, where, orderBy, limit,
  onSnapshot, writeBatch, runTransaction
} from 'firebase/firestore';
import { db } from '../config';
import { TimeEntry } from '@/types';

export const timeEntriesService = {
  // Create a new time entry
  async create(entry: Omit<TimeEntry, 'id'>): Promise<string> {
    const docRef = await addDoc(collection(db, 'timeEntries'), {
      ...entry,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  },

  // Get a time entry by ID
  async getById(id: string): Promise<TimeEntry | null> {
    const docSnap = await getDoc(doc(db, 'timeEntries', id));
    
    if (docSnap.exists()) {
      return { 
        id: docSnap.id, 
        ...docSnap.data() 
      } as TimeEntry;
    }
    
    return null;
  },

  // Update a time entry
  async update(id: string, data: Partial<TimeEntry>): Promise<void> {
    await updateDoc(doc(db, 'timeEntries', id), {
      ...data,
      updatedAt: serverTimestamp()
    });
  },
  
  // Get real-time listener for time entries matching query
  onQueryChange(
    queryConstraints: QueryConstraint[],
    onNext: (entries: TimeEntry[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const q = query(
      collection(db, 'timeEntries'),
      ...queryConstraints
    );
    
    return onSnapshot(
      q,
      (snapshot) => {
        const entries = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as TimeEntry[];
        
        onNext(entries);
      },
      onError
    );
  },
  
  // Additional methods as needed...
};
```

## 3. React Query Integration

React Query provides a robust caching and state management layer on top of the Firebase service layer.

### 3.1 Query Hooks Pattern

```typescript
// Example: useTimeEntries.ts
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { timeEntriesService } from '../service';
import { useAuth } from '@/hooks/useAuth';
import { where, orderBy, limit } from 'firebase/firestore';

// Get time entries for the current week
export function useWeekTimeEntries(startDate: Date, endDate: Date) {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid;

  return useQuery({
    queryKey: ['timeEntries', 'week', userId, startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      if (!userId) return [];
      
      // Convert dates to Firestore format
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      // Get entries within date range for the current user
      const constraints = [
        where('userId', '==', userId),
        where('date', '>=', startDateStr),
        where('date', '<=', endDateStr),
        orderBy('date', 'asc')
      ];
      
      return new Promise((resolve, reject) => {
        const unsubscribe = timeEntriesService.onQueryChange(
          constraints,
          (entries) => {
            resolve(entries);
          },
          (error) => {
            reject(error);
          }
        );
        
        // React Query will call this when the query is no longer in use
        return () => unsubscribe();
      });
    },
    enabled: !!userId,
  });
}

// Create a new time entry with optimistic updates
export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  
  return useMutation({
    mutationFn: (newEntry: Omit<TimeEntry, 'id'>) => {
      return timeEntriesService.create(newEntry);
    },
    // When mutate is called:
    onMutate: async (newEntry) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['timeEntries', 'week']
      });
      
      // Create optimistic entry (with temporary ID)
      const optimisticEntry: TimeEntry = {
        id: `temp-${Date.now()}`,
        ...newEntry,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Add optimistic entry to queries that include this week
      const queryKeyPattern = ['timeEntries', 'week', currentUser?.uid];
      
      queryClient.setQueriesData(
        { queryKey: queryKeyPattern, exact: false },
        (old: TimeEntry[] | undefined) => {
          return old ? [...old, optimisticEntry] : [optimisticEntry];
        }
      );
      
      return { optimisticEntry };
    },
    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (err, newEntry, context) => {
      if (context?.optimisticEntry) {
        // Remove the optimistic entry from the cache
        const queryKeyPattern = ['timeEntries', 'week', currentUser?.uid];
        
        queryClient.setQueriesData(
          { queryKey: queryKeyPattern, exact: false },
          (old: TimeEntry[] | undefined) => {
            return old ? old.filter(entry => entry.id !== context.optimisticEntry.id) : [];
          }
        );
      }
    },
    // Always refetch after error or success:
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['timeEntries', 'week']
      });
    },
  });
}
```

### 3.2 Real-time Updates Pattern

For real-time updates, we use a custom hook pattern that integrates Firestore listeners with React Query:

```typescript
// Generic real-time query hook
function useRealtimeQuery<T>(
  queryKey: unknown[],
  getQueryConstraints: () => QueryConstraint[],
  collectionName: string,
  options = {}
) {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey,
    queryFn: () => {
      return new Promise<T[]>((resolve) => {
        // This will be called only once per query
        resolve([]);
      });
    },
    ...options,
    // This ensures the following effect runs
    enabled: true,
  });
}

// Usage in components
export function TimeEntriesList({ startDate, endDate }) {
  const userId = currentUser.uid;
  const queryKey = ['timeEntries', 'realtime', userId, startDate, endDate];
  
  // Set up initial fetch
  const { data, isLoading, error } = useRealtimeQuery(
    queryKey,
    () => [
      where('userId', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc')
    ],
    'timeEntries'
  );
  
  // Set up real-time listener
  useEffect(() => {
    if (!userId) return;
    
    const unsubscribe = timeEntriesService.onQueryChange(
      [
        where('userId', '==', userId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'asc')
      ],
      (entries) => {
        // Update React Query cache with the latest entries
        queryClient.setQueryData(queryKey, entries);
      }
    );
    
    return unsubscribe;
  }, [userId, startDate, endDate, queryClient, queryKey]);
  
  // Render with the data
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  
  return (
    <div className="entries-list">
      {data.map(entry => (
        <TimeEntryItem key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
```

## 4. Optimistic UI Updates

Optimistic UI updates provide immediate feedback to users while operations are in progress.

### 4.1 Create Operations

```typescript
export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (newEntry) => {
      return await timeEntriesService.create(newEntry);
    },
    onMutate: async (newEntry) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries(['timeEntries']);
      
      // Save previous value
      const previousEntries = queryClient.getQueryData(['timeEntries']);
      
      // Add optimistic entry
      queryClient.setQueryData(['timeEntries'], (old = []) => {
        return [...old, { 
          id: 'temp-' + Date.now(),
          ...newEntry,
          createdAt: new Date(),
          updatedAt: new Date()
        }];
      });
      
      // Return context with the optimistic entry
      return { previousEntries };
    },
    onError: (err, newEntry, context) => {
      // Restore previous state on error
      queryClient.setQueryData(['timeEntries'], context.previousEntries);
      showErrorNotification('Failed to create time entry');
    },
    onSuccess: (result) => {
      showSuccessNotification('Time entry created');
    },
    onSettled: () => {
      // Always refetch to ensure cache is in sync
      queryClient.invalidateQueries(['timeEntries']);
    },
  });
}
```

### 4.2 Update Operations

```typescript
export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }) => {
      return await timeEntriesService.update(id, data);
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries(['timeEntries']);
      
      const previousEntries = queryClient.getQueryData(['timeEntries']);
      
      queryClient.setQueryData(['timeEntries'], (old = []) => {
        return old.map(entry => 
          entry.id === id 
            ? { ...entry, ...data, updatedAt: new Date() }
            : entry
        );
      });
      
      return { previousEntries };
    },
    onError: (err, { id, data }, context) => {
      queryClient.setQueryData(['timeEntries'], context.previousEntries);
      showErrorNotification('Failed to update time entry');
    },
    onSuccess: () => {
      showSuccessNotification('Time entry updated');
    },
    onSettled: () => {
      queryClient.invalidateQueries(['timeEntries']);
    },
  });
}
```

### 4.3 Delete Operations

```typescript
export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id) => {
      return await timeEntriesService.delete(id);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries(['timeEntries']);
      
      const previousEntries = queryClient.getQueryData(['timeEntries']);
      
      queryClient.setQueryData(['timeEntries'], (old = []) => {
        return old.filter(entry => entry.id !== id);
      });
      
      return { previousEntries };
    },
    onError: (err, id, context) => {
      queryClient.setQueryData(['timeEntries'], context.previousEntries);
      showErrorNotification('Failed to delete time entry');
    },
    onSuccess: () => {
      showSuccessNotification('Time entry deleted');
    },
    onSettled: () => {
      queryClient.invalidateQueries(['timeEntries']);
    },
  });
}
```

## 5. Batch Operations and Transactions

### 5.1 Batch Writes

Used for multiple write operations that must succeed or fail together, but don't depend on reading the latest data.

```typescript
export async function approveMultipleTimeEntries(entryIds: string[]) {
  if (entryIds.length === 0) return;
  
  const batch = writeBatch(db);
  
  // Add each entry to the batch
  entryIds.forEach(id => {
    const entryRef = doc(db, 'timeEntries', id);
    batch.update(entryRef, {
      status: 'approved',
      managerApproved: true,
      managerId: currentUser.uid,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    });
  });
  
  // Commit the batch
  await batch.commit();
  
  // Update UI
  queryClient.invalidateQueries(['timeEntries']);
}
```

### 5.2 Transactions

Used when an operation depends on the current state of the document.

```typescript
export async function transferHoursToTimeOff(
  entryId: string, 
  regularHoursToConvert: number
) {
  await runTransaction(db, async (transaction) => {
    // Read the entry
    const entryRef = doc(db, 'timeEntries', entryId);
    const entrySnap = await transaction.get(entryRef);
    
    if (!entrySnap.exists()) {
      throw new Error('Time entry not found');
    }
    
    const entry = entrySnap.data();
    
    // Ensure there are enough regular hours to convert
    if (entry.regularHours < regularHoursToConvert) {
      throw new Error('Not enough regular hours to convert');
    }
    
    // Calculate new values
    const newRegularHours = entry.regularHours - regularHoursToConvert;
    const newPtoHours = (entry.ptoHours || 0) + regularHoursToConvert;
    
    // Update the entry
    transaction.update(entryRef, {
      regularHours: newRegularHours,
      ptoHours: newPtoHours,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    });
    
    // Also update user's PTO balance
    const userStatsRef = doc(db, 'userStats', entry.userId);
    const userStatsSnap = await transaction.get(userStatsRef);
    
    if (userStatsSnap.exists()) {
      const stats = userStatsSnap.data();
      transaction.update(userStatsRef, {
        totalPtoUsed: (stats.totalPtoUsed || 0) + regularHoursToConvert,
        updatedAt: serverTimestamp()
      });
    }
  });
  
  // Update UI after transaction completes
  queryClient.invalidateQueries(['timeEntries']);
  queryClient.invalidateQueries(['userStats']);
}
```

## 6. Query Optimization Techniques

### 6.1 Compound Queries

Queries combining multiple conditions require appropriate indexes.

```typescript
// This query requires a compound index on [userId, date, status]
const q = query(
  collection(db, 'timeEntries'),
  where('userId', '==', currentUser.uid),
  where('date', '>=', startOfWeek),
  where('date', '<=', endOfWeek),
  where('status', 'in', ['approved', 'pending']),
  orderBy('date', 'asc')
);
```

### 6.2 Pagination

For large result sets, use pagination to improve performance.

```typescript
export function useTimeEntriesPage(page: number, pageSize: number) {
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  
  // First page query
  const getFirstPage = async () => {
    const q = query(
      collection(db, 'timeEntries'),
      where('userId', '==', currentUser.uid),
      orderBy('date', 'desc'),
      limit(pageSize)
    );
    
    const snapshot = await getDocs(q);
    setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };
  
  // Next page query
  const getNextPage = async () => {
    if (!lastVisible) return [];
    
    const q = query(
      collection(db, 'timeEntries'),
      where('userId', '==', currentUser.uid),
      orderBy('date', 'desc'),
      startAfter(lastVisible),
      limit(pageSize)
    );
    
    const snapshot = await getDocs(q);
    setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };
  
  return useQuery({
    queryKey: ['timeEntries', 'page', page, pageSize, currentUser?.uid],
    queryFn: page === 1 ? getFirstPage : getNextPage,
    keepPreviousData: true,
    enabled: !!currentUser && page > 0
  });
}
```

### 6.3 Infinite Queries

For scroll-based interfaces, use infinite queries.

```typescript
export function useInfiniteTimeEntries() {
  return useInfiniteQuery({
    queryKey: ['timeEntries', 'infinite', currentUser?.uid],
    queryFn: async ({ pageParam }) => {
      const q = pageParam
        ? query(
            collection(db, 'timeEntries'),
            where('userId', '==', currentUser.uid),
            orderBy('date', 'desc'),
            startAfter(pageParam),
            limit(10)
          )
        : query(
            collection(db, 'timeEntries'),
            where('userId', '==', currentUser.uid),
            orderBy('date', 'desc'),
            limit(10)
          );
      
      const snapshot = await getDocs(q);
      
      return {
        entries: snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })),
        cursor: snapshot.docs[snapshot.docs.length - 1]
      };
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: !!currentUser
  });
}
```

## 7. Offline Support

### 7.1 Enabling Offline Persistence

```typescript
// In firebase/config.ts
import { initializeFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
});

// Enable offline persistence
enableIndexedDbPersistence(db)
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab
      console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // Browser doesn't support persistence
      console.warn('Persistence not supported by this browser');
    }
  });
```

### 7.2 Offline/Online Detection

```typescript
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return { isOnline };
}
```

### 7.3 Pending Writes Indicator

```typescript
import { onSnapshotsInSync } from 'firebase/firestore';

export function usePendingWrites() {
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  
  useEffect(() => {
    const unsubscribe = onSnapshotsInSync(db, () => {
      setHasPendingWrites(false);
    });
    
    return unsubscribe;
  }, []);
  
  // Set pending when a write operation is initiated
  const trackWrite = useCallback(() => {
    setHasPendingWrites(true);
  }, []);
  
  return { hasPendingWrites, trackWrite };
}
```

## 8. Security Considerations

### 8.1 Client-Side Validation

Always validate data on the client before sending to Firestore:

```typescript
// Time entry validation with Zod
const timeEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  regularHours: z.number().min(0).max(24),
  overtimeHours: z.number().min(0),
  ptoHours: z.number().min(0),
  unpaidLeaveHours: z.number().min(0),
  notes: z.string().optional(),
}).refine(data => {
  const totalHours = data.regularHours + data.overtimeHours + 
                     data.ptoHours + data.unpaidLeaveHours;
  return totalHours > 0 && totalHours <= 24;
}, {
  message: "Total hours must be greater than 0 and not exceed 24",
  path: ["regularHours"]
});
```

### 8.2 Security Rules Testing

Test security rules with the Firebase Emulator:

```typescript
// In __tests__/firebase/security.test.ts
import { 
  initializeTestEnvironment,
  assertFails,
  assertSucceeds 
} from '@firebase/rules-unit-testing';

describe('Firestore Security Rules', () => {
  let testEnv;
  
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'test-project',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
      },
    });
  });
  
  afterAll(async () => {
    await testEnv.cleanup();
  });
  
  test('Users can only read their own time entries', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const bob = testEnv.authenticatedContext('bob');
    
    // Alice creates a time entry
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .collection('timeEntries')
        .doc('entry1')
        .set({
          userId: 'alice',
          date: '2023-01-01',
          hours: 8
        });
    });
    
    // Alice can read her entry
    await assertSucceeds(
      alice.firestore()
        .collection('timeEntries')
        .doc('entry1')
        .get()
    );
    
    // Bob cannot read Alice's entry
    await assertFails(
      bob.firestore()
        .collection('timeEntries')
        .doc('entry1')
        .get()
    );
  });
});
```

## 9. Performance Monitoring

### 9.1 Query Performance Logging

```typescript
import { getDocsFromCache, getDocsFromServer } from 'firebase/firestore';

async function logQueryPerformance(queryName, queryFn) {
  const start = performance.now();
  try {
    // Try to get from cache first
    const cacheResult = await getDocsFromCache(queryFn());
    const cacheTime = performance.now() - start;
    
    console.log(`${queryName} (cache): ${cacheTime}ms, ${cacheResult.docs.length} docs`);
    
    // Then get from server to measure network time
    const serverStart = performance.now();
    const serverResult = await getDocsFromServer(queryFn());
    const serverTime = performance.now() - serverStart;
    
    console.log(`${queryName} (server): ${serverTime}ms, ${serverResult.docs.length} docs`);
    
    return {
      source: 'cache-then-server',
      data: serverResult.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    };
  } catch (e) {
    // If cache fails, fall back to normal query
    const normalStart = performance.now();
    const result = await getDocs(queryFn());
    const normalTime = performance.now() - normalStart;
    
    console.log(`${queryName} (normal): ${normalTime}ms, ${result.docs.length} docs`);
    
    return {
      source: 'server',
      data: result.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    };
  }
}
```

### 9.2 React Query DevTools Integration

```jsx
// In App.tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        {/* Application routes */}
      </Router>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

## 10. Common Patterns for Time Tracking System

### 10.1 User's Weekly Time Entries

```typescript
export function useWeeklyTimeEntries(weekStartDate: Date) {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid;
  
  // Calculate week end date
  const weekEndDate = addDays(weekStartDate, 6);
  
  // Format dates for Firestore queries
  const startDateStr = weekStartDate.toISOString().split('T')[0];
  const endDateStr = weekEndDate.toISOString().split('T')[0];
  
  // Create query key with all dependencies
  const queryKey = ['timeEntries', 'week', userId, startDateStr, endDateStr];
  
  return useQuery({
    queryKey,
    queryFn: async () => {
      // Create query constraints
      const constraints = [
        where('userId', '==', userId),
        where('date', '>=', startDateStr),
        where('date', '<=', endDateStr),
        orderBy('date', 'asc')
      ];
      
      // Set up real-time query
      return new Promise((resolve) => {
        const unsubscribe = timeEntriesService.onQueryChange(
          constraints,
          (entries) => {
            resolve(entries);
          }
        );
        
        // Cleanup function for React Query
        return () => unsubscribe();
      });
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });
}
```

### 10.2 Manager's Approval Dashboard

```typescript
export function useTeamPendingEntries() {
  const { currentUser } = useAuth();
  const { managedUsers } = useManagedUsers();
  const userIds = managedUsers.map(user => user.id);
  
  return useQuery({
    queryKey: ['timeEntries', 'pending', 'team', userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      
      // Create query for all managed users' pending entries
      const constraints = [
        where('userId', 'in', userIds),
        where('status', '==', 'pending'),
        orderBy('date', 'desc')
      ];
      
      return new Promise((resolve) => {
        const unsubscribe = timeEntriesService.onQueryChange(
          constraints,
          (entries) => {
            resolve(entries);
          }
        );
        
        return () => unsubscribe();
      });
    },
    enabled: !!currentUser && userIds.length > 0,
  });
}
```

### 10.3 Time Off Balance Tracking

```typescript
export function useTimeOffBalance() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid;
  const year = new Date().getFullYear();
  
  return useQuery({
    queryKey: ['timeOffBalance', userId, year],
    queryFn: async () => {
      // Get the user document for allocated PTO
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();
      const allocatedPto = userData?.timeOffBalance?.allocated || 0;
      
      // Query for used PTO
      const constraints = [
        where('userId', '==', userId),
        where('isTimeOff', '==', true),
        where('timeOffType', '==', 'pto'),
        where('status', 'in', ['approved', 'pending'])
      ];
      
      const ptoEntries = await new Promise((resolve) => {
        timeEntriesService.getWithConstraints(constraints, (entries) => {
          resolve(entries);
        });
      });
      
      // Calculate used PTO
      const usedPto = ptoEntries.reduce((sum, entry) => sum + entry.ptoHours, 0);
      
      // Calculate remaining balance
      const remainingPto = allocatedPto - usedPto;
      
      return {
        allocated: allocatedPto,
        used: usedPto,
        remaining: remainingPto
      };
    },
    enabled: !!userId,
  });
}
```

## 11. Best Practices & Do's and Don'ts

### 11.1 Do's

✅ **DO** use abstractions for all Firebase interactions  
✅ **DO** implement optimistic UI updates for better UX  
✅ **DO** use batched writes for related operations  
✅ **DO** use transactions when operations depend on current data state  
✅ **DO** define clear cache invalidation strategies  
✅ **DO** use compound indexes for complex queries  
✅ **DO** enable offline persistence for improved UX  
✅ **DO** validate data on both client and server  
✅ **DO** use TypeScript for type safety throughout the data layer  
✅ **DO** implement proper error handling for all async operations  

### 11.2 Don'ts

❌ **DON'T** create excessively nested data structures (keep documents flat)  
❌ **DON'T** use collection queries without filters  
❌ **DON'T** depend on client-only validation  
❌ **DON'T** overuse real-time listeners (limit active listeners)  
❌ **DON'T** fetch large result sets without pagination  
❌ **DON'T** use transactions for simple operations where batches would suffice  
❌ **DON'T** store redundant data that can be calculated on-demand  
❌ **DON'T** leak Firebase implementation details out of the service layer  
❌ **DON'T** directly manipulate the React Query cache without careful planning  
❌ **DON'T** ignore network status in user experiences  

## 12. Troubleshooting Common Issues

### Query Performance Issues

1. **Slow Queries**
   - Verify indexes are defined for all filtered and sorted fields
   - Use query cursor pagination instead of offset
   - Implement composite indexes for complex queries

2. **Excessive Reads**
   - Use more specific queries with appropriate filters
   - Implement caching strategies with React Query
   - Reduce real-time listener usage where one-time reads suffice

### Data Consistency Issues

1. **Race Conditions**
   - Use transactions for operations that depend on current document state
   - Implement optimistic updates with proper error handling
   - Use batched writes for related updates

2. **Offline Synchronization Problems**
   - Provide clear offline indicators in the UI
   - Implement proper error handling for operations during reconnection
   - Test offline scenarios thoroughly 