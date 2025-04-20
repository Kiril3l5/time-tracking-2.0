# Firebase Authentication Integration Plan for Time Tracking 2.0

## Overview

This document outlines the plan and current implementation for Firebase Authentication in the Time Tracking 2.0 application, supporting both the admin portal (for managers) and hours portal (for workers).

**Last Updated**: 2024-06-16 (Reflected state management refactor)
**Status**: In Progress (Core Refactor Complete)  
**Author**: Claude / Gemini

## Implementation Progress

### Completed
- ✅ Enhanced auth service with persistence strategy
- ✅ Created responsive LoginForm component
- ✅ Created responsive RegisterForm component
- ✅ Added basic biometric authentication capability detection
- ✅ Created comprehensive database schema documentation ([Database Schema](../schema/database-schema.md))
- ✅ Created permissions system documentation ([Permissions System](../schema/permissions-system.md))
- ✅ **Refactored State Management**: Centralized auth state (user, profile, loading) in Zustand (`useAuthStore`).
- ✅ **Refactored Auth Context**: `AuthProvider` now provides only auth *actions* (login, register, logout) via `useAuth` hook.
- ✅ **Implemented Central Listener**: `App.tsx` listener updates Zustand state and fetches Firestore user data (`User` type).
- ✅ **Updated Registration**: `register` action in `AuthProvider` now creates Firestore document matching `User` type.
- ✅ **Enabled Role Hooks**: Zustand hooks (`useIsAdmin`, `useIsManager`, `useIsWorker`) are functional based on Firestore `User.role`.

### In Progress
- 🔄 Portal Integration: Implementing login/register pages in specific portals.
- 🔄 Biometric Authentication: Implementing credential storage and actual biometric login flow.
- 🔄 User profile management UI.

### Pending
- Biometric authentication testing across platforms.
- Advanced features (2FA, Google Sign-in, etc.)

## 1. Current Infrastructure Analysis

Based on the existing codebase:

### Existing Security Rules

The project already has Firebase security rules in place with:
- Role-based access control (`isAdmin()`, `isManager()`, `isAuthenticatedUser()`)
- Permission-based authorization (`hasPermission()`)
- Company-based access control (`hasCompanyAccess()`)
- Manager-worker relationship (`isManagerOf()`)

### Existing Architecture

- Monorepo structure with `/packages/common`, `/packages/hours`, and `/packages/admin`
- Mobile-first implementation with responsive components
- Shared utilities between portals

## 2. Authentication Requirements

### Functional Requirements

1. **User Authentication**
   - Email/password login for all users
   - Biometric authentication for mobile users
   - Session management and persistence

2. **Role-Based Access**
   - Admin portal access for managers/admins only
   - Hours portal access for workers
   - Role-appropriate UI and features

3. **Mobile-First Experience**
   - Touch-friendly login interface
   - Biometric authentication integration
   - Offline authentication support

4. **Security Features**
   - Secure credential storage
   - Token refresh mechanism
   - Password reset functionality

### Non-Functional Requirements

1. **Performance**
   - Fast authentication process (< 2 seconds)
   - Minimal bundle size impact

2. **Usability**
   - Intuitive authentication flow
   - Clear error messages
   - Accessibility compliance

3. **Maintainability**
   - Well-documented integration
   - Testable authentication components
   - Separation of concerns

## 3. Firebase Authentication Setup

### 3.1 Enable Authentication Methods in Firebase Console

1. Access Firebase Console > Authentication > Sign-in methods
2. Enable the following providers:
   - Email/Password (primary method)
   - Google Sign-in (optional for easier onboarding)
   - Phone Authentication (optional for 2FA)

### 3.2 Configure Authentication Settings

1. Set session duration (default: 1 hour)
2. Configure email templates for:
   - Email verification
   - Password reset
   - Email link authentication

### 3.3 Test Authentication in Firebase Console

1. Create test users with different roles
2. Verify login capabilities
3. Test password reset flow

## 4. Implementation Plan

### 4.1 Common Package Authentication Module (`packages/common`)

1.  **Firebase Core Initialization (`src/firebase/core/firebase.ts`)** ✅
    *   Initializes Firebase app, Auth, Firestore (db), etc.
    *   Exports `auth` and `db` instances.

