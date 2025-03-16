# Firebase Integration Guide

## Overview

This guide documents the Firebase integration structure implemented in the Time Tracking System. The integration follows a modular, type-safe approach that centralizes Firebase interactions within the common package, making them available to both the hours and admin portals while enforcing best practices.

## Directory Structure

```
packages/common/
└── src/
    └── firebase/
        ├── core/
        │   └── firebase.ts         # Core Firebase initialization and config
        ├── auth/
        │   ├── auth-service.ts     # Authentication services
        │   └── auth-hooks.ts       # React hooks for auth
        ├── firestore/
        │   └── firestore-service.ts # Firestore data access layer
        ├── functions/
        │   └── functions-service.ts # Cloud Functions integration
        ├── hooks/
        │   └── query-hooks.ts      # React Query integration hooks
        └── index.ts                # Main export file for Firebase functionality

firebase/
├── firestore.rules               # Firestore security rules
└── firestore.indexes.json        # Firestore indexes
```

## Key Components

### 1. Core Firebase Setup (`firebase/core/firebase.ts`)

The core setup initializes Firebase with a type-safe configuration approach:

- **Type-safe environment variable access**: Ensures all required Firebase config values are present
- **Emulator detection**: Automatically connects to Firebase emulators in development
- **Core service exports**: Exports initialized Firebase services (auth, firestore, functions)

```typescript
// Initialize Firebase with validation
export const app = initializeApp(getFirebaseConfig());
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);

// Connect to emulators if in development mode
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, ...);
  connectFirestoreEmulator(db, ...);
  connectFunctionsEmulator(functions, ...);
}
```

### 2. Authentication Layer (`firebase/auth/auth-service.ts`)

The authentication layer provides:

- **User authentication**: Login, logout, and registration
- **Password management**: Reset and update functions
- **User profile integration**: Links auth users with Firestore profiles
- **Auth state observation**: Utilities for tracking authentication state

```typescript
// Example: Login function
export const login = async (email: string, password: string): Promise<UserCredential> => {
  return signInWithEmailAndPassword(auth, email, password);
};

// Example: Register with profile creation
export const register = async (
  email: string, 
  password: string, 
  userData: Omit<UserProfile, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>
): Promise<UserCredential> => {
  // Create auth user
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  
  // Create user profile in Firestore
  await setDoc(doc(db, 'users', userCredential.user.uid), {
    id: userCredential.user.uid,
    email,
    // Other user data...
    createdAt: new Date(),
    updatedAt: new Date()
  });
  
  return userCredential;
};
```

### 3. Firestore Data Layer (`firebase/firestore/firestore-service.ts`)

The Firestore layer implements:

- **Type-safe collections**: Each collection is strongly typed
- **Data converters**: Handles date/timestamp conversions automatically
- **CRUD operations**: Generic functions for basic operations
- **Collection-specific services**: Business logic for each collection
- **Query abstractions**: Clean, reusable query patterns

```typescript
// Type-safe collection reference
export const timeEntriesCollection = createCollection<TimeEntry>(
  'timeEntries',
  timeEntriesConverter
);

// Generic CRUD operations
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

// Collection-specific services
export const timeEntryService = {
  getUserWeekEntries: async (userId: string, yearWeek: string): Promise<TimeEntry[]> => {
    return queryDocuments(
      timeEntriesCollection,
      where('userId', '==', userId),
      where('yearWeek', '==', yearWeek)
    );
  },
  // More methods...
};
```

### 4. React Query Integration (`firebase/hooks/query-hooks.ts`)

React Query hooks that:

- **Cache Firestore data**: Efficiently cache and refresh Firestore data
- **Optimistic updates**: Provide immediate UI feedback before Firestore operations complete
- **Query invalidation**: Smart cache invalidation for related data
- **Loading/error states**: Manage async states consistently

```typescript
// Query hook example
export function useTimeEntries(userId: string, yearWeek: string) {
  return useQuery({
    queryKey: ['timeEntries', userId, yearWeek],
    queryFn: () => timeEntryService.getUserWeekEntries(userId, yearWeek),
  });
}

// Mutation hook example
export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (newEntry: Omit<TimeEntry, 'id'>) => 
      createDocument(timeEntriesCollection, newEntry),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: ['timeEntries', data.userId, data.yearWeek] 
      });
    },
  });
}
```

