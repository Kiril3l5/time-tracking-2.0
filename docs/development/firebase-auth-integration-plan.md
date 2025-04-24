# Firebase Authentication Integration Plan for Time Tracking 2.0

## Overview

This document outlines the plan and current implementation for Firebase Authentication in the Time Tracking 2.0 application, supporting both the admin portal (for managers) and hours portal (for workers).

**Last Updated**: 2024-06-16 (Reflected state management refactor)
**Status**: In Progress (Core Refactor Complete, Portal Integration Complete, WebAuthn Backend Implemented)  
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
- ✅ **Implemented Central Listener**: `App.tsx` listener updates Zustand state and fetches Firestore user data (`User` type) (Implemented in both portals).
- ✅ **Updated Registration**: `register` action in `AuthProvider` now creates Firestore document matching `User` type.
- ✅ **Enabled Role Hooks**: Zustand hooks (`useIsAdmin`, `useIsManager`, `useIsWorker`) are functional based on Firestore `User.role`.
- ✅ **Portal Integration**: Core authentication flow (Provider, Listener, Protected Routes, Login/Register Pages) implemented in both `admin` and `hours` portals.
- ✅ **WebAuthn Backend Config**: Implemented backend logic (`functions/src/webauthn.ts`) to handle multiple origins (`expectedOrigins`) and a configurable Relying Party ID (`rpID`) via Firebase Function Configuration.
- ✅ **WebAuthn Secure Challenge Storage**: Implemented secure storage for *authentication* challenges using a dedicated Firestore collection (`webAuthnAuthChallenges`) with a server-side expiry (`expiresAt`) and retrieval via a `challengeId`. Requires manual configuration of Firestore TTL policy on `expiresAt` field.

### In Progress
- 🔄 **WebAuthn (Passkey) Implementation**:
    - Backend Cloud Functions for registration and authentication options generation and verification (`functions/src/webauthn.ts`) created.
    - Frontend `PasskeyManager` component created for registration flow (needs UI integration).
    - Frontend `LoginForm` updated to handle Passkey authentication flow (using `challengeId`).
    - Secure *registration* challenge storage implemented (temporary storage on user document).
- 🔄 User profile management UI.

### Pending
- **WebAuthn (Passkey) Frontend Integration**: Placing `PasskeyManager` in `admin` and `hours` portal UIs.
- **WebAuthn (Passkey) End-to-End Testing**: Thorough testing across browsers/authenticators.
- Password reset functionality implementation.
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

> **IMPORTANT BUILD NOTE (Workaround Required):**
> Due to persistent module resolution issues (`TS2307: Cannot find module`) when using `pnpm install` within the `functions` workspace on some development environments (specifically observed on Windows with Node v20/v22), the TypeScript build (`pnpm run build` inside `functions`) fails.
> 
> **Workaround:** To build the Cloud Functions successfully, dependencies for the `functions` package **must be installed using `npm install` directly within the `functions` directory** after any changes to `functions/package.json`.
> ```bash
> # Navigate to functions directory
> cd functions
> # Install dependencies using npm
> npm install 
> # Run the build
> pnpm run build 
> # Navigate back if needed
> cd ..
> ```
> This creates a local `functions/node_modules` directory managed by npm. Ensure `/functions/node_modules` is added to the root `.gitignore` file.
> The rest of the monorepo should continue using `pnpm install` from the root.

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

7.  **WebAuthn (Passkey) Utilities & Components**
    *   **Backend (`functions/src/webauthn.ts`)**: Contains V2 Cloud Functions:
        *   `webauthnGenerateRegistrationOptions`: Generates registration options, stores temporary challenge on user doc.
        *   `webauthnVerifyRegistration`: Verifies registration response, saves credential to `users/{userId}/passkeys` subcollection.
        *   `webauthnGenerateAuthenticationOptions`: Generates authentication options, securely stores challenge in `webAuthnAuthChallenges` collection, returns `challengeId`.
        *   `webauthnVerifyAuthentication`: Retrieves challenge using `challengeId`, verifies authentication response, deletes challenge doc, issues custom token.
        *   Handles multi-origin (`expectedOrigins`) and configurable `rpID`.
        *   Requires manual setup of Firestore TTL policy for `webAuthnAuthChallenges` collection on `expiresAt` field.
    *   **Frontend Utilities (`src/firebase/auth/auth-service.ts`)**: Includes helpers for credential persistence (`getRememberedUser`, `getLastUser`). Older biometric checks are deprecated/removed.
    *   **Frontend Components (`src/components/auth/`)**:
        *   `LoginForm.tsx`: Updated to include Passkey login button and logic using `@simplewebauthn/browser` and backend functions (handles `challengeId`). Old biometric logic removed.
        *   `PasskeyManager.tsx`: New component for registering new Passkeys/devices (requires integration into settings/profile pages).

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

### 4.5 Admin Portal Integration ✅

Location: `packages/admin/src/`

1. **Auth Provider Integration** ✅
   - `main.tsx` wraps `<App />` with `<AuthProvider>`.

2. **Central Listener Integration** ✅
   - `App.tsx` implements `onAuthStateChanged` listener updating Zustand store and fetching Firestore profile.

3. **Protected Routes Setup** ✅
   - `App.tsx` uses `AdminRoute`/`ManagerRoute`/`ProtectedRoute` components from `@common`.

4. **Admin-specific Auth UI** ✅
   - `LoginPage.tsx` and `RegisterPage.tsx` exist and utilize common `LoginForm`/`RegisterForm` components which use `useAuth`.

