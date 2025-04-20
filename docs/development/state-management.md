# State Management

*(Documentation to be added)*

This document outlines the state management strategy for the Time Tracking 2.0 application.

## Primary State Management Library: Zustand

The application utilizes Zustand (`zustand`) for global state management. Key characteristics of this approach:

*   **Centralized Stores**: Global state is organized into specific stores (e.g., `useAuthStore`, `useUiStore`) located in `packages/common/src/store`.
*   **Simplicity**: Zustand offers a minimal API for defining state and actions.
*   **Performance**: Uses selectors to optimize component re-renders.
*   **TypeScript Support**: Strong typing for state and actions.

## Authentication State (`useAuthStore`)

As established during the recent refactor:

*   `useAuthStore` is the single source of truth for authentication state (`user`, `userProfile`, `isLoading`, `isAuthenticated`).
*   State is updated by a central `onAuthStateChanged` listener (typically in `App.tsx`).
*   Components access state via selector hooks (`useAuthStatus`, `useCurrentUser`, `useCurrentUserProfile`).
*   Authentication *actions* (`login`, `register`, etc.) are handled separately via React Context (`AuthProvider`).

## Other State Considerations

*   **Local Component State**: Use React's `useState` and `useReducer` for state confined to a single component.
*   **Server Cache State**: Use TanStack Query (`@tanstack/react-query`) for managing server state, caching, and data fetching logic.
*   **Form State**: Consider libraries like React Hook Form for complex forms if needed. 