2.  **Authentication Actions Context (`src/providers/AuthProvider.tsx`)** ✅
    *   Provides a React Context (`AuthContext`) focused *solely* on authentication **actions**.
    *   Exports the `AuthProvider` component to wrap parts of the app needing actions.
    *   Exports the `useAuth` hook for components to access actions: `login`, `register`, `logout`, `resetPassword`.
    *   The `register` action includes logic to create the corresponding Firestore document (`User` type) after successful Firebase Auth user creation.
    *   **Does NOT manage state directly.** State is handled by the Zustand store.

3.  **Authentication State (Zustand Store)** ✅
    *   (See Section 4.1.1 below for details)

4.  **Firestore Types (`src/types/firestore.ts`)** ✅
    *   Defines the `User` interface, which is the source of truth for the structure of user data stored in Firestore.
    *   Defines other relevant Firestore data structures (e.g., `TimeEntry`).

5.  **(Deprecated) Role/Permission Utilities (`src/firebase/auth/`, `src/utils/permissions`)** ⚠️
    *   Older utility functions for role/permission checks might exist but should be superseded by the Zustand-based role selector hooks (`useIsAdmin`, etc.) where applicable.
    *   Review and potentially deprecate/remove if replaced by Zustand selectors.

6.  **Biometric Auth Utilities (`src/firebase/auth/auth-service.ts`)** ✅
    *   Includes functions for biometric capability detection (`isBiometricAvailable`, `isBiometricEnabled`).
    *   Includes helpers for credential persistence (`getRememberedUser`, `getLastUser`).
    *   Will be expanded for actual biometric login flow.

### 4.1.1 Zustand Authentication Store (`src/store/useAuthStore.ts`) ✅

*   **Purpose**: Serves as the single source of truth for global authentication **state** across the application.
*   **State Managed**:
    *   `user: FirebaseUser | null`: The current Firebase Auth user object.
    *   `userProfile: User | null`: The corresponding Firestore user data (conforming to the `User` type from `types/firestore.ts`).
    *   `isLoading: boolean`: Tracks the initial auth state loading.
    *   `isAuthenticated: boolean`: Derived state indicating if a user is logged in.
    *   `error: string | null`: Stores any auth-related errors.
*   **Updating**: The store state is primarily updated by the central `onAuthStateChanged` listener located in `packages/hours/src/App.tsx`.
*   **Accessing State**: Components access the state reactively using selector hooks:
    *   `useAuthStatus()`: Returns `{ isLoading, isAuthenticated }`.
    *   `useCurrentUser()`: Returns the Firebase `User` object.
    *   `useCurrentUserProfile()`: Returns the Firestore `User` data object.
    *   `useIsAdmin()`, `useIsManager()`, `useIsWorker()`: Return boolean based on the `role` in the `userProfile` state.
*   **Accessing Actions**: The central listener uses `useAuthActions()` to get store actions (`setUser`, `setUserProfile`, `setLoading`, `setError`).

### 4.2 Protected Route Components ✅

Location: `packages/common/src/components/auth/`

1. **Base Protected Route** ✅
   - Created `ProtectedRoute.tsx` component
   - Implemented authentication checking logic

2. **Role-Specific Route Protection** ✅
   - Created `AdminRoute`, `ManagerRoute`, and `WorkerRoute` components
   - Integrated with existing security rules

### 4.3 Auth UI Components ✅

Location: `packages/common/src/components/auth/`

1. **Login Form Component** ✅
   - Created responsive login form
   - Implemented validation and error handling
   - Added biometric authentication option

2. **Registration Form Component** ✅
   - Created user registration form
   - Implemented validation rules
   - Added terms acceptance

3. **Password Reset Component** ⏳
   - (Pending implementation)

4. **Profile Management Component** ⏳
   - (Pending implementation)

### 4.4 Authentication Hooks

Two primary sets of hooks facilitate interaction with the authentication system:

1.  **Auth Action Hook (`packages/common/src/providers/AuthProvider.tsx`)** ✅
    *   `useAuth()`: Provides access to the authentication **action** functions (`login`, `register`, `logout`, `resetPassword`) defined in the `AuthProvider` context. Used by components that need to trigger these actions (e.g., `LoginForm`, `RegisterForm`).

