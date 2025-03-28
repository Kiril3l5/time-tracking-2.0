# Time Tracking System Database Schema

## Overview

This document provides comprehensive documentation for the Time Tracking System's database schema, focusing on the Firestore collections and their relationships. The system is designed around tracking time entries for users within companies, with various roles and permissions governing access control.

## Collections

### 1. Users Collection

Stores core user information, role assignments, permissions, and employment details.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| id | string | Unique user identifier (Firebase Auth UID) | ✓ |
| email | string | User's email address | ✓ |
| firstName | string | User's first name | ✓ |
| lastName | string | User's last name | ✓ |
| companyId | string | Reference to user's company | ✓ |
| managerId | string | Reference to user's manager (or "No Manager") | ✓ |
| role | string | User's role ("user", "manager", "admin", "superadmin") | ✓ |
| active | boolean | Whether the user is active | ✓ |
| status | string | User's status ("active", "inactive", "pending") | ✓ |
| permissions | map | Detailed permissions configuration | ✓ |
| settings | map | Duplicate of permissions for UI settings | ✓ |
| profile | map | Employment and personal details | ✓ |
| billingRate | map | Hourly rates for different work types | ✓ |
| assignedWorkers | array | For managers - list of worker user IDs they manage | |
| managerInfo | map | For managers - approval limits and capabilities | |
| metadata | map | Creation, update timestamps, and version info | ✓ |

#### Permissions Map Structure
```
permissions: {
  approveTime: boolean,        // Can approve time entries
  assignManagers: boolean,     // Can assign managers to workers
  generateInvoices: boolean,   // Can generate invoices
  generateReports: boolean,    // Can generate reports
  manageCompanySettings: boolean, // Can manage company-wide settings
  manageSettings: boolean,     // Can manage system settings
  manageUsers: boolean,        // Can manage users
  modifyEntries: boolean,      // Can modify time entries
  viewAllEntries: boolean,     // Can view all time entries
  viewAllUsers: boolean,       // Can view all users
  viewCompanyData: boolean,    // Can view company data
  viewTeamEntries: boolean     // Can view team's time entries
}
```

#### Profile Map Structure
```
profile: {
  department: string,         // User's department
  position: string,           // Job position/title
  location: string,           // Work location
  phoneNumber: string,        // Contact phone number
  employmentType: string,     // "full-time", "part-time", "contractor", "intern"
  hireDate: timestamp         // Date of hire
}
```

#### Billing Rate Map Structure
```
billingRate: {
  standardRate: number,       // Standard hourly rate
  overtimeRate: number,       // Overtime hourly rate
  ptoRate: number             // Paid time off hourly rate
}
```

#### Manager Info Map Structure
```
managerInfo: {
  canApproveOvertime: boolean,  // Whether manager can approve overtime
  departmentsManaged: array,    // List of departments managed
  maxApprovalAmount: number     // Maximum approval amount limit
}
```

#### Metadata Map Structure
```
metadata: {
  createdAt: timestamp,       // Creation timestamp
  updatedAt: timestamp,       // Last update timestamp
  lastLoginAt: timestamp,     // Last login timestamp
  createdBy: string,          // Who created the record
  version: number             // Record version
}
```

### 2. User Settings Collection

Stores user-specific settings including work schedule and time-off balances.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| userId | string | Reference to user | ✓ |
| createdAt | timestamp | Creation timestamp | ✓ |
| updatedAt | timestamp | Last update timestamp | ✓ |
| schedule | map | Work schedule configuration | ✓ |
| timeOffBalance | map | Time-off balances | ✓ |

#### Schedule Map Structure
```
schedule: {
  startTime: string,          // Daily start time (format: "HH:MM")
  endTime: string,            // Daily end time (format: "HH:MM")
  regularHours: number,       // Regular hours per day
  workDays: array             // Array of workdays (1=Monday, 7=Sunday)
}
```

#### Time Off Balance Map Structure
```
timeOffBalance: {
  pto: {
    total: number,            // Total PTO hours available
    used: number,             // PTO hours used
    pending: number           // Pending PTO request hours
  },
  sick: {
    total: number,            // Total sick hours available
    used: number,             // Sick hours used
    pending: number           // Pending sick request hours
  }
}
```

