export interface TimeEntry {
    id: string;
    userId: string;
    companyId: string;
    date: Date | string;
    hours: number;
    projectId?: string;
    description?: string;
    isTimeOff: boolean;
    managerApproved: boolean;
    managerApprovedBy?: string;
    managerApprovedDate?: Date | string;
    yearWeek: string; // Format: YYYY-WW, e.g., "2023-34"
    createdAt: Date | string;
    updatedAt: Date | string;
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