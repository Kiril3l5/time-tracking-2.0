/**
 * Time entry data structure
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
  status: 'pending' | 'approved' | 'rejected';
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
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyId: string;
  managerId?: string;
  role: 'user' | 'manager' | 'admin' | 'superadmin';
  permissions: string[];
  isActive: boolean;
  lastLoginAt?: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  metadata?: {
    registrationMethod: string;
    registrationTime: string;
    userAgent?: string;
    [key: string]: any;
  };
}

export interface Company {
  id: string;
  name: string;
  weekConfig: {
    startDay: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, etc.
    workingDays: number[];
    hoursPerDay: number;
  };
  timezone: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UserStats {
  id: string;
  userId: string;
  companyId: string;
  vacationDaysBalance: number;
  sickDaysBalance: number;
  ytdHoursWorked: number;
  currentWeekHours: number;
  lastUpdated: Date | string;
}

/**
 * User profile information
 */
export interface UserProfile {
  id: string;
  userId: string;
  displayName?: string;
  photoURL?: string;
  jobTitle?: string;
  department?: string;
  phoneNumber?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phoneNumber?: string;
  };
  preferences?: {
    theme?: 'light' | 'dark' | 'system';
    emailNotifications?: boolean;
    pushNotifications?: boolean;
    biometricEnabled?: boolean;
  };
  hireDate?: string;
  terminationDate?: string;
  employmentType?: 'full-time' | 'part-time' | 'contractor' | 'intern';
  createdAt: string;
  updatedAt: string;
}
