/**
 * TimeEntry interface for the Hours portal
 */
export interface TimeEntry {
  id: string;
  userId: string;
  companyId: string;
  date: string; // YYYY-MM-DD format

  // Hours breakdown
  hours: number;
  regularHours: number;
  overtimeHours: number;
  ptoHours: number;
  unpaidLeaveHours: number;

  // Additional fields
  projectId?: string;
  description?: string;
  yearWeek: string; // Format: YYYY-WW, e.g., "2023-34"

  // Workflow state fields
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'processed';
  isSubmitted: boolean;
  needsApproval: boolean;
  managerApproved: boolean;
  overtimeApproved: boolean;
  isTimeOff: boolean;
  timeOffType?: 'pto' | 'sick' | 'unpaid' | 'other';

  // Approval info
  managerId?: string;
  managerApprovedBy?: string;
  managerApprovedDate?: string;
  managerNotes?: string;

  // Metadata
  notes?: string;
  isDeleted: boolean;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  updatedBy?: string;
}
