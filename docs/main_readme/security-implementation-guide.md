# Security Implementation Guide

## 1. Purpose and Scope

This guide provides comprehensive security implementation details for the Time Tracking System, covering:

- Firebase Authentication configuration
- Firestore security rules
- Role-based access control implementation
- Token management
- Data protection strategies
- Security testing

It establishes a robust security model that protects sensitive time tracking data while enabling appropriate access based on user roles.

## 2. Implementation Guidelines

### Authentication Strategy

The system implements a multi-layered authentication approach:

#### Firebase Authentication Configuration

- **Primary Auth Method**: Email/Password with email verification
- **Secondary Methods**:
  - Google SSO for enterprise users
  - Phone number verification for multi-factor authentication
- **Custom Claims**: Store user roles in JWT tokens for efficient access control
- **Session Management**: 1-hour token expiration with secure refresh

#### User Roles and Permissions

| Role | Description | Permissions |
|------|-------------|-------------|
| Worker | Regular employee | View/edit own time entries<br>View own reports<br>Manage profile |
| Manager | Team supervisor | All Worker permissions<br>View/approve team entries<br>Generate team reports |
| Admin | Company administrator | All Manager permissions<br>Manage all users<br>Company-wide settings<br>All reports access |
| Super Admin | System administrator | All Admin permissions<br>Manage companies<br>System configuration |

#### Authentication Flow

1. User authenticates via Firebase Authentication
2. On successful login, custom claims are verified/added
3. Auth state is managed through a React Context provider
4. Protected routes check permissions before rendering
5. Token refresh is handled automatically in the background

### Firestore Security Rules

