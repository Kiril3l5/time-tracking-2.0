// Type declarations for React Query v5
import { 
  UseQueryOptions as _OriginalUseQueryOptions,
  UseMutationOptions as _OriginalUseMutationOptions,
  QueryClient,
  QueryKey
} from '@tanstack/react-query';

/**
 * Legacy types to ease migration from v4 to v5
 */

// Re-export QueryClient for compatibility
export { QueryClient, QueryKey };

// Define any legacy interfaces needed
declare module '@tanstack/react-query' {
  // Add any missing type definitions here if needed
}
