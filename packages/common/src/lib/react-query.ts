import { QueryClient } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';

/**
 * Default configuration for React Query with offline support
 * - staleTime: 5 minutes (data considered fresh for 5 minutes)
 * - gcTime: 24 hours (unused data kept in memory for 24 hours for offline access)
 * - retries: 3 (retry failed queries three times)
 * - networkMode: 'always' (use cached data when offline)
 * - refetchOnWindowFocus: true (refetch when window regains focus)
 * - refetchOnReconnect: true (refetch when network reconnects)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 24 * 60 * 60 * 1000, // 24 hours - keep data much longer for offline use
      retry: 3,
      networkMode: 'always', // Use cached data when offline
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      networkMode: 'always', // Allow mutation attempts while offline (will be queued)
    },
  },
});

// Set up online status detection
if (typeof window !== 'undefined') {
  onlineManager.setEventListener(setOnline => {
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
    
    return () => {
      window.removeEventListener('online', () => setOnline(true));
      window.removeEventListener('offline', () => setOnline(false));
    };
  });
}

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

/**
 * Check if the app is currently online
 * @returns True if the app is online, false otherwise
 */
export const isOnline = (): boolean => {
  return onlineManager.isOnline();
};

/**
 * Reset all query cache data
 * Useful when logging out or changing users
 */
export const resetQueryCache = (): Promise<void> => {
  return queryClient.resetQueries();
};