Security rules serve as the primary defense layer for database access. The following rules implement a robust role-based access control system with specialized validation for time tracking requirements:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // === Helper Functions for User Roles ===
    function isAdmin() {
      let userData = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
      return userData.role == 'super-admin';
    }
    
    function isManager() {
      let userData = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
      return userData.role == 'manager';
    }
    
    function isAuthenticatedUser() {
      return request.auth != null && request.auth.uid != null;
    }
    
    // === Helper Functions for Permissions ===
    function hasPermission(permission) {
      let userData = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
      return permission in userData.permissions && 
             userData.permissions[permission] == true;
    }
    
    function isManagerOf(workerId) {
      let userData = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
      return userData.role == 'manager' && 
             'assignedWorkers' in userData && 
             userData.assignedWorkers.includes(workerId);
    }
    
    // === Company Access Control Helpers ===
    function getUserCompanyId() {
      let userData = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
      return userData.companyId;
    }
    
    function hasCompanyAccess(companyId) {
      let userCompanyId = getUserCompanyId();
      return userCompanyId == companyId;
    }

    // === Super Admin and Config Validation ===
    function isSuperAdmin() {
      return request.auth.uid == 'galkin.kir' && isAdmin();
    }

    function isValidWeekConfig(config) {
      return (config == null) || ( // Allow null/missing config
        config is map &&
        config.keys().hasAll(['startDay', 'workWeekLength']) &&
        config.startDay is number &&
        config.startDay >= 0 &&
        config.startDay <= 6 &&
        config.workWeekLength is number &&
        config.workWeekLength >= 5 &&
        config.workWeekLength <= 7
      );
    }

    // === Users Collection ===
    match /users/{userId} {
      allow read: if isAuthenticatedUser() && (
        request.auth.uid == userId ||
        isAdmin() ||
        isManager()
      );
      
      allow create: if 
        isAuthenticatedUser() && (
          request.auth.uid == userId ||
          isAdmin()
        ) &&
        request.resource.data.keys().hasAll([
          'email', 'firstName', 'lastName', 'role',
          'permissions', 'metadata'
        ]);
      
      allow update: if 
        isAdmin() ||
        (request.auth.uid == userId &&
         request.resource.data.diff(resource.data).affectedKeys()
           .hasOnly(['firstName', 'lastName', 'profile', 'settings'])) ||
        (isManager() && isManagerOf(userId) &&
         request.resource.data.diff(resource.data).affectedKeys()
           .hasOnly(['status', 'timeEntries', 'approvedHours', 'updatedAt']));
      
      allow delete: if isAdmin();
    }

    // === User Settings Collection ===
    match /userSettings/{userId} {
      allow read: if isAuthenticatedUser() && (
        request.auth.uid == userId ||
        isAdmin() ||
        isManagerOf(userId)
      );
      
      allow write: if isAuthenticatedUser() && (
        request.auth.uid == userId ||
        isAdmin()
      );
    }

    // === User Stats Collection ===
    match /userStats/{userId} {
      allow read: if isAuthenticatedUser() && (
        request.auth.uid == userId ||
        isAdmin() ||
        isManagerOf(userId)
      );
      
      allow write: if isAdmin();
    }

    // === Time Entries Collection ===
    match /timeEntries/{entryId} {
      function getUserAssignedWorkers() {
          let userData = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
          return userData.assignedWorkers;
      }

      allow read, list: if 
          request.auth != null && (
              isAdmin() ||
              (isManager() && 
               (resource == null || 
                getUserAssignedWorkers().hasAny([resource.data.userId]))
              ) ||
              (resource == null || resource.data.userId == request.auth.uid)
          );

      allow create: if
          request.auth != null &&
          request.resource.data.userId == request.auth.uid &&
          request.resource.data.status == 'pending';

      allow update: if
          request.auth != null && (
              isAdmin() ||
              (isManager() && 
               getUserAssignedWorkers().hasAny([resource.data.userId])) ||
              (resource.data.userId == request.auth.uid && 
               resource.data.status == 'pending')
          );

      allow delete: if false; // Use soft deletion pattern
    }
    
    // === Companies Collection === 
    match /companies/{companyId} {
      allow read: if isAuthenticatedUser() && (
        isAdmin() || 
        isManager() ||
        hasCompanyAccess(companyId)
      );

      // Create - require valid weekConfig if present
      allow create: if isAuthenticatedUser() && 
        isAdmin() &&
        (!request.resource.data.keys().hasAny(['settings.weekConfig']) || 
          isValidWeekConfig(request.resource.data.settings.weekConfig));
      
      // Update - only super admin can modify weekConfig
      allow update: if isAuthenticatedUser() && (
        // Super admin can update anything
        isSuperAdmin() ||
        // Regular admin can update everything except weekConfig
        (isAdmin() && 
         !request.resource.data.diff(resource.data).affectedKeys().hasAny(['settings.weekConfig'])) ||
        // Manager with company access can update non-critical fields
        (isManager() && hasCompanyAccess(companyId) &&
         !request.resource.data.diff(resource.data).affectedKeys().hasAny(['settings.weekConfig']))
      );
      
      allow delete: if isAuthenticatedUser() && isAdmin();
    }
    
    // === Invoices Collection ===
    match /invoices/{invoiceId} {
      // For list queries
      allow list: if isAuthenticatedUser() && (
        isAdmin() || 
        (isManager() && hasPermission('generateInvoices'))
      );
      
      // For document reads
      allow get: if isAuthenticatedUser() && (
        isAdmin() || 
        (isManager() && hasPermission('generateInvoices') && hasCompanyAccess(resource.data.companyId))
      );
      
      allow create: if isAuthenticatedUser() && (
        isAdmin() || 
        (isManager() && 
         hasPermission('generateInvoices') && 
         hasCompanyAccess(request.resource.data.companyId))
      );
      
      allow update: if isAuthenticatedUser() && (
        isAdmin() ||
        (isManager() && 
         hasPermission('generateInvoices') && 
         hasCompanyAccess(resource.data.companyId))
      );
      
      allow delete: if isAdmin();
    }
  }
}
```

#### Key Security Rules Features

1. **Role-Based Access Control**:
   - Distinct helper functions for checking user roles: `isAdmin()`, `isManager()`, `isSuperAdmin()`
   - Hierarchical permission structure with inheritance

2. **Granular Permission System**:
   - Permission-specific checks via `hasPermission()`
   - Manager-subordinate relationship validation with `isManagerOf()`
   - Company-based access control through `hasCompanyAccess()`

3. **Week Configuration Protection**:
   - Special validation for critical week settings via `isValidWeekConfig()`
   - Super admin restriction for modifying week configuration
   - Constraints on valid values for startDay (0-6) and workWeekLength (5-7)

4. **Collection-Specific Security**:
   - Users: Self-management with limited fields, manager oversight, admin full access
   - Time Entries: Worker creates, manager approves pattern
   - Companies: Tiered access with configuration protection
   - Invoices: Permission-based access with company restriction

5. **Data Modification Constraints**:
   - Field-level update restrictions using `affectedKeys().hasOnly()`
   - Required fields validation on creation
   - Soft deletion pattern (preventing actual document deletion)

6. **Multi-level Company Access**:
   - Company-based isolation of data
   - Cross-company access restrictions
   - Manager access limited to their company data

### Frontend Security Implementation

#### Protected Routes

```typescript
// routes.tsx - Protected route implementation
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  requiredRole?: 'worker' | 'manager' | 'admin' | 'super-admin';
}

