import { TimeEntry } from '../types/TimeEntry';
import { logInfo } from '../utils/logging';

/**
 * Time Entries API - Abstracts Firebase implementation details
 * This is a temporary placeholder until we properly integrate with the common package
 */
export const timeEntriesApi = {
  /**
   * Create a new time entry
   */
  async create(entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    // Temporary implementation
    logInfo('Creating time entry', entry);
    return 'temp-' + Date.now();
  },

  /**
   * Get a time entry by ID
   */
  async getById(id: string): Promise<TimeEntry | null> {
    // Temporary implementation
    logInfo('Getting time entry', id);
    return null;
  },

  /**
   * Update a time entry
   */
  async update(id: string, data: Partial<TimeEntry>): Promise<void> {
    // Temporary implementation
    logInfo('Updating time entry', { id, data });
  },

  /**
   * Get time entries by user ID and date range
   */
  async getByUserAndDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<TimeEntry[]> {
    // Temporary implementation
    logInfo('Getting time entries', { userId, startDate, endDate });
    return [];
  },

  /**
   * Subscribe to time entries for a user and date range
   */
  onUserEntriesChange(
    userId: string,
    startDate: string,
    endDate: string,
    _callback: (entries: TimeEntry[]) => void
  ): () => void {
    // Temporary implementation
    logInfo('Subscribing to time entries', { userId, startDate, endDate });
    return () => {};
  },
};
