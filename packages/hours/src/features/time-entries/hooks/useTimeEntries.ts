import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeEntriesApi } from '../../../api/time-entries';
import { useEffect, useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { TimeEntry } from '../../../types/TimeEntry';
import type { QueryKey, QueryFunction } from '@tanstack/react-query';

/**
 * Hook to fetch time entries for a date range
 */
export function useTimeEntriesForDateRange(startDate: string, endDate: string) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  // Query key for this data - wrapped in useMemo to avoid dependency array changes
  const queryKey = useMemo(
    () => ['timeEntries', userId, startDate, endDate],
    [userId, startDate, endDate]
  );

  // Set up the query
  const query = useQuery({
    queryKey,
    queryFn: () => timeEntriesApi.getByUserAndDateRange(userId!, startDate, endDate),
    enabled: !!userId,
  });

  // Set up real-time updates
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = timeEntriesApi.onUserEntriesChange(userId, startDate, endDate, entries => {
      // Update the query cache with the latest data
      queryClient.setQueryData(queryKey, entries);
    });

    return unsubscribe;
  }, [userId, startDate, endDate, queryClient, queryKey]);

  return query;
}

/**
 * Hook to create a time entry with optimistic updates
 */
export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (newEntry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
      return timeEntriesApi.create(newEntry);
    },
    onMutate: async newEntry => {
      // Generate a temporary ID for optimistic update
      const tempId = `temp-${Date.now()}`;

      // Get affected query keys
      const queryKey = [
        'timeEntries',
        user?.id,
        newEntry.date.substr(0, 10),
        newEntry.date.substr(0, 10),
      ];

      // Cancel outgoing refetches for the affected queries
      await queryClient.cancelQueries({ queryKey });

      // Get current query cache
      const previousEntries = queryClient.getQueryData<TimeEntry[]>(queryKey) || [];

      // Add optimistic entry to cache
      const optimisticEntry: TimeEntry = {
        id: tempId,
        ...newEntry,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData(queryKey, [...previousEntries, optimisticEntry]);

      // Return context with previous state
      return { previousEntries, tempId };
    },
    onError: (_error, variables, context) => {
      // Restore previous state on error
      if (context?.previousEntries) {
        const queryKey = [
          'timeEntries',
          user?.id,
          variables.date.substr(0, 10),
          variables.date.substr(0, 10),
        ];

        queryClient.setQueryData(queryKey, context.previousEntries);
      }
    },
    onSettled: () => {
      // Invalidate relevant queries to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

/**
 * Hook to update a time entry with optimistic updates
 */
export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TimeEntry> }) => {
      return timeEntriesApi.update(id, data);
    },
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['timeEntries'] });

      // Apply optimistic update
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ['timeEntries'] }, oldData => {
        if (!oldData || !Array.isArray(oldData)) {
          return oldData;
        }
        
        return oldData.map((entry: TimeEntry) =>
          entry.id === id ? { ...entry, ...data, updatedAt: new Date().toISOString() } : entry
        );
      });

      return { id, data };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}
