// Export types if available
export * from './types';

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

// Mobile-optimized UI components
export { default as Card } from './components/ui/Card';
export { default as TextInput } from './components/forms/TextInput';

// New Mobile Components
export { default as OfflineIndicator } from './components/ui/OfflineIndicator';
export { default as DatePickerMobile } from './components/forms/DatePickerMobile';
export { default as TimeInputMobile } from './components/forms/TimeInputMobile';
export { default as DropdownMobile } from './components/forms/DropdownMobile';

// React Query Setup with Offline Support
export * from './lib/react-query';

// Hook exports
export { useAuth } from './hooks/useAuth';
export type { User } from './hooks/useAuth';
export { useViewport } from './hooks/ui/useViewport';
export { useFeatureFlag, useFeatureFlags } from './hooks/features/useFeatureFlag';

// Utility exports
export * from './utils/formatters';