export const ProtectedRoute = ({ requiredRole }: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth();
  
  // Show loading state while checking auth
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  // Not logged in - redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Check role if required
  if (requiredRole) {
    const hasRequiredRole = checkUserRole(user, requiredRole);
    if (!hasRequiredRole) {
      return <Navigate to="/unauthorized" replace />;
    }
  }
  
  // Render child routes
  return <Outlet />;
};

// Helper to check if user has required role or higher
function checkUserRole(user, requiredRole) {
  const roleHierarchy = {
    'worker': 0,
    'manager': 1,
    'admin': 2,
    'super-admin': 3
  };
  
  const userRoleLevel = roleHierarchy[user.role] || 0;
  const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
  
  return userRoleLevel >= requiredRoleLevel;
}
```

#### Auth Provider

```typescript
// AuthProvider.tsx - Authentication context provider
import { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Get ID token with claims
        const token = await firebaseUser.getIdTokenResult();
        
        // Combine Firebase user with custom claims
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          emailVerified: firebaseUser.emailVerified,
          // Add custom claims as user properties
          role: token.claims.role || 'worker',
          companyId: token.claims.companyId,
          // Add token expiration time for refresh logic
          tokenExpiration: new Date(token.expirationTime)
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    
    // Clean up subscription
    return () => unsubscribe();
  }, []);
  
  // Handle token refresh before expiration
  useEffect(() => {
    if (!user) return;
    
    const refreshTime = new Date(user.tokenExpiration);
    refreshTime.setMinutes(refreshTime.getMinutes() - 5); // Refresh 5 minutes before expiration
    
    const timeUntilRefresh = refreshTime.getTime() - new Date().getTime();
    
    if (timeUntilRefresh <= 0) {
      // Refresh immediately if token is about to expire
      auth.currentUser.getIdToken(true);
      return;
    }
    
    // Schedule refresh
    const refreshTimeout = setTimeout(() => {
      auth.currentUser.getIdToken(true);
    }, timeUntilRefresh);
    
    return () => clearTimeout(refreshTimeout);
  }, [user]);
  
  // Auth methods
  const signIn = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };
  
  const signOut = () => {
    return firebaseSignOut(auth);
  };
  
  const value = {
    user,
    isLoading,
    signIn,
    signOut,
    isAdmin: user?.role === 'admin' || user?.role === 'super-admin',
    isManager: user?.role === 'manager' || user?.role === 'admin' || user?.role === 'super-admin',
    isWorker: !!user
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### Backend Security Measures

#### Custom Claims Management

Cloud Function to set custom claims when a user is created or role changes:

```typescript
// functions/src/auth/setCustomClaims.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const setUserClaims = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    
    // If document was deleted, do nothing
    if (!change.after.exists) {
      return null;
    }
    
    const userData = change.after.data();
    
    // If user role or company changed, update custom claims
    if (!change.before.exists || 
        change.before.data().role !== userData.role ||
        change.before.data().companyId !== userData.companyId) {
      
      // Set custom claims based on user data
      await admin.auth().setCustomUserClaims(userId, {
        role: userData.role,
        companyId: userData.companyId
      });
      
      // Update user's metadata to indicate claims were refreshed
      return change.after.ref.update({
        'metadata.claimsUpdated': admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    return null;
  });
```

#### Secure Cloud Function Access

```typescript
// functions/src/api/secureFunction.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Example of a secure Cloud Function with role check
export const generateAdminReport = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to generate reports'
    );
  }
  
  // Check authorization (admin role)
  const isAdmin = context.auth.token.role === 'admin' || 
                  context.auth.token.role === 'super-admin';
                  
  if (!isAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only administrators can generate this report'
    );
  }
  
  // Function implementation...
  
  return { success: true };
});
```

## 3. Security Best Practices

### Data Protection

1. **Sensitive Data Handling**:
   - Never store plaintext passwords
   - Encrypt sensitive personal data
   - Use field-level security for particularly sensitive fields

2. **Firestore Indexing Security**:
   - Only create indexes for legitimate query patterns
   - Avoid indexing highly sensitive fields where possible

3. **Data Validation**:
   - Validate all data on both client and server
   - Use Zod schemas for consistent validation
   - Implement validation in security rules as the last line of defense

### Authentication Hardening

1. **Password Policies**:
   - Enforce minimum password strength (Firebase's built-in strength estimation)
   - Implement account lockout after failed attempts
   - Require password reset for suspicious activities

2. **Multi-Factor Authentication**:
   - Encourage or require MFA for elevated roles (managers, admins)
   - Use SMS or authenticator app verification
   - Provide clear MFA setup instructions

3. **Session Management**:
   - Short-lived access tokens (1 hour)
   - Secure token refresh mechanisms
   - Ability to revoke sessions remotely

### Application Security

1. **Client-Side Protections**:
   - Content Security Policy to prevent XSS
   - Strict permission checking before rendering sensitive components
   - Input sanitization for all user-provided content

2. **Error Handling**:
   - Generic error messages in production
   - Detailed logging of security events
   - Appropriate HTTP status codes for security errors

3. **Infrastructure Security**:
   - Firebase security rules versioning
   - Regular security reviews
   - Penetration testing for critical workflows

## 4. Security Testing

### Emulator-Based Security Testing

```typescript
// Example security rules test for time entries
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Time Entries Security Rules', () => {
  let testEnv;
  let unauthedDb;
  let workerDb;
  let managerDb;
  let adminDb;
  
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'time-tracking-test',
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
      }
    });
    
    // Create test users with different roles
    unauthedDb = testEnv.unauthenticatedContext().firestore();
    workerDb = testEnv.authenticatedContext('worker-user', { role: 'worker', companyId: 'company1' }).firestore();
    managerDb = testEnv.authenticatedContext('manager-user', { role: 'manager', companyId: 'company1' }).firestore();
    adminDb = testEnv.authenticatedContext('admin-user', { role: 'admin', companyId: 'company1' }).firestore();
    
    // Set up test data
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      
      // Create test users
      await db.collection('users').doc('worker-user').set({
        role: 'worker',
        companyId: 'company1'
      });
      
      await db.collection('users').doc('manager-user').set({
        role: 'manager',
        companyId: 'company1',
        assignedWorkers: ['worker-user']
      });
      
      // Create test time entry
      await db.collection('timeEntries').doc('entry1').set({
        userId: 'worker-user',
        companyId: 'company1',
        date: '2023-01-01',
        hours: 8,
        regularHours: 8,
        status: 'pending'
      });
    });
  });
  
  afterAll(async () => {
    await testEnv.cleanup();
  });
  
  test('Unauthenticated users cannot read time entries', async () => {
    const entryRef = unauthedDb.collection('timeEntries').doc('entry1');
    await assertFails(entryRef.get());
  });
  
  test('Workers can read their own time entries', async () => {
    const entryRef = workerDb.collection('timeEntries').doc('entry1');
    await assertSucceeds(entryRef.get());
  });
  
  test('Workers cannot read other workers time entries', async () => {
    // Create another worker user
    const otherWorkerDb = testEnv.authenticatedContext('other-worker', { role: 'worker', companyId: 'company1' }).firestore();
    
    const entryRef = otherWorkerDb.collection('timeEntries').doc('entry1');
    await assertFails(entryRef.get());
  });
  
  test('Managers can read their team members time entries', async () => {
    const entryRef = managerDb.collection('timeEntries').doc('entry1');
    await assertSucceeds(entryRef.get());
  });
  
  test('Admin can read all time entries', async () => {
    const entryRef = adminDb.collection('timeEntries').doc('entry1');
    await assertSucceeds(entryRef.get());
  });
  
  // Additional tests for create, update, delete operations...
});
```

### Production Security Monitoring

1. **Firebase App Check Integration**:
   - Implement App Check to protect against abuse
   - Use reCAPTCHA for web applications
   - Use DeviceCheck/SafetyNet for mobile apps

2. **Logging and Monitoring**:
   - Log all authentication events
   - Monitor failed login attempts
   - Track unusual access patterns
   - Set up alerts for security anomalies

3. **Regular Security Audits**:
   - Schedule quarterly security rule reviews
   - Check for outdated dependencies
   - Review authentication configuration

## 5. Do's and Don'ts

### Do's
- ✅ Implement role-based access control at multiple layers (Client, Firebase Rules, Functions)
- ✅ Use custom claims for storing roles and permissions in JWT tokens
- ✅ Write comprehensive security rule tests for all collections
- ✅ Apply the principle of least privilege consistently
- ✅ Implement proper token refresh and session management
- ✅ Validate data on both client and server sides
- ✅ Use Firebase App Check for production applications

### Don'ts
- ❌ Store sensitive data in client-accessible locations
- ❌ Rely solely on client-side permission checks
- ❌ Use Firebase Admin SDK in client code
- ❌ Write overly permissive security rules for convenience
- ❌ Skip security testing before deploying rule changes
- ❌ Hard-code security credentials in any code
- ❌ Grant broader permissions than necessary for a function 

## 7. Recent Security Implementations

The following security improvements have been recently implemented based on our [Firestore Security Rules Review](../security/firestore-rules.md):

### 7.1 Data Validation

All write operations now validate the data structure through Firestore security rules:

```javascript
// Example from Firestore rules
function isValidTimeEntry(data) {
  return data.keys().hasAll(['date', 'hours', 'userId', 'companyId', 'status']) &&
         data.date is string &&
         data.hours is number &&
         data.hours >= 0 &&
         data.hours <= 24 &&
         data.userId is string &&
         data.companyId is string &&
         data.status in ['pending', 'approved', 'rejected'];
}
```

### 7.2 Access Auditing with Metadata

A new `metadata` service has been created to standardize document tracking:

```typescript
// Example from metadata.ts
export function createMetadata(user: User | null): CreationMetadata {
  if (!user) {
    throw new Error('User must be authenticated to create metadata');
  }
  
  return {
    createdAt: new Date().toISOString(),
    createdBy: user.uid
  };
}
```

All service operations now include metadata with the user who performed the action:

```typescript
// Example from time-entries.ts
async create(
  entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>, 
  currentUser: User
): Promise<string> {
  // ...
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...entry,
    // Add metadata for security auditing
    ...createMetadata(currentUser),
    ...updateMetadata(currentUser),
  });
  
  return docRef.id;
}
```

### 7.3 Field-Level Security for Managers

Managers are now restricted to updating only specific fields in worker time entries:

```javascript
// From Firestore rules
allow update: if
  isAuthenticatedUser() && (
    (isAdmin() && request.resource.data.updatedBy == request.auth.uid) ||
    (isManager() && 
     getUserAssignedWorkers().hasAny([resource.data.userId]) &&
     request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['status', 'managerApproved', 'managerNotes', 'updatedAt', 'updatedBy']) &&
     request.resource.data.updatedBy == request.auth.uid) ||
    (resource.data.userId == request.auth.uid && 
     resource.data.status == 'pending' &&
     request.resource.data.updatedBy == request.auth.uid)
  );
```

### 7.4 Protection for Deleted Records

Soft-deleted records are now only visible to administrators:

```javascript
// From Firestore rules
allow read, list: if 
  isAuthenticatedUser() && (
    isAdmin() ||
    (isManager() && 
     (resource == null || 
      getUserAssignedWorkers().hasAny([resource.data.userId]))
    ) ||
    (resource == null || resource.data.userId == request.auth.uid)
  ) && 
  (resource == null || !resource.data.isDeleted || isAdmin());
```

### 7.5 Defense in Depth

Security is now enforced at multiple layers:

1. **Firestore Security Rules**: Validate all operations at the database level
2. **Service Layer**: Enforces business rules and validates operations
3. **Component Layer**: UI controls limit actions based on user permissions

### 7.6 Security Rule Testing

A comprehensive test suite has been created to verify security rule behavior:

```typescript
describe('Time Entry Security Rules', () => {
  // ...
  test('Manager can update status of assigned worker time entry', async () => {
    const managerContext = testEnv.authenticatedContext(managerId);
    await expect(
      managerContext.firestore()
        .collection('timeEntries')
        .doc(timeEntryId)
        .update({
          status: 'approved',
          managerNotes: 'Looks good',
          updatedAt: new Date().toISOString(),
          updatedBy: managerId
        })
    ).toAllow();
  });

  test('Manager cannot update hours of assigned worker time entry', async () => {
    const managerContext = testEnv.authenticatedContext(managerId);
    await expect(
      managerContext.firestore()
        .collection('timeEntries')
        .doc(timeEntryId)
        .update({
          hours: 6,
          updatedAt: new Date().toISOString(),
          updatedBy: managerId
        })
    ).toDeny();
  });
});
```

To run the tests:

```bash
cd packages/common
npm run test:rules
```

## 8. Future Security Enhancements

As outlined in the security review, the following enhancements are planned:

1. Add rate limiting via Cloud Functions to prevent abuse
2. Move to claims-based permissions for more granular access control
3. Add anomaly detection for suspicious activity
4. Implement regular security audits:
   - Review Firestore rules every quarter
   - Run security tests before each deployment
   - Monitor Firebase Authentication logs for unusual activity

// ... existing code ... 