2.  **Auth State Hooks (`packages/common/src/store/useAuthStore.ts`)** ✅
    *   These hooks select specific pieces of **state** from the global Zustand store.
    *   `useAuthStatus()`: Selects `{ isLoading, isAuthenticated }`. Used for routing and conditional rendering.
    *   `useCurrentUser()`: Selects the Firebase Auth `User` object.
    *   `useCurrentUserProfile()`: Selects the Firestore `User` data object.
    *   `useIsAdmin()`, `useIsManager()`, `useIsWorker()`: Select boolean based on the `role` field in the Firestore `User` data. Used for role-based UI/feature control.
    *   `useAuthActions()`: Selects the store's internal actions (`setUser`, `setUserProfile`, etc.). Primarily used internally by the central `onAuthStateChanged` listener in `App.tsx`.

### 4.5 Admin Portal Integration ⏳

Location: `packages/admin/src/`

1. **Auth Provider Integration** ⏳
   - (Pending implementation)

2. **Protected Routes Setup** ⏳
   - (Pending implementation)

3. **Admin-specific Auth UI** ⏳
   - (Pending implementation)

### 4.6 Hours Portal Integration (`packages/hours`)

1.  **Auth Provider Integration & Listener** ✅
    *   The root component `App.tsx` now wraps the application's router with `<AuthProvider>` from `@common`. This makes authentication actions (`useAuth`) available to components within the portal.
    *   `App.tsx` also contains the central `onAuthStateChanged` listener that updates the global Zustand store (`useAuthStore`) with the current auth state and Firestore user data.

2.  **Protected Routes Setup** ✅
    *   `App.tsx` uses the `RequireAuth` component (which checks state via `useAuthStatus` from Zustand) to protect application routes like `/time`, `/dashboard`, `/history`, `/reports`.

3.  **Worker-specific Auth UI** 🔄
    *   Login/Registration pages (`LoginPage.tsx`, `RegisterPage.tsx`) exist.
    *   These pages utilize the common `LoginForm` and `RegisterForm` components.
    *   Need to ensure these pages correctly use the `useAuth()` hook to call `login`/`register` actions.

### 4.7 Mobile Biometric Authentication ⏳

1. **Platform Detection** ✅
   - Added detection for biometric capabilities
   - Used viewport detection for responsive UI

2. **Web Implementation** ⏳
   - (Partially implemented, detection only)

3. **React Native/PWA Implementation** ⏳
   - (Pending implementation)

## 5. Integration with Existing Firebase Rules

The authentication implementation utilizes existing Firebase security rules and interacts with Firestore user documents.

### 5.1 User Document Structure (`users` collection)

The structure of documents stored in the `/users/{userId}` collection should align with the `User` interface defined in `packages/common/src/types/firestore.ts`. The key fields include:

```typescript
// Path: packages/common/src/types/firestore.ts
export interface User {
  // NOTE: The document ID in Firestore IS the Firebase Auth UID (userId).
  // The 'id' field below might be redundant if always equal to the doc ID.
  id: string; 
  email: string; 
  firstName: string;
  lastName: string;
  companyId: string;
  managerId?: string; // Optional manager relationship
  role: 'user' | 'manager' | 'admin' | 'superadmin'; // Role identifier
  permissions: string[]; // List of specific permission strings (if used)
  isActive: boolean; // Account status
  lastLoginAt?: Date | string; // Timestamp of last login (ISO String recommended)
  createdAt: Date | string; // Timestamp of creation (ISO String recommended)
  updatedAt: Date | string; // Timestamp of last update (ISO String recommended)
  metadata?: { // Optional metadata
    registrationMethod: string;
    registrationTime: string;
    userAgent?: string;
    [key: string]: unknown;
  };
}
```

*   The `register` function in `AuthProvider` creates documents with this structure (excluding `id` and `updatedAt`).
*   The `onAuthStateChanged` listener in `App.tsx` fetches documents matching this structure.
*   Security rules (`firestore.rules`) reference fields like `role`, `companyId`, `managerId` to enforce access control.

### 5.2 Security Rule Considerations

