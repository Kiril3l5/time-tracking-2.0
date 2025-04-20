# API Integration

*(Documentation to be added)*

This document will describe how the frontend applications interact with backend APIs and services, primarily Firebase.

## Key Interactions:

*   **Firebase Authentication**: Handled via the Firebase JS SDK (`firebase/auth`), abstracted through `AuthProvider` (for actions) and `useAuthStore` (for state). See [Firebase Auth Integration Plan](./firebase-auth-integration-plan.md).
*   **Firestore Database**: Direct interaction using the Firebase JS SDK (`firebase/firestore`) for CRUD operations on collections like `users`, `timeEntries`, `companies`, etc. 
    *   Data fetching and server state management often utilize TanStack Query (`@tanstack/react-query`).
    *   Firestore security rules enforce access control.
*   **Firebase Cloud Functions**: Interactions with Cloud Functions (if any are implemented, e.g., for complex backend logic, scheduled tasks, or third-party integrations) would typically occur via HTTPS callable functions using `firebase/functions`.
*   **Other APIs**: Details on integrating with any other third-party APIs.

## Data Fetching Strategy:

*   Primarily uses TanStack Query for fetching/caching Firestore data.
*   Realtime listeners (e.g., `onSnapshot`) may be used where appropriate. 