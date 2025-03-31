# Time Handling Implementation Plan

## Overview

This document outlines the detailed implementation plan for the time handling functionality in the Time Tracking 2.0 application. Time handling is the core functionality of our system and requires careful implementation to ensure accuracy, flexibility, and a seamless mobile experience.

## Core Time Calculation Engine

### Time Entry Model

Our enhanced time entry model will extend the existing model with additional fields to support more detailed time tracking:

```typescript
interface TimeEntry {
  // Core fields from existing model
  id: string;
  userId: string;
  companyId: string;
  date: string; // YYYY-MM-DD format
  
  // Enhanced hours tracking
  hours: number;               // Total hours (sum of all types)
  regularHours: number;        // Regular work hours
  overtimeHours: number;       // Overtime hours
  ptoHours: number;            // Paid time off
  unpaidLeaveHours: number;    // Unpaid leave
  
  // Improved time tracking (optional fields)
  startTime?: string;          // HH:MM format, for clock in/out
  endTime?: string;            // HH:MM format, for clock in/out
  breaks?: {                   // Break tracking
    start: string;             // HH:MM format
    end: string;               // HH:MM format
    duration: number;          // In minutes
  }[];
  
  // Workflow state fields
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'processed';
  isSubmitted: boolean;
  needsApproval: boolean;
  managerApproved: boolean;
  overtimeApproved: boolean;
  isTimeOff: boolean;
  timeOffType?: 'pto' | 'sick' | 'unpaid' | 'other';
  
  // Additional metadata
  projectId?: string;
  description?: string;
  yearWeek: string; // Format: YYYY-WW
  
  // Approval info
  managerId?: string;
  managerApprovedBy?: string;
  managerApprovedDate?: string;
  managerNotes?: string;
  
  // Metadata
  notes?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
}
```

### Calculation Utilities

The time calculation engine will provide a comprehensive set of utilities for handling various time-related operations:

```typescript
// Time calculation utility
const calculateHours = {
  // Calculate total hours from start/end times
  fromTimeRange: (start: string, end: string, breakMinutes: number = 0): number => {
    if (!start || !end) return 0;
    
    const startDate = parseTimeString(start);
    const endDate = parseTimeString(end);
    
    // Calculate duration in minutes
    const durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000;
    
    // Subtract breaks
    const netMinutes = durationMinutes - breakMinutes;
    
    // Convert to hours with configurable rounding
    return roundTime(netMinutes / 60);
  },
  
  // Round time to nearest increment (default 15min = 0.25h)
  roundToIncrement: (hours: number, increment: number = 0.25): number => {
    return Math.round(hours / increment) * increment;
  },
  
  // Calculate overtime based on regular hours threshold
  calculateOvertime: (totalHours: number, regularThreshold: number): { 
    regularHours: number; 
    overtimeHours: number; 
  } => {
    if (totalHours <= regularThreshold) {
      return { regularHours: totalHours, overtimeHours: 0 };
    }
    
    return {
      regularHours: regularThreshold,
      overtimeHours: totalHours - regularThreshold
    };
  },
  
  // Parse time string in various formats
  parseTimeString: (timeString: string): Date => {
    // Handle different time formats (HH:MM, H:MM, etc.)
    // Return a Date object
  },
  
  // Format hours as HH:MM
  formatAsTime: (hours: number): string => {
    const hoursInt = Math.floor(hours);
    const minutes = Math.round((hours - hoursInt) * 60);
    return `${hoursInt.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
};
```

### Time Entry Validation

Robust validation is essential for maintaining data integrity:

```typescript
// Time entry validation
const validateTimeEntry = {
  // Validate the entire time entry
  validateEntry: (entry: TimeEntry, companySettings: CompanySettings): ValidationResult => {
    const results = [
      validateTimeEntry.validateDate(entry.date, companySettings),
      validateTimeEntry.validateHours(entry),
      validateTimeEntry.validateTimeRange(entry),
      // Add more validations as needed
    ];
    
    return {
      isValid: results.every(r => r.isValid),
      errors: results.flatMap(r => r.errors)
    };
  },
  
  // Validate date is within allowed range
  validateDate: (date: string, companySettings: CompanySettings): ValidationResult => {
    const now = new Date();
    const entryDate = new Date(date);
    const maxPastDays = companySettings.maxPastDaysForEntry || 30;
    
    // Check if date is in the future
    if (entryDate > now) {
      return {
        isValid: false,
        errors: ['Time entries cannot be created for future dates']
      };
    }
    
    // Check if date is too far in the past
    const pastLimit = new Date();
    pastLimit.setDate(now.getDate() - maxPastDays);
    
    if (entryDate < pastLimit) {
      return {
        isValid: false,
        errors: [`Time entries cannot be more than ${maxPastDays} days in the past`]
      };
    }
    
    return { isValid: true, errors: [] };
  },
  
  // Validate hours are logical
  validateHours: (entry: TimeEntry): ValidationResult => {
    // Total hours must be positive
    if (entry.hours <= 0) {
      return {
        isValid: false,
        errors: ['Total hours must be greater than zero']
      };
    }
    
    // Sum of hour types must equal total hours
    const hourSum = 
      entry.regularHours + 
      entry.overtimeHours + 
      entry.ptoHours + 
      entry.unpaidLeaveHours;
    
    if (Math.abs(hourSum - entry.hours) > 0.001) {
      return {
        isValid: false,
        errors: ['Sum of hour types must equal total hours']
      };
    }
    
    return { isValid: true, errors: [] };
  },
  
  // Validate time range if start/end times are provided
  validateTimeRange: (entry: TimeEntry): ValidationResult => {
    if (!entry.startTime || !entry.endTime) {
      return { isValid: true, errors: [] };
    }
    
    const start = parseTimeString(entry.startTime);
    const end = parseTimeString(entry.endTime);
    
    if (end <= start) {
      return {
        isValid: false,
        errors: ['End time must be after start time']
      };
    }
    
    return { isValid: true, errors: [] };
  }
};
```

## Time Entry User Experience

### Mobile Entry Forms

The mobile time entry experience will focus on simplicity and efficiency:

#### Quick Entry Mode

This mode is optimized for rapid time entry with minimal input:

```typescript
// Components to implement:
interface QuickEntryProps {
  onSave: (entry: TimeEntry) => void;
  defaultDate?: string;
  recentProjects: Project[];
}

