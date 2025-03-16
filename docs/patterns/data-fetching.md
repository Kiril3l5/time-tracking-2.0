# Data Fetching Strategy

## Overview

This document outlines the data fetching approach for the Time Tracking System. We use React Query for server-state management with standardized patterns for handling loading states, errors, and caching.

## Core Principles

1. **Separation of Concerns**
   - Service layer handles API communication
   - React Query manages caching, refetching, and synchronization
   - Components focus on rendering and user interaction

2. **Consistent User Experience**
   - Standardized loading indicators
   - Predictable error handling
   - Optimistic updates for immediate feedback

3. **Performance Optimization**
   - Minimized network requests
   - Data prefetching for anticipated user flows
   - Background data refresh

## Implementation Details

### React Query Configuration

We configure React Query with these default settings:

```typescript
// src/lib/react-query.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 2, // Retry failed requests twice before giving up
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: 'always', // Refresh when tab becomes active
      refetchOnMount: true, // Refresh when component mounts
      refetchOnReconnect: true, // Refresh when internet reconnects
    },
    mutations: {
      retry: 1, // Only retry mutations once
    },
  },
});
```

### Standard Query Hooks Pattern

All query hooks follow a consistent structure:

```typescript
// Example query hook
export function useTimeEntries(userId: string, dateRange: DateRange) {
  return useQuery({
    queryKey: ['timeEntries', userId, dateRange.start, dateRange.end],
    queryFn: () => timeEntriesApi.getByUserAndDateRange(userId, dateRange.start, dateRange.end),
    select: (data) => sortTimeEntriesByDate(data), // Optional transformation
    onError: (error) => {
      // Centralized error handling
      errorHandler.handleQueryError(error, 'Failed to load time entries');
    },
  });
}
```

### Loading State Handling

We use these standardized loading indicators:

1. **Full-page Loading**: For initial page load
   ```tsx
   function TimeEntriesPage() {
     const { data, isLoading } = useTimeEntries(userId, dateRange);
     
     if (isLoading) {
       return <FullPageLoader />;
     }
     
     // Rest of component
   }
   ```

2. **Content Skeletons**: For content areas within a loaded page
   ```tsx
   function TimeEntriesList() {
     const { data, isLoading } = useTimeEntries(userId, dateRange);
     
     return (
       <Card>
         <CardHeader>Time Entries</CardHeader>
         <CardBody>
           {isLoading ? (
             <TimeEntriesSkeleton />
           ) : (
             // Render actual data
           )}
         </CardBody>
       </Card>
     );
   }
   ```

3. **Inline Loaders**: For refreshing existing content
   ```tsx
   function TimeEntriesList() {
     const { data, isLoading, isFetching } = useTimeEntries(userId, dateRange);
     
     return (
       <Card>
         <CardHeader>
           Time Entries
           {isFetching && !isLoading && <InlineSpinner />}
         </CardHeader>
         {/* ... */}
       </Card>
     );
   }
   ```

### Error Handling

We implement a multi-layered approach to error handling:

1. **Global Error Handler**
   ```typescript
   // src/utils/errorHandler.ts
   export const errorHandler = {
     handleQueryError: (error, userMessage) => {
       console.error('Query error:', error);
       toast.error(userMessage || 'An error occurred. Please try again.');
     },
     
     handleMutationError: (error, userMessage) => {
       console.error('Mutation error:', error);
       toast.error(userMessage || 'Action failed. Please try again.');
     }
   };
   ```

2. **Error Boundaries**: For catching rendering errors
   ```tsx
   <ErrorBoundary
     FallbackComponent={ErrorFallback}
     onError={(error) => errorHandler.logError(error)}
   >
     <TimeEntriesPage />
   </ErrorBoundary>
   ```

3. **Query-level Error UI**
   ```tsx
   function TimeEntriesList() {
     const { data, isLoading, error } = useTimeEntries(userId, dateRange);
     
     if (error) {
       return <ErrorCard message="Failed to load time entries" retryAction={refetch} />;
     }
     
     // Regular component rendering
   }
   ```

### Optimistic Updates

For a responsive user experience, we implement optimistic updates:

```typescript
function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (newEntry) => timeEntriesApi.create(newEntry, currentUser),
    
    onMutate: async (newEntry) => {
      // 1. Cancel any outgoing refetches
      await queryClient.cancelQueries(['timeEntries']);
      
      // 2. Save current data
      const previousEntries = queryClient.getQueryData(['timeEntries']);
      
      // 3. Generate temp ID for optimistic update
      const tempEntry = {
        ...newEntry,
        id: `temp-${Date.now()}`,
        status: 'pending',
      };
      
      // 4. Update Zustand store (for immediate UI updates)
      timeEntriesStore.actions.addEntry(tempEntry);
      
      // 5. Return context for potential rollback
      return { previousEntries, tempEntry };
    },
    
    onSuccess: (result, variables, context) => {
      // Replace optimistic entry with real one
      timeEntriesStore.actions.removeEntry(context.tempEntry.id);
      timeEntriesStore.actions.addEntry(result);
      
      // Refresh queries to ensure consistency
      queryClient.invalidateQueries(['timeEntries']);
    },
    
    onError: (error, variables, context) => {
      // Revert to previous state
      timeEntriesStore.actions.removeEntry(context.tempEntry.id);
      
      // Show error notification
      errorHandler.handleMutationError(error, 'Failed to create time entry');
    }
  });
}
```

### Prefetching Strategy

We prefetch data for anticipated user flows:

```typescript
function TimeEntryCalendar({ selectedMonth }) {
  const queryClient = useQueryClient();
  
  // Prefetch next and previous months
  useEffect(() => {
    const nextMonth = addMonths(selectedMonth, 1);
    const prevMonth = addMonths(selectedMonth, -1);
    
    queryClient.prefetchQuery(
      ['timeEntries', userId, formatDate(startOfMonth(nextMonth)), formatDate(endOfMonth(nextMonth))],
      () => timeEntriesApi.getByUserAndDateRange(
        userId, 
        formatDate(startOfMonth(nextMonth)), 
        formatDate(endOfMonth(nextMonth))
      )
    );
    
    // Similar for previous month
  }, [selectedMonth, userId, queryClient]);
  
  // Rest of component
}
```

## Best Practices

1. **Consistent Query Keys**: Use predictable patterns for query keys
   ```typescript
   // Entity-based keys
   ['timeEntries'] // List of all entries
   ['timeEntries', userId] // Entries for a specific user
   ['timeEntries', userId, startDate, endDate] // With date filters
   ['timeEntry', entryId] // Single entry
   ```

2. **Dedicated API Services**: Keep API logic separate from React components
   ```typescript
   // services/api/time-entries.ts
   export const timeEntriesApi = {
     getById: (id) => {...},
     getByUserAndDateRange: (userId, startDate, endDate) => {...},
     create: (entry, user) => {...},
     // More methods...
   };
   ```

3. **Background Fetching**: Always show the existing data while fetching updates
   ```typescript
   const { data, isFetching } = useQuery({...});
   
   return (
     <div>
       {isFetching && <RefreshIndicator />}
       <DataDisplay data={data} />
     </div>
   );
   ```

4. **Request Deduplication**: Avoid duplicate requests for the same data
   ```typescript
   // Both components will share the same query
   function ParentComponent() {
     return (
       <>
         <ChildA userId="123" />
         <ChildB userId="123" />
       </>
     );
   }
   
   // Both use the same queryKey, so only one request is made
   function ChildA({ userId }) {
     const { data } = useUser(userId);
     // ...
   }
   
   function ChildB({ userId }) {
     const { data } = useUser(userId);
     // ...
   }
   ```

## Caching Policies

We implement these caching policies:

1. **Default Stale Time**: 5 minutes
2. **Default Cache Time**: 10 minutes
3. **Infinite Lists**: Cache indefinitely, invalidate on mutations
4. **User Profile**: Cache for 30 minutes, invalidate on auth changes

## Offline Support Considerations

While full offline support is not implemented, we handle network disruptions gracefully:

1. **Toast notifications** for connection status
2. **Retry logic** for failed requests
3. **Mutation queuing** for operations during offline periods

This pattern ensures a consistent, responsive, and reliable data fetching approach across the application. 