### 4.6 Hours Portal Integration (`packages/hours`) ✅

1.  **Auth Provider Integration & Listener** ✅
    *   The root component `App.tsx` wraps the application's router with `<AuthProvider>` from `@common`.
    *   `App.tsx` contains the central `onAuthStateChanged` listener updating the global Zustand store.

2.  **Protected Routes Setup** ✅
    *   `App.tsx` uses protected route components (e.g., `WorkerRoute`, `ProtectedRoute`) checking state via Zustand.

3.  **Worker-specific Auth UI** ✅
    *   Login/Registration pages (`LoginPage.tsx`, `RegisterPage.tsx`) exist.
    *   These pages utilize the common `LoginForm` and `RegisterForm` components which correctly use the `useAuth()` hook.

### 4.7 Passkey / Biometric Authentication (WebAuthn) 🔄

**Goal**: Allow users to register and authenticate using device biometrics (Face ID, Touch ID, Windows Hello, Android Biometrics) or other FIDO2-compliant authenticators via the WebAuthn standard, including synced Passkeys (Apple/Google/Microsoft).

**Approach**: Implement the WebAuthn flow using the `SimpleWebAuthn` libraries for frontend/backend, Firebase Cloud Functions for server logic, Firestore for storing public key credentials, and Firebase Custom Tokens for final authentication.

**Recommended Libraries**:
*   `@simplewebauthn/browser`: Frontend library for interacting with the browser's WebAuthn API.
*   `@simplewebauthn/server`: Backend library for generating/verifying challenges and responses (used in Cloud Functions).

**Implementation Steps**:

1.  **Setup Backend (Cloud Functions)** 🔄:
    *   Install `@simplewebauthn/server` in the `functions` directory.
    *   Create HTTPS callable Cloud Functions for:
        *   `generateRegistrationOptions`: Generates challenges for registering a new Passkey/credential. Requires user's Firebase Auth UID and potentially email/name.
        *   `verifyRegistration`: Verifies the browser's response to the registration challenge. Stores the validated public key credential (and related metadata like `credentialID`, `transports`) in Firestore, associated with the user's UID (e.g., in a subcollection `users/{userId}/passkeys`).
        *   `generateAuthenticationOptions`: Generates challenges for authenticating with an existing Passkey/credential. May allow specifying `credentialID`s associated with the user.
        *   `verifyAuthentication`: Verifies the browser's response to the authentication challenge. If valid, generates a Firebase Custom Token for the user's UID.
    *   Configure Relying Party (RP) details (RP ID, RP Name) matching the deployed application domains.
    *   Implement Firestore interactions within the functions to store/retrieve Passkey credentials.

2.  **Implement Frontend Registration Flow** 🔄:
    *   Install `@simplewebauthn/browser` in `packages/common` (or individual portals if preferred).
    *   Create a UI section (e.g., in user profile/settings) for users to manage Passkeys.
    *   Add a "Register New Passkey/Device" button.
    *   On click, call the `generateRegistrationOptions` Cloud Function.
    *   Pass the received options to `@simplewebauthn/browser`'s `startRegistration()` function.
    *   Send the result from `startRegistration()` to the `verifyRegistration` Cloud Function.
    *   Provide user feedback on success/failure.

3.  **Implement Frontend Authentication Flow** 🔄:
    *   Add a "Sign in with Passkey/Biometrics" button to `LoginForm.tsx` (conditionally rendered if Passkeys are potentially available for the user/device - might require remembering last username or prompting).
    *   On click:
        *   Call the `generateAuthenticationOptions` Cloud Function (potentially passing the username/email to help backend find associated credentials).
        *   Pass the received options to `@simplewebauthn/browser`'s `startAuthentication()` function.
        *   Send the result from `startAuthentication()` to the `verifyAuthentication` Cloud Function.
    *   If the Cloud Function returns a Firebase Custom Token:
        *   Use the Firebase Auth SDK's `signInWithCustomToken(token)` method.
        *   This completes the sign-in, triggering the `onAuthStateChanged` listener and updating the Zustand store.
    *   Provide user feedback on success/failure.

4.  **Firestore Schema Update** 🔄:
    *   Define the structure for storing Passkey credentials in Firestore (e.g., under `users/{userId}/passkeys/{credentialIdBase64}`). Ensure it includes `credentialID` (as Base64URL string), `publicKey` (as Buffer/Uint8Array or Base64), `counter`, `transports`, etc., as required by SimpleWebAuthn/WebAuthn verification.
    *   Update `firestore.rules` to allow authenticated users to manage their *own* Passkey documents (create/read/delete) and allow the backend functions appropriate access.

5.  **UI/UX Considerations** 🔄:
    *   Clearly explain Passkeys/biometric login to users.
    *   Handle various error scenarios gracefully (unsupported browser, user cancellation, verification failure).
    *   Allow users to name/manage their registered Passkeys/devices.
    *   Consider conditional UI (e.g., only show Passkey login if the browser indicates platform authenticator availability via `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`).

6.  **Testing** ⏳:
    *   Test across different browsers (Chrome, Safari, Firefox, Edge) and operating systems (macOS, Windows, iOS, Android).
    *   Test with different authenticator types (device biometrics, security keys).
    *   Test error handling and recovery flows.

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
    *   Create UI components for viewing and editing user profiles.
    *   Include UI for managing Passkeys (linking to step 4.7.2).
    *   Implement permission-based field visibility and editability.

4.  **Implement Passkey/Biometric Authentication (WebAuthn)** 🔄:
    *   Follow the detailed steps outlined in section 4.7.

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