*   **User Creation**: Rules must allow authenticated users (specifically during the registration process, perhaps checked via token claims or temporary flags) to create their *own* user document in the `users` collection (`/users/{userId}` where `userId == request.auth.uid`).
*   **Profile Updates**: Rules should define who can update user documents (e.g., users can update their own non-critical fields, managers/admins can update specific fields like `role` or `isActive`).
*   **Read Access**: Rules define who can read user documents (e.g., users can read their own, managers can read their assigned workers, admins can read all within their scope).

## 6. Documentation

The following documentation has been created or updated to support the authentication implementation:

1. [Database Schema](../schema/database-schema.md) - Comprehensive documentation of all collections and fields
2. [Permissions System](../schema/permissions-system.md) - Detailed explanation of the role-based permissions system
3. [Firebase Auth Integration Plan](../development/firebase-auth-integration-plan.md) (this document) - Implementation plan and status tracking

Additional documentation to be created:
1. User Registration Flow Guide (pending)
2. Authentication Testing Guide (pending)
3. Mobile Biometric Authentication Guide (pending)

## 7. Next Steps

With the core authentication state management refactored and the basic user document creation implemented, the next priorities are:

1.  **Enhance Registration Flow** 🔄:
    *   Implement creation of any additional related Firestore documents required upon user registration (e.g., `userSettings`, `userStats`, if planned according to the [Database Schema](../schema/database-schema.md)).
    *   Ensure robust validation and user-friendly error handling on the `RegisterForm`.

2.  **Complete Portal Integration** 🔄:
    *   Finalize portal-specific login/registration pages (`LoginPage.tsx`, `RegisterPage.tsx`) in `packages/hours` and `packages/admin`, ensuring they correctly use the `useAuth()` hook for actions.
    *   Integrate role-based protected routes fully within the `packages/admin` portal.

3.  **Implement Profile Management** 🔄:
    *   Create UI components for viewing and editing user profiles (leveraging the `User` data from `useCurrentUserProfile`).
    *   Implement permission-based field visibility and editability according to `firestore.rules`.

4.  **Finalize Biometric Authentication** 🔄:
    *   Implement secure credential storage and the actual biometric login/authentication flow for supported platforms (WebAuthn for web, platform APIs for native/PWA if applicable).
    *   Add appropriate fallback mechanisms for unsupported platforms or user preference.

5.  **Testing**: 
    *   Add unit and integration tests for authentication components and hooks.
    *   Perform end-to-end testing of login, registration, logout, and protected routes.
    *   Conduct usability testing on the authentication flow.

## 8. Security Considerations

1. **Credential Storage**
   - Use secure storage mechanisms (SecureStorage in mobile)
   - Never store raw passwords

2. **Token Handling**
   - Implement proper JWT validation
   - Set appropriate token expiration

3. **Biometric Security**
   - Use platform biometric APIs that don't expose biometric data
   - Implement appropriate fallback mechanisms

4. **Security Testing**
   - Conduct penetration testing
   - Verify security rule effectiveness

## 9. Success Metrics

1. **Authentication Speed**
   - Average login time < 2 seconds
   - Biometric auth time < 1 second

2. **User Adoption**
   - >80% of mobile users enable biometric auth
   - <5% authentication error rate

3. **Security Metrics**
   - Zero unauthorized access incidents
   - 100% appropriate role enforcement

## 10. Conclusion

This implementation plan outlines a comprehensive approach to integrating Firebase Authentication with the Time Tracking 2.0 application, adhering to the mobile-first philosophy while maintaining security best practices. By leveraging the existing Firebase infrastructure and security rules, we can efficiently add robust authentication with minimal changes to the codebase.

The authentication system will enhance the security posture of the application while providing an intuitive, seamless experience for users across both portals, with special consideration for mobile users through biometric authentication support.

## 11. References

- [Firebase Authentication Documentation](https://firebase.google.com/docs/auth)
- [Web Authentication API (WebAuthn)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API)
- Existing Time Tracking 2.0 documentation:
  - [Project Readme](../../README.md)
  - [Mobile-First Implementation Plan](../workflow/mobile-first-implementation-plan.md)
  - [Project Structure Guidelines](../workflow/project-structure-guidelines.md) 