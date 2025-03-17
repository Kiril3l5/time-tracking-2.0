# State Management Pattern

## Overview

This document outlines the state management approach for the Time Tracking System. We use a hybrid approach that combines Zustand for client-side state management and React Query for server-side state management.

## State Management Architecture

The application follows a structured approach to state management:

1. **Server State**: Managed via React Query
   - API calls, data fetching, and server synchronization
   - Caching, background updates, and stale-while-revalidate pattern

2. **Global Client State**: Managed via Zustand
   - Authentication state
   - UI state (theme, modals, sidebar)
   - Cross-component shared state

3. **Local Component State**: Managed via React useState/useReducer
   - Form input values
   - UI states specific to a single component
   - Temporary data not needed elsewhere

## Zustand Store Structure

We organize Zustand stores by domain to maintain a clean separation of concerns:

### UI Store (`useUiStore`)

Manages global UI state such as:
- Theme preferences
- Sidebar state
- Modal dialogs
- Toast notifications
- Mobile menu state

```typescript
// Example usage
import { useSidebar, useSidebarActions } from '@common';

function Sidebar() {
  const { isOpen, width } = useSidebar();
  const { toggleSidebar } = useSidebarActions();
  
  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`} style={{ width }}>
      <button onClick={toggleSidebar}>Toggle</button>
    </div>
  );
}
```

### Authentication Store (`useAuthStore`)

Manages user authentication state:
- Current user
- User profile and permissions
- Authentication status

```typescript
// Example usage
import { useAuthStatus, useProfile, useIsAdmin } from '@common';

function ProfileSection() {
  const { isAuthenticated, isLoading } = useAuthStatus();
  const profile = useProfile();
  const isAdmin = useIsAdmin();
  
  if (isLoading) return <Spinner />;
  if (!isAuthenticated) return <LoginPrompt />;
  
  return (
    <div>
      <h2>Welcome, {profile?.firstName}</h2>
      {isAdmin && <AdminControls />}
    </div>
  );
}
```

### Time Entries Store (`useTimeEntriesStore`)

Manages time entry data and related UI state:
- Time entry data
- Selected entries/dates
- Filters and sorting
- Loading states for optimistic updates

```typescript
// Example usage
import { useTimeEntries, useTimeEntriesActions } from '@common';

function TimeEntryList() {
  const entries = useTimeEntries();
  const { selectEntry } = useTimeEntriesActions();
  
  return (
    <ul>
      {entries.map(entry => (
        <li key={entry.id} onClick={() => selectEntry(entry.id)}>
          {entry.date}: {entry.hours} hours
        </li>
      ))}
    </ul>
  );
}
```

## Immer Integration

Zustand is configured with Immer middleware to allow for intuitive state updates using mutable syntax:

```typescript
// Without Immer
set((state) => ({
  ...state,
  entries: {
    ...state.entries,
    [id]: {
      ...state.entries[id],
      ...data
    }
  }
}));

// With Immer
set((state) => {
  state.entries[id] = {
    ...state.entries[id],
    ...data
  };
});
```

## Selector Hooks Pattern

We use selector hooks to optimize rendering and provide a clean API for components:

1. **Slice Selectors**: Return a specific piece of state
   ```typescript
   export const useTheme = () => useUiStore((state) => state.theme);
   ```

2. **Computed Selectors**: Transform state into derived data
   ```typescript
   export const useIsAdmin = () => {
     const profile = useProfile();
     return !!profile && (profile.role === 'admin' || profile.role === 'super-admin');
   };
   ```

3. **Action Selectors**: Group related actions
   ```typescript
   export const useModalActions = () => useUiStore((state) => ({
     openModal: state.actions.openModal,
     closeModal: state.actions.closeModal,
     toggleModal: state.actions.toggleModal,
   }));
   ```

## Integration with React Query

For data that requires server synchronization, we combine Zustand with React Query:

```typescript
// Example of Zustand and React Query working together
function TimeEntriesPage() {
  const { data, isLoading } = useQuery(['timeEntries'], fetchTimeEntries);
  const { setEntries } = useTimeEntriesActions();
  
  // Sync server data to Zustand store
  useEffect(() => {
    if (data) {
      setEntries(data);
    }
  }, [data, setEntries]);
  
  // Rest of component using local state from Zustand
}
```

## Best Practices

1. **Use Selectors**: Always access state via selector hooks, not directly from the store
2. **Minimize Re-renders**: Create granular selectors that select only the data needed
3. **Separate Logic**: Keep business logic in store actions, UI logic in components
4. **Immutable Updates**: Use Immer for complex state updates
5. **TypeScript**: Leverage TypeScript for type safety in state management

## When to Use Each Type of State

- **React Query**: For any data that comes from or needs to be synchronized with the server
- **Zustand**: For global UI state and client-only application state
- **React useState**: For component-specific UI state that doesn't need to be shared

This hybrid approach gives us the benefits of both worlds: efficient server state management with React Query and simple, performant client state management with Zustand. 