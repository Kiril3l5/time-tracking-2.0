import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createListQueryKey, createQueryKey } from '../lib/react-query';
import { TimeEntry } from '../types/firestore';
import { 
  getTimeEntries, 
  getTimeEntry, 
  createTimeEntry as apiCreateTimeEntry, 
  updateTimeEntry as apiUpdateTimeEntry, 
  deleteTimeEntry as apiDeleteTimeEntry 
} from '../services/api/time-entries';

/**
 * Hook for fetching time entries with optional filters
 */
export function useTimeEntriesQuery(filters?: Record<string, unknown>) {
  const queryKey = createListQueryKey('timeEntries', filters);
  
  return useQuery({
    queryKey,
    queryFn: () => getTimeEntries(filters),
  });
}

/**
 * Hook for fetching a single time entry by ID
 */
export function useTimeEntryQuery(id: string) {
  const queryKey = createQueryKey('timeEntries', id);
  
  return useQuery({
    queryKey,
    queryFn: () => getTimeEntry(id),
    enabled: !!id,
  });
}

/**
 * Hook for creating a new time entry
 */
export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>) => 
      apiCreateTimeEntry(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [['timeEntries', 'list']] });
    },
  });
}

/**
 * Hook for updating an existing time entry
 */
export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>> }) => 
      apiUpdateTimeEntry(id, data),
    onSuccess: (updatedEntry) => {
      queryClient.invalidateQueries({ queryKey: createQueryKey('timeEntries', updatedEntry.id) });
      queryClient.invalidateQueries({ queryKey: [['timeEntries', 'list']] });
    },
  });
}

/**
 * Hook for deleting a time entry
 */
export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, hardDelete = false }: { id: string, hardDelete?: boolean }) => 
      apiDeleteTimeEntry(id, hardDelete),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [['timeEntries', 'list']] });
    },
  });
} 