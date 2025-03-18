import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createListQueryKey, createQueryKey } from '../lib/react-query';
import { TimeEntry } from '../types/firestore';
import {
  getTimeEntries,
  getTimeEntry,
  createTimeEntry as apiCreateTimeEntry,
  updateTimeEntry as apiUpdateTimeEntry,
  deleteTimeEntry as apiDeleteTimeEntry,
} from '../services/api/time-entries';
import { timeEntryService } from '../firebase/firestore/firestore-service';

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
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>>;
    }) => apiUpdateTimeEntry(id, data),
    onSuccess: updatedEntry => {
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
    mutationFn: ({ id, hardDelete = false }: { id: string; hardDelete?: boolean }) =>
      apiDeleteTimeEntry(id, hardDelete),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [['timeEntries', 'list']] });
    },
  });
}

/**
 * Custom hook to fetch time entries for a user for a specific week
 * @param userId The user ID
 * @param yearWeek The year and week in format YYYY-WW
 * @returns Query result with time entries
 */
export function useTimeEntries(userId: string, yearWeek: string) {
  return useQuery({
    queryKey: ['timeEntries', userId, yearWeek],
    queryFn: () => timeEntryService.getUserWeekEntries(userId, yearWeek),
  });
}

/**
 * Custom hook to fetch time entries for a specific project
 * @param projectId The project ID
 * @returns Query result with time entries for the project
 */
export function useProjectTimeEntries(projectId: string) {
  return useQuery({
    queryKey: ['projectTimeEntries', projectId],
    queryFn: () => timeEntryService.getProjectEntries(projectId),
    enabled: !!projectId,
  });
}

/**
 * Custom hook to fetch time entries that need approval
 * @param managerId The manager ID
 * @returns Query result with time entries awaiting approval
 */
export function useTimeEntriesNeedingApproval(managerId: string) {
  return useQuery({
    queryKey: ['timeEntriesNeedingApproval', managerId],
    queryFn: () => timeEntryService.getEntriesNeedingApproval(managerId),
    enabled: !!managerId,
  });
}
