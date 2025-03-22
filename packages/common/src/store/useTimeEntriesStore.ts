import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { TimeEntry } from '../types/firestore';

/**
 * Time entries state interface
 */
interface TimeEntriesState {
  // Time entries data
  entries: Record<string, TimeEntry>;

  // Current selections
  selectedDate: string | null;
  selectedEntryId: string | null;

  // Filters
  filters: {
    startDate: string | null;
    endDate: string | null;
    userId: string | null;
    status: string | null;
  };

  // Loading states for optimistic updates
  loading: {
    creating: boolean;
    updating: Record<string, boolean>;
    deleting: Record<string, boolean>;
  };

  // Actions
  actions: {
    // Data actions
    setEntries: (entries: TimeEntry[]) => void;
    addEntry: (entry: TimeEntry) => void;
    updateEntry: (id: string, data: Partial<TimeEntry>) => void;
    removeEntry: (id: string) => void;

    // Selection actions
    selectDate: (date: string | null) => void;
    selectEntry: (id: string | null) => void;

    // Filter actions
    setDateRange: (startDate: string | null, endDate: string | null) => void;
    setUserFilter: (userId: string | null) => void;
    setStatusFilter: (status: string | null) => void;
    resetFilters: () => void;

    // Loading state actions
    setCreating: (isCreating: boolean) => void;
    setUpdating: (id: string, isUpdating: boolean) => void;
    setDeleting: (id: string, isDeleting: boolean) => void;
  };
}

/**
 * Default filters
 */
const defaultFilters = {
  startDate: null,
  endDate: null,
  userId: null,
  status: null,
};

/**
 * Time entries state store
 * Manages time entry data and UI state
 */
export const useTimeEntriesStore = create<TimeEntriesState>()(
  immer((set) => ({
    // Initial state
    entries: {},
    selectedDate: null,
    selectedEntryId: null,
    filters: { ...defaultFilters },
    loading: {
      creating: false,
      updating: {},
      deleting: {},
    },

    // Actions
    actions: {
      // Data actions
      setEntries: (entries: TimeEntry[]) =>
        set((state: TimeEntriesState) => {
          // Reset current entries
          state.entries = {};

          // Index entries by ID for faster lookup
          entries.forEach((entry: TimeEntry) => {
            state.entries[entry.id] = entry;
          });
        }),

      addEntry: (entry: TimeEntry) =>
        set((state: TimeEntriesState) => {
          state.entries[entry.id] = entry;
        }),

      updateEntry: (id: string, data: Partial<TimeEntry>) =>
        set((state: TimeEntriesState) => {
          if (state.entries[id]) {
            state.entries[id] = {
              ...state.entries[id],
              ...data,
            };
          }
        }),

      removeEntry: (id: string) =>
        set((state: TimeEntriesState) => {
          delete state.entries[id];
        }),

      // Selection actions
      selectDate: (date: string | null) =>
        set((state: TimeEntriesState) => {
          state.selectedDate = date;
        }),

      selectEntry: (id: string | null) =>
        set((state: TimeEntriesState) => {
          state.selectedEntryId = id;
        }),

      // Filter actions
      setDateRange: (startDate: string | null, endDate: string | null) =>
        set((state: TimeEntriesState) => {
          state.filters.startDate = startDate;
          state.filters.endDate = endDate;
        }),

      setUserFilter: (userId: string | null) =>
        set((state: TimeEntriesState) => {
          state.filters.userId = userId;
        }),

      setStatusFilter: (status: string | null) =>
        set((state: TimeEntriesState) => {
          state.filters.status = status;
        }),

      resetFilters: () =>
        set((state: TimeEntriesState) => {
          state.filters = { ...defaultFilters };
        }),

      // Loading state actions
      setCreating: (isCreating: boolean) =>
        set((state: TimeEntriesState) => {
          state.loading.creating = isCreating;
        }),

      setUpdating: (id: string, isUpdating: boolean) =>
        set((state: TimeEntriesState) => {
          state.loading.updating[id] = isUpdating;

          // Clean up if not updating
          if (!isUpdating) {
            delete state.loading.updating[id];
          }
        }),

      setDeleting: (id: string, isDeleting: boolean) =>
        set((state: TimeEntriesState) => {
          state.loading.deleting[id] = isDeleting;

          // Clean up if not deleting
          if (!isDeleting) {
            delete state.loading.deleting[id];
          }
        }),
    },
  }))
);

// Selector hooks for better performance
export const useTimeEntries = () => {
  const entries = useTimeEntriesStore((state: TimeEntriesState) => state.entries);
  return Object.values(entries);
};

export const useTimeEntry = (id: string | null) => {
  return useTimeEntriesStore((state: TimeEntriesState) => (id ? state.entries[id] : null));
};

export const useSelectedEntry = () => {
  const selectedId = useTimeEntriesStore((state: TimeEntriesState) => state.selectedEntryId);
  return useTimeEntry(selectedId);
};

export const useTimeEntriesFilters = () => useTimeEntriesStore((state: TimeEntriesState) => state.filters);

export const useFilteredTimeEntries = () => {
  const entries = useTimeEntries();
  const filters = useTimeEntriesFilters();

  return entries.filter((entry: TimeEntry) => {
    // Filter by date range
    if (filters.startDate && entry.date < filters.startDate) {
      return false;
    }

    if (filters.endDate && entry.date > filters.endDate) {
      return false;
    }

    // Filter by user
    if (filters.userId && entry.userId !== filters.userId) {
      return false;
    }

    // Filter by status
    if (filters.status && entry.status !== filters.status) {
      return false;
    }

    return true;
  });
};

// Loading state selectors
export const useTimeEntryLoadingState = (id: string) => {
  return useTimeEntriesStore((state: TimeEntriesState) => ({
    isUpdating: !!state.loading.updating[id],
    isDeleting: !!state.loading.deleting[id],
  }));
};

// Action hooks
export const useTimeEntriesActions = () => useTimeEntriesStore((state: TimeEntriesState) => state.actions);
