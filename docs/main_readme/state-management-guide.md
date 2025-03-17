# State Management Guide

## 1. Overview

This guide outlines the state management approach for the Time Tracking System, emphasizing clean architecture patterns and Firebase integration best practices.

## 2. Core Principles

- **Single Source of Truth**: Firebase Firestore as the primary data store
- **Unidirectional Data Flow**: Clear path from user actions to state updates
- **Separation of Concerns**: Distinct layers for UI, business logic, and data access
- **Type Safety**: Comprehensive TypeScript typing across all state interactions
- **Performance Optimization**: Strategic data fetching and rendering optimizations

## 3. State Management Architecture

### Multi-Layered Approach

```
┌─────────────────────────────────────────────────┐
│                  UI Components                   │
└───────────────┬─────────────────┬───────────────┘
                │                 │
                ▼                 ▼
┌───────────────────────┐ ┌─────────────────────┐
│     Feature Hooks     │ │    Shared Hooks     │
└───────────┬───────────┘ └──────────┬──────────┘
            │                        │
            ▼                        ▼
┌───────────────────────┐ ┌─────────────────────┐
│  Firebase Service     │ │  React Context      │
│  Layer                │ │  Providers          │
└───────────┬───────────┘ └──────────┬──────────┘
            │                        │
            ▼                        ▼
┌───────────────────────────────────────────────┐
│               Firebase SDK                     │
└───────────────────────────────────────────────┘
```

### Key Components

1. **Context Providers**: Manage global application state
2. **Custom Hooks**: Encapsulate domain-specific logic and Firebase interactions
3. **Firebase Service Layer**: Abstract Firebase SDK operations
4. **Type Definitions**: Ensure consistency between client and database schema

## 4. State Categories

### 1. Authentication State

- Managed by a global AuthContext provider
- Stores current user, role, permissions, and company association
- Handles token refresh and session management
- Provides role-based authorization helpers

### 2. UI State

- Manages application-wide UI elements: theme, sidebar, notifications
- Persists preferences in localStorage
- Provides a consistent notification system

### 3. Domain State

- Feature-specific state managed through custom hooks
- Directly maps to Firestore collections
- Implements role-based access patterns

### 4. Form State

- Controlled through custom form hooks
- Integrated with Zod for validation
- Manages field values, errors, and submission state

## 5. Firebase Data Access Patterns

### Real-time Listeners Pattern

- Primary pattern for time-sensitive data (time entries, approvals)
- Implemented via onSnapshot listeners in custom hooks
- Ensures immediate UI updates on remote changes

Example usage:
```typescript
// Simplified example - see implementation guide for details
function useTimeEntries() {
  // Set up state
  const [entries, setEntries] = useState([]);
  
  // Configure listener with proper security filters
  useEffect(() => {
    const query = buildSecureQuery();
    return onSnapshot(query, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEntries(data);
    });
  }, [dependencies]);
  
  // Return data and operations
  return { entries, addEntry, updateEntry };
}
```

### Request-Response Pattern

- Used for reports, exports, and other non-real-time operations
- Implemented with getDocs and explicit loading states
- Optimized for less frequent data requirements

### Write Operations Pattern

- Utilizes transactions for related updates
- Implements optimistic UI updates where appropriate
- Handles error cases with consistent feedback

## 6. Key Implementation Patterns

### 1. Compound Components Pattern

Used for complex UI components with shared state:

```typescript
// TimeEntryForm example (simplified)
const { Provider, useTimeEntryContext } = createContext();

export function TimeEntryForm({ children, initialValues }) {
  // Form state and handlers
  return <Provider value={formState}>{children}</Provider>;
}

TimeEntryForm.Input = function Input({ field }) {
  const { values, handleChange } = useTimeEntryContext();
  return <input value={values[field]} onChange={handleChange} />;
};

TimeEntryForm.Submit = function Submit() {
  const { handleSubmit } = useTimeEntryContext();
  return <button onClick={handleSubmit}>Save</button>;
};
```

### 2. Custom Hook Composition

Combining specialized hooks for complex features:

```typescript
// Approval workflow example (simplified)
function useApprovalWorkflow(entryId) {
  const { currentUser } = useAuth();
  const { timeEntry } = useTimeEntry(entryId);
  const { user: entryOwner } = useUser(timeEntry?.userId);
  
  // Combine data from multiple sources
  // Provide approval-specific operations
  
  return { /* approval workflow state and functions */ };
}
```

### 3. Responsive State Management

Adapting data fetching based on user viewport and interaction patterns:

```typescript
// Simplified example - see implementation guide for details
function useResponsiveQuery(baseQuery, options) {
  const { isMobile } = useViewport();
  const { isVisible } = useElementVisibility(ref);
  
  // Adjust query limits based on device and visibility
  const optimizedQuery = useMemo(() => {
    const limit = isMobile ? 10 : 25;
    return baseQuery.withLimit(limit);
  }, [baseQuery, isMobile]);
  
  // Only fetch when visible in viewport
  useEffect(() => {
    if (!isVisible) return;
    // Set up data fetching
  }, [isVisible, optimizedQuery]);
  
  // Return data and metadata
}
```

## 7. Performance Optimization

### 1. Strategic Data Loading

- Implement pagination for large datasets (time entries, reports)
- Use query limits and cursor-based pagination
- Fetch data based on viewport visibility

### 2. State Normalization

- Normalize nested data structures for complex entities
- Use reference patterns for relationships between collections
- Implement denormalization for frequently accessed paths

### 3. Rendering Optimization

- Memoize expensive calculations with useMemo and useCallback
- Implement virtualized lists for time entries and reports
- Use React.memo for pure components

## 8. Testing Strategy

### 1. Unit Testing Hooks

- Test custom hooks with @testing-library/react-hooks
- Mock Firebase services with Jest
- Verify state transitions and side effects

### 2. Integration Testing

- Test state flow across components
- Verify Firebase interactions with emulators
- Test role-based access patterns

## 9. Best Practices

1. **Always clean up Firebase listeners** when components unmount
2. **Implement proper error boundaries** for Firebase operation failures
3. **Use loading and error states** consistently across the application
4. **Leverage Firebase security rules** as the ultimate authority for data access
5. **Implement offline support** with careful consideration of merge conflicts
6. **Cache expensive calculations** to minimize re-computation
7. **Prefer server-side aggregation** for reporting and analytics
8. **Structure code for testability** with proper dependency injection 