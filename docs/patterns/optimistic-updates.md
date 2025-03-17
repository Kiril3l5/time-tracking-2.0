# Optimistic UI Updates Pattern

## Overview

This document outlines the optimistic UI update pattern implemented in the Time Tracking System. Optimistic updates provide immediate feedback to users by updating the UI before server operations complete, creating a more responsive user experience.

## Implementation

The system uses React Query's mutation capabilities combined with a custom optimistic update pattern:

### Core Pattern

1. **Prepare Optimistic Data**: Create a temporary version of the data with a temporary ID
2. **Update Cache**: Add the optimistic data to the React Query cache
3. **Execute Mutation**: Perform the actual server operation
4. **Handle Success**: Replace the temporary data with the real data from the server
5. **Handle Errors**: Revert to the previous state if the operation fails

## Example Implementation

Here's how we implement optimistic updates for time entry creation:

```typescript
function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    // Define the mutation function
    mutationFn: (newEntry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
      return timeEntriesApi.create(newEntry);
    },
    
    // Before mutation execution
    onMutate: async (newEntry) => {
      // Generate a temporary ID
      const tempId = `temp-${Date.now()}`;
      
      // Determine which queries will be affected
      const queryKey = ['timeEntries', user?.id, newEntry.date.substr(0, 10)];
      
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey });
      
      // Snapshot the previous value
      const previousEntries = queryClient.getQueryData<TimeEntry[]>(queryKey) || [];
      
      // Create an optimistic entry
      const optimisticEntry: TimeEntry = {
        id: tempId,
        ...newEntry,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // Update the cache with our optimistic value
      queryClient.setQueryData<TimeEntry[]>(
        queryKey, 
        [...previousEntries, optimisticEntry]
      );
      
      // Return context for potential rollback
      return { previousEntries, tempId };
    },
    
    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (error, variables, context) => {
      if (context?.previousEntries) {
        const queryKey = [
          'timeEntries', 
          user?.id, 
          variables.date.substr(0, 10)
        ];
        
        // Restore the previous state
        queryClient.setQueryData(queryKey, context.previousEntries);
      }
    },
    
    // When the mutation is settled (either success or error)
    onSettled: () => {
      // Invalidate related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}
```

## Best Practices

1. **Generate Unique Temporary IDs**: Use timestamp-based or UUID-based IDs for optimistic entries
2. **Preserve Previous State**: Always store the previous state for potential rollback
3. **Cancel In-flight Queries**: Prevent race conditions by canceling outgoing queries
4. **Invalidate After Settlement**: Ensure data consistency by invalidating affected queries
5. **Handle Errors Gracefully**: Provide clear feedback when operations fail
6. **Simulate Server Behavior**: Make optimistic updates match expected server behavior

## When to Use Optimistic Updates

Optimistic updates are ideal for:

- Time entry creation and updates
- Form submissions where immediate feedback improves UX
- Toggle operations (like marking tasks complete)
- Any operation where the success rate is high

They should be used cautiously for:

- Critical financial transactions
- Operations with complex server-side validation
- Operations that frequently fail

## Implementation in the Time Tracking System

The system implements optimistic updates for:

1. Creating time entries
2. Updating time entries
3. Deleting time entries
4. Submitting time entries for approval

This pattern significantly improves the perceived performance of the application, especially in environments with slower network connections. 