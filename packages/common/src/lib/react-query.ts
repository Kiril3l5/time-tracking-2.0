import { QueryClient } from '@tanstack/react-query';

/**
 * Default configuration for React Query
 * - staleTime: 5 minutes (data considered fresh for 5 minutes)
 * - cacheTime: 30 minutes (unused data kept in memory for 30 minutes)
 * - retries: 2 (retry failed queries twice)
 * - refetchOnWindowFocus: true (refetch when window regains focus)
 * - refetchOnReconnect: true (refetch when network reconnects)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

/**
 * Prefetches data for queries that will likely be needed soon
 * @param queryKey - The key for the query to prefetch
 * @param queryFn - The function that returns the data
 */
export const prefetchQuery = async <T>(queryKey: unknown[], queryFn: () => Promise<T>) => {
  try {
    await queryClient.prefetchQuery({
      queryKey,
      queryFn,
      staleTime: 5 * 60 * 1000, // 5 minutes
    });
  } catch (error) {
    console.error('Error prefetching query:', error);
  }
};

/**
 * Returns a standardized query key array with an optional ID
 * @param entity - The entity type (e.g., 'timeEntries', 'users')
 * @param id - Optional entity ID
 * @returns Query key array
 */
export const createQueryKey = (entity: string, id?: string): unknown[] => {
  return id ? [entity, id] : [entity];
};

/**
 * Returns a standardized query key for list endpoints with filters
 * @param entity - The entity type (e.g., 'timeEntries', 'users')
 * @param filters - Object containing filter parameters
 * @returns Query key array with filters
 */
export const createListQueryKey = (
  entity: string,
  filters?: Record<string, unknown>
): unknown[] => {
  return filters ? [entity, 'list', filters] : [entity, 'list'];
};