### 3. User Stats Collection

Tracks usage statistics and performance metrics for users.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| userId | string | Reference to user | ✓ |
| createdAt | timestamp | Creation timestamp | ✓ |
| updatedAt | timestamp | Last update timestamp | ✓ |
| totalHoursWorked | number | Total hours worked | ✓ |
| totalOvertimeHours | number | Total overtime hours | ✓ |
| totalPtoUsed | number | Total PTO hours used | ✓ |
| totalSickDaysUsed | number | Total sick days used | ✓ |
| averageHoursPerWeek | number | Average weekly hours | ✓ |
| submissionStreak | number | Consecutive days of submission | ✓ |
| lastSubmission | timestamp | Last time entry submission | |

### 4. Time Entries Collection

Records individual time entries for work and time-off.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| id | string | Unique entry identifier | ✓ |
| userId | string | User who created the entry | ✓ |
| companyId | string | Company ID | ✓ |
| date | string | Entry date (YYYY-MM-DD format) | ✓ |
| hours | number | Total hours | ✓ |
| regularHours | number | Regular hours worked | ✓ |
| overtimeHours | number | Overtime hours | ✓ |
| ptoHours | number | PTO hours | ✓ |
| unpaidLeaveHours | number | Unpaid leave hours | ✓ |
| status | string | Status ("pending", "approved", "rejected") | ✓ |
| isDeleted | boolean | Soft delete flag | ✓ |
| isSubmitted | boolean | Whether entry is submitted | ✓ |
| isTimeOff | boolean | Whether entry is time off | ✓ |
| timeOffType | string | Type of time off | |
| needsApproval | boolean | Whether approval is required | ✓ |
| managerApproved | boolean | Whether manager approved | ✓ |
| overtimeApproved | boolean | Whether overtime is approved | ✓ |
| notes | string | Entry notes | |
| createdAt | timestamp | Creation timestamp | ✓ |
| updatedAt | timestamp | Last update timestamp | ✓ |
| updatedBy | string | ID of user who last updated | ✓ |

### 5. Companies Collection

Stores company information and configuration.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| id | string | Unique company identifier | ✓ |
| name | string | Company name | ✓ |
| createdAt | timestamp | Creation timestamp | ✓ |
| updatedAt | timestamp | Last update timestamp | ✓ |
| status | string | Company status | ✓ |
| settings | map | Company settings | ✓ |

#### Settings Map Structure
```
settings: {
  weekConfig: {
    startDay: number,         // Week start day (1=Monday, 0=Sunday)
    workWeekLength: number,   // Work week length in days
    overtimeThreshold: number, // Daily hours threshold for overtime
    timeZone: string,         // Company timezone
    useUTC: boolean           // Whether to use UTC for calculations
  }
}
```

## Relationships

1. **User → Company**: Each user belongs to one company via `companyId`
2. **User → Manager**: Users can have a manager via `managerId`
3. **Manager → Workers**: Managers have assigned workers via `assignedWorkers` array
4. **User → Settings**: One-to-one relationship via `userId`
5. **User → Stats**: One-to-one relationship via `userId`
6. **User → Time Entries**: One-to-many relationship via `userId` in time entries

## Security Considerations

- Users should only access their own data or data they're authorized to view based on role
- Managers should only access data for their assigned workers
- Time entries should be modifiable by the creator when in "pending" status
- Company settings should only be modified by admins or authorized managers
- See firestore.rules for detailed security rules

## Default Values

### New User Defaults
- role: "user" (unless specified)
- active: true
- status: "active"
- permissions: based on role (see permissions documentation)
- schedule: 9am-5pm, Monday-Friday
- timeOffBalance: PTO: 80 hours, Sick: 40 hours

## Schema Evolution Guidelines

1. Always maintain backward compatibility
2. Add new fields with default values
3. Document all schema changes in version history
4. Use batch operations for schema migrations
5. Test migrations in development environment before production 