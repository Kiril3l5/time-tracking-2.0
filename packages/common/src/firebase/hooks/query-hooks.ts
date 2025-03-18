import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
} from '@tanstack/react-query';
import {
  timeEntryService,
  companyService,
  userService,
  userStatsService,
  createDocument,
  updateDocument,
  deleteDocument,
  timeEntriesCollection,
} from '../firestore/firestore-service';
import { TimeEntry, Company } from '../../types/firestore';

// Time entry hooks
export function useTimeEntries(userId: string, yearWeek: string) {
  return useQuery({
    queryKey: ['timeEntries', userId, yearWeek],
    queryFn: () => timeEntryService.getUserWeekEntries(userId, yearWeek),
  });
}

export function useCreateTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newEntry: Omit<TimeEntry, 'id'>) =>
      createDocument(timeEntriesCollection, newEntry),
    onSuccess: data => {
      queryClient.invalidateQueries({
        queryKey: ['timeEntries', data.userId, data.yearWeek],
      });
    },
  });
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TimeEntry> }) =>
      updateDocument(timeEntriesCollection, id, data),
    onSuccess: () => {
      // We don't know the userId and yearWeek here, so we need to invalidate all timeEntries queries
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteDocument(timeEntriesCollection, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

export function useSubmitForApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entryIds: string[]) => timeEntryService.submitForApproval(entryIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

// Company hooks
export function useCompany(
  companyId: string | undefined,
  options?: UseQueryOptions<Company | null>
) {
  return useQuery({
    queryKey: ['company', companyId],
    queryFn: () => (companyId ? companyService.getCompany(companyId) : null),
    enabled: !!companyId,
    ...options,
  });
}

// Team members hooks
export function useTeamMembers(managerId: string | undefined) {
  return useQuery({
    queryKey: ['teamMembers', managerId],
    queryFn: () => (managerId ? userService.getTeamMembers(managerId) : []),
    enabled: !!managerId,
  });
}

// UserStats hooks
export function useUserStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['userStats', userId],
    queryFn: () => (userId ? userStatsService.getUserStats(userId) : null),
    enabled: !!userId,
  });
}