// Implementation will include:
// 1. Date selection with default to today
// 2. Hour selection with preset buttons (1h, 2h, 4h, 8h)
// 3. Project selection with recently used projects first
// 4. Simple description field with voice input option
// 5. Save as draft or submit buttons
```

#### Detailed Entry Mode

For users who need more precise time tracking:

```typescript
// Components to implement:
interface DetailedEntryProps {
  onSave: (entry: TimeEntry) => void;
  defaultEntry?: Partial<TimeEntry>;
  projects: Project[];
}

// Implementation will include:
// 1. Start/end time selection with clock interface
// 2. Break tracking
// 3. Project and task selection
// 4. Hour type allocation (regular, overtime, PTO)
// 5. Detailed notes field
// 6. Save as draft or submit options
```

### Weekly View

The weekly view will provide an overview of time entries:

```typescript
// Components to implement:
interface WeeklyViewProps {
  userId: string;
  weekStart?: string; // YYYY-MM-DD of week start
  onAddEntry: (date: string) => void;
  onEditEntry: (entry: TimeEntry) => void;
}

// Implementation will include:
// 1. Week navigation with swipe gestures
// 2. Daily summary with status indicators
// 3. Quick-add capability from any day
// 4. Weekly totals with overtime indication
// 5. Submit all pending entries option
```

## Offline Synchronization

### Local Storage Strategy

To ensure a seamless experience in areas with poor connectivity:

```typescript
// Local storage interface
interface LocalStorage {
  // CRUD operations for time entries
  getTimeEntries(filters?: Record<string, any>): Promise<TimeEntry[]>;
  getTimeEntry(id: string): Promise<TimeEntry | null>;
  saveTimeEntry(entry: TimeEntry): Promise<string>; // Returns ID
  deleteTimeEntry(id: string): Promise<void>;
  
  // Sync queue operations
  getSyncQueue(): Promise<SyncQueueItem[]>;
  addToSyncQueue(item: SyncQueueItem): Promise<void>;
  updateSyncQueueItem(item: SyncQueueItem): Promise<void>;
  removeFromSyncQueue(id: string): Promise<void>;
  
  // Cache management
  getCachedData(key: string): Promise<any>;
  setCachedData(key: string, data: any, ttl?: number): Promise<void>;
  clearExpiredCache(): Promise<void>;
}

// Sync queue item structure
interface SyncQueueItem {
  id: string;
  data: TimeEntry;
  operation: 'create' | 'update' | 'delete';
  timestamp: string;
  attempts: number;
  status: 'pending' | 'processing' | 'error';
  error?: string;
}
```

### Synchronization Manager

The sync manager will handle all offline/online transitions:

```typescript
// Simplified implementation
export class TimeEntrySyncManager {
  constructor(
    private localStore: LocalStorage,
    private remoteApi: FirebaseApi,
    private conflictResolver: ConflictResolver
  ) {
    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }
  
  private handleOnline = () => {
    this.processSyncQueue();
  };
  
  private handleOffline = () => {
    // Update UI to show offline status
  };
  
  // Queue an entry for synchronization
  async queueForSync(entry: TimeEntry): Promise<void> {
    await this.localStore.addToSyncQueue({
      id: entry.id || generateUUID(),
      data: entry,
      operation: entry.id ? 'update' : 'create',
      timestamp: new Date().toISOString(),
      attempts: 0,
      status: 'pending'
    });
    
    if (navigator.onLine) {
      this.processSyncQueue();
    }
  }
  