### 5. Firestore Security Rules (`firebase/firestore.rules`)

The security rules implement:

- **Role-based access control**: Different permissions for users, managers, and admins
- **Helper functions**: Reusable validation and permission checks
- **Data validation**: Ensures data meets required format and business rules
- **Company scoping**: Restricts data access by company
- **Management hierarchy**: Respects manager/team member relationships

```
function isManager() {
  return isAuthenticated() && 
    (getUserRole() == 'manager' || getUserRole() == 'admin' || getUserRole() == 'superadmin');
}

function isManagerOf(userId) {
  let userData = get(/databases/$(database)/documents/users/$(userId)).data;
  return userData.managerId == request.auth.uid;
}

match /timeEntries/{entryId} {
  allow read: if isAdmin() || 
               isUserAuthenticated(resource.data.userId) || 
               (isManager() && isManagerOf(resource.data.userId));
  
  // More rules...
}
```

## Usage Examples

### Authentication

```tsx
// In a login component
import { login } from '@common/firebase/auth/auth-service';

const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      // Redirect or update UI
    } catch (error) {
      // Handle error
    }
  };
  
  // Form JSX...
};

// Using auth state
import { useAuth } from '@common/firebase/auth/auth-hooks';

const Header = () => {
  const { user, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <header>
      {user ? (
        <span>Welcome, {user.email}</span>
      ) : (
        <Link to="/login">Log in</Link>
      )}
    </header>
  );
};
```

### Firestore Data with React Query

```tsx
// Fetching time entries
import { useTimeEntries, useCreateTimeEntry } from '@common/firebase/hooks/query-hooks';

const TimeEntriesPage = () => {
  const { user } = useAuth();
  const userId = user?.uid;
  const currentWeek = getCurrentYearWeek(); // Helper function to get YYYY-WW
  
  const { 
    data: timeEntries, 
    isLoading, 
    error 
  } = useTimeEntries(userId, currentWeek);
  
  const createMutation = useCreateTimeEntry();
  
  const handleAddEntry = async (entryData) => {
    await createMutation.mutateAsync({
      userId,
      yearWeek: currentWeek,
      date: new Date(),
      // Other fields...
    });
  };
  
  if (isLoading) return <div>Loading entries...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div>
      <h1>Time Entries</h1>
      <ul>
        {timeEntries.map(entry => (
          <li key={entry.id}>{formatDate(entry.date)}: {entry.hours} hours</li>
        ))}
      </ul>
      <button onClick={handleAddEntry}>Add Entry</button>
    </div>
  );
};
```

## Firebase Emulator Integration

The project includes configuration for Firebase emulators, allowing development without affecting production data:

1. **Automatic emulator detection**: Code detects development mode and connects to emulators
2. **Comprehensive emulator setup**: Includes Auth, Firestore, Functions, and Hosting emulators
3. **Data seeding**: Scripts for importing/exporting emulator data
4. **Emulator UI**: Web interface for viewing and manipulating emulator data

```
// In firebase.json
{
  "emulators": {
    "auth": { "port": 9099 },
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "hosting": { "port": 5000 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

## Best Practices Implemented

1. **Type Safety**: All Firebase interactions are strongly typed
2. **Separation of Concerns**: 
   - Core initialization is separate from business logic
   - Services encapsulate collection-specific operations
   - UI components use hooks for data access
3. **Error Handling**: Consistent error handling patterns
4. **Security**: Comprehensive security rules with hierarchical permissions
5. **Optimistic UI**: React Query provides immediate feedback while operations complete
6. **Caching**: Efficient data caching with appropriate invalidation
7. **Environment Awareness**: Automatic development/production detection

## Integration with Other Modules

This Firebase integration works seamlessly with other aspects of the application:

- **State Management**: Provides the data layer for the state management pattern
- **Authentication**: Handles user identity and access control
- **UI Components**: Provides data to render in the UI component library
- **Time Entry Workflow**: Powers the time entry lifecycle process

## Conclusion

This Firebase integration structure provides a robust, type-safe foundation for the Time Tracking System. By centralizing Firebase logic in the common package with a service-based architecture, it ensures consistency across both portals while enforcing best practices for security, performance, and developer experience. 