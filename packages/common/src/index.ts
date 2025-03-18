// Export types if available
export * from './types';

// Export components
export * from './components/ErrorBoundary';
export * from './components/NetworkStatus';

// Export utils
export * from './utils/errorHandler';
export * from './utils/permissions';

// Export Firebase
export * from './firebase/performance/performance';

// Export services
export * from './services/api/time-entries';
export * from './services/metadata';

// Firebase core
export * from './firebase/core/firebase';

// Hooks - use explicit imports to avoid name conflicts
export { 
  useTimeEntriesQuery,
  useTimeEntryQuery, 
  useCreateTimeEntry,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
  useProjectTimeEntries,
  useTimeEntriesNeedingApproval
} from './hooks/useTimeEntries';
export * from './hooks/useAuth';

// Store 
export * from './store';

// Types
export * from './types/firestore';

// Component exports
export { Button } from './components/Button';
export type { ButtonProps } from './components/Button';

// Hook exports
export { useAuth } from './hooks/useAuth';
export type { User } from './hooks/useAuth';

// Utility exports
export * from './utils/formatters';

// Network status component
export { NetworkStatus } from './components/NetworkStatus';