  // Process the sync queue
  async processSyncQueue(): Promise<void> {
    if (!navigator.onLine) return;
    
    const queue = await this.localStore.getSyncQueue();
    
    for (const item of queue) {
      try {
        // Update status to processing
        await this.localStore.updateSyncQueueItem({
          ...item,
          status: 'processing'
        });
        
        // Get latest remote version for conflict detection
        const remoteEntry = item.operation === 'update' 
          ? await this.remoteApi.getTimeEntry(item.data.id)
          : null;
          
        // Check for conflicts
        if (remoteEntry && remoteEntry.updatedAt !== item.data.updatedAt) {
          // Handle conflict
          const resolved = await this.conflictResolver.resolve(item.data, remoteEntry);
          await this.remoteApi.updateTimeEntry(resolved);
        } else {
          // No conflict, proceed with operation
          if (item.operation === 'create') {
            await this.remoteApi.createTimeEntry(item.data);
          } else if (item.operation === 'update') {
            await this.remoteApi.updateTimeEntry(item.data);
          } else if (item.operation === 'delete') {
            await this.remoteApi.deleteTimeEntry(item.data.id);
          }
        }
        
        // Mark as synced by removing from queue
        await this.localStore.removeFromSyncQueue(item.id);
      } catch (error) {
        // Update attempt count and status
        await this.localStore.updateSyncQueueItem({
          ...item,
          attempts: item.attempts + 1,
          status: 'error',
          error: error.message
        });
      }
    }
  }
}
```

### Conflict Resolution

To handle conflicts when entries are modified both offline and online:

```typescript
// Conflict resolver implementation
export class ConflictResolver {
  /**
   * Resolve conflicts between local and remote entries
   * @param localEntry The local version of the time entry
   * @param remoteEntry The remote version of the time entry
   * @returns The resolved entry
   */
  async resolve(localEntry: TimeEntry, remoteEntry: TimeEntry): Promise<TimeEntry> {
    // Check if this is a simple timestamp conflict or actual data conflict
    if (this.areEntriesEquivalent(localEntry, remoteEntry)) {
      // Just a timestamp conflict, local data is same as remote
      return {
        ...localEntry,
        updatedAt: remoteEntry.updatedAt // Use the latest timestamp
      };
    }
    
    // If the remote entry is approved, it takes precedence
    if (remoteEntry.status === 'approved' || remoteEntry.status === 'processed') {
      // Cannot override approved/processed entries
      throw new Error('Cannot modify an approved or processed time entry');
    }
    
    // Check if automatic resolution is possible
    if (this.canAutoResolve(localEntry, remoteEntry)) {
      return this.autoResolve(localEntry, remoteEntry);
    }
    
    // Otherwise, prompt user for manual resolution
    return this.promptForResolution(localEntry, remoteEntry);
  }
  
  /**
   * Check if two entries have equivalent data
   */
  private areEntriesEquivalent(entry1: TimeEntry, entry2: TimeEntry): boolean {
    // Compare all relevant fields except metadata like updatedAt
    // Return true if all important fields match
  }
  
  /**
   * Check if conflict can be auto-resolved
   */
  private canAutoResolve(localEntry: TimeEntry, remoteEntry: TimeEntry): boolean {
    // Determine if automatic resolution is possible based on
    // which fields conflict and business rules
  }
  
  /**
   * Auto-resolve conflict based on rules
   */
  private autoResolve(localEntry: TimeEntry, remoteEntry: TimeEntry): TimeEntry {
    // Apply resolution rules to create a merged entry
    // Use the most recent values for each field where appropriate
  }
  
  /**
   * Prompt user to manually resolve the conflict
   */
  private async promptForResolution(localEntry: TimeEntry, remoteEntry: TimeEntry): Promise<TimeEntry> {
    // Show UI to user with both versions
    // Let them choose which version to keep or create a merged version
    // Return the user-selected resolution
  }
}
```

## Implementation Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Core Time Calculation Engine | Time utilities, validation, basic entry form |
| 2 | Entry Forms & Weekly View | Quick entry mode, detailed entry mode, weekly calendar |
| 3 | Offline Storage | IndexedDB implementation, basic sync functionality |
| 4 | Sync & Conflict Resolution | Complete sync manager, conflict resolution UI |

For a complete strategic timeline including this time handling implementation within the broader application development, see the [Path Forward](./path-forward.md) document.

## Integration with Mobile-First Implementation

This time handling implementation integrates with the [Mobile-First Implementation Plan](../workflow/mobile-first-implementation-plan.md) in the following ways:

1. **Phase 2: Workers Portal (Hours)** - The time entry experience and weekly view will be implemented as part of this phase
2. **Phase 4: Offline Support & Enhancements** - The offline synchronization will be implemented during this phase

The implementation will follow the [Project Structure Guidelines](../workflow/project-structure-guidelines.md) to ensure consistency with the rest of the codebase.

## Conclusion

This detailed implementation plan for time handling provides a roadmap for creating a robust, mobile-friendly time tracking system with offline capabilities. By following this approach, we can deliver a seamless experience for users even in environments with limited connectivity. 