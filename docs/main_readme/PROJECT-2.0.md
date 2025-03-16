# TIME TRACKING SYSTEM - ARCHITECTURE 2.0

## 1. OVERVIEW

A modern, TypeScript-based time tracking application with two completely separate sites:
- **/hours**: End-user facing application for time entry and tracking
- **/admin**: Administration portal for managers and administrators

Both sites are hosted on Firebase and share a common Firebase database for time entries, approvals, and user management.

This architecture prioritizes:
- Clear separation of concerns between end-user and admin functionality
- Performance and responsiveness
- Maintainability and scalability
- Type safety
- Developer experience

**Note**: This document provides the high-level architectural blueprint. Detailed implementation guides are referenced in [Related Documentation](#14-related-documentation).

## 2. TECHNICAL STACK

### Core Technology
- **Language**: TypeScript (strict mode)
- **Framework**: React 18
- **Build Tool**: Vite (with multi-site configuration)
- **Package Manager**: pnpm (for efficient dependency management)

### Infrastructure
- **Hosting**: Firebase Hosting (with separate targets for /hours and /admin)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Authentication
- **Functions**: Firebase Cloud Functions
- **Storage**: Firebase Storage

### Frontend Architecture
- **State Management**: Redux Toolkit (global state), React Query (Firebase data)
- **Styling**: Tailwind CSS (utility-first), CSS Modules (component-specific styles)
- **Routing**: React Router v6
- **Form Management**: React Hook Form + Zod validation
- **Date Handling**: date-fns

### Quality Assurance
- **Testing**: Vitest, React Testing Library, and Playwright
- **Linting**: ESLint with TypeScript plugin
- **Formatting**: Prettier
- **Type Checking**: TypeScript in strict mode

For implementation patterns and best practices, see the [State Management Guide] and [UI/UX Guidelines].

## 3. PROJECT STRUCTURE

The project is structured as a monorepo with separate packages for each site, sharing common code:

```
project-root/
├── package.json                # Root workspace configuration
├── pnpm-workspace.yaml         # Workspace definition
├── tsconfig.json               # Base TypeScript configuration
├── vite.config.ts              # Shared Vite configuration
├── firebase.json               # Firebase configuration
├── firestore.rules             # Firestore security rules
├── firestore.indexes.json      # Firestore indexes
├── .firebaserc                 # Firebase project configuration
├── .github/                    # GitHub configuration
│   └── workflows/              # CI/CD workflows
│       ├── deploy.yml          # Deployment workflow
│       ├── preview.yml         # Preview deployment workflow
│       └── test.yml            # Testing workflow
│
├── packages/
│   ├── common/                 # Shared code between sites
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── src/
│   │   │   ├── types/          # Shared TypeScript interfaces
│   │   │   │   ├── time-entry.ts
│   │   │   │   ├── user.ts
│   │   │   │   └── company.ts
│   │   │   ├── utils/          # Shared utility functions
│   │   │   │   ├── date.ts
│   │   │   │   ├── validation.ts
│   │   │   │   └── formatting.ts
│   │   │   ├── hooks/          # Shared React hooks
│   │   │   │   ├── useAuth.ts
│   │   │   │   ├── useTimeEntries.ts
│   │   │   │   └── useNotifications.ts
│   │   │   ├── components/     # Shared UI components
│   │   │   │   ├── Button/
│   │   │   │   ├── Form/
│   │   │   │   └── Layout/
│   │   │   └── firebase/       # Firebase client utilities
│   │   │       ├── auth.ts
│   │   │       ├── firestore.ts
│   │   │       └── storage.ts
│   │   └── tests/
│   │       ├── setup.ts
│   │       └── __mocks__/
│   │
│   ├── hours/                  # End-user time tracking site
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── features/       # Feature-based organization
│   │   │   │   ├── time-entries/  # Time entry management
│   │   │   │   │   ├── components/
│   │   │   │   │   ├── hooks/
│   │   │   │   │   ├── store/
│   │   │   │   │   └── utils/
│   │   │   │   ├── calendar/      # Calendar views
│   │   │   │   │   ├── components/
│   │   │   │   │   ├── hooks/
│   │   │   │   │   └── utils/
│   │   │   │   ├── projects/      # Project selection
│   │   │   │   └── profile/       # User profile management
│   │   │   ├── layouts/      # Layout components
│   │   │   │   ├── MainLayout.tsx
│   │   │   │   └── AuthLayout.tsx
│   │   │   ├── pages/        # Page components
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── TimeEntry.tsx
│   │   │   │   └── Profile.tsx
│   │   │   ├── store/        # Global state
│   │   │   │   ├── index.ts
│   │   │   │   └── slices/
│   │   │   ├── routes.tsx    # Application routes
│   │   │   ├── main.tsx      # Entry point
│   │   │   └── App.tsx       # Application root
│   │   └── tests/
│   │       ├── e2e/
│   │       └── unit/
│   │
│   └── admin/                  # Admin management site
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── src/
│       │   ├── features/       # Feature-based organization
│       │   │   ├── user-management/  # User administration
│       │   │   │   ├── components/
│   │   │   │   ├── hooks/
│   │   │   │   └── store/
│   │   │   ├── approvals/        # Time entry approvals
│   │   │   ├── reporting/        # Reports and analytics
│   │   │   └── settings/         # System settings
│   │   ├── layouts/        # Layout components
│   │   ├── pages/          # Page components
│   │   ├── store/          # Global state
│   │   ├── routes.tsx      # Application routes
│   │   ├── main.tsx        # Entry point
│   │   └── App.tsx         # Application root
│   │
│   └── tests/
│       ├── e2e/
│       └── unit/
│
├── functions/                  # Firebase Cloud Functions
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── auth/               # Authentication triggers
│   │   │   ├── onCreate.ts
│   │   │   └── onDelete.ts
│   │   ├── notifications/      # Notification functions
│   │   │   ├── approvals.ts
│   │   │   └── reminders.ts
│   │   ├── reports/            # Report generation
│   │   │   ├── timesheet.ts
│   │   │   └── summary.ts
│   │   ├── api/                # API endpoints
│   │   │   ├── users.ts
│   │   │   └── timeEntries.ts
│   │   └── index.ts            # Functions entry point
│   └── tests/
│       └── unit/
│
└── scripts/                    # Build and deployment scripts
    ├── build.js
    ├── deploy.js
    └── setup-env.js
```

## 4. CORE DOMAIN MODELS

The following TypeScript interfaces reflect the exact structure of the Firestore collections to ensure perfect type alignment between the /hours portal and /admin portal:

### TimeEntry Interface

```typescript
interface TimeEntry {
  id: string;                     // Document ID (same as timeEntryId)
  userId: string;                 // User who created the entry
  companyId: string;              // Company ID the entry belongs to
  date: string;                   // Date in 'YYYY-MM-DD' format
  hours: number;                  // Total hours for the entry
  regularHours: number;           // Regular working hours
  overtimeHours: number;          // Overtime hours
  ptoHours: number;               // Paid time off hours
  unpaidLeaveHours: number;       // Unpaid leave hours
  status: string;                 // Status of the entry (pending, approved, rejected)
  isSubmitted: boolean;           // Whether the entry has been submitted
  needsApproval: boolean;         // Whether the entry needs manager approval
  managerApproved: boolean;       // Whether a manager has approved the entry
  overtimeApproved: boolean;      // Whether overtime has been approved
  isTimeOff: boolean;             // Whether this is a time off entry
  timeOffType: string;            // Type of time off (paid, unpaid, sick, etc.)
  notes: string;                  // Optional notes for the entry
  isDeleted: boolean;             // Soft deletion flag
  createdAt: Timestamp;           // When the entry was created
  updatedAt: Timestamp;           // When the entry was last updated
  updatedBy: string;              // User who last updated the entry
}

enum TimeEntryStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  APPROVED = 'approved', 
  REJECTED = 'rejected'
}

enum TimeOffType {
  PTO = 'pto',
  SICK = 'sick',
  UNPAID = 'unpaid',
  OTHER = 'other'
}
```

### User Interface

```typescript
interface User {
  id: string;                    // User's unique ID
  firstName: string;             // User's first name
  lastName: string;              // User's last name
  email: string;                 // User's email address
  role: UserRole;                // User role (worker, manager, admin)
  companyId: string;             // Company the user belongs to
  managerId: string;             // ID of the user's manager
  active: string;                // Whether the user is active
  status: UserStatus;            // User status (active, inactive, pending)
  assignedWorkers: string[];     // List of worker IDs this user manages (for managers)
  managerInfo?: ManagerInfo;     // Additional manager information
  permissions: UserPermissions;  // Granular permission controls
  profile: UserProfile;          // User profile information
  settings: UserSettings;        // User-specific settings
  metadata: UserMetadata;        // Metadata about the user record
  schedule: UserSchedule;        // Work schedule settings
  timeOffBalance: TimeOffBalance; // Time off allocation and usage
  updatedAt: Timestamp;          // When the user record was last updated
}

interface ManagerInfo {
  canApproveOvertime: boolean;
  departmentsManaged: string[];
  maxApprovalAmount: number;
}

interface UserPermissions {
  approveTime: boolean;
  assignManagers: boolean;
  generateInvoices: boolean;
  generateReports: boolean;
  manageCompanySettings: boolean;
  manageSettings: boolean;
  manageUsers: boolean;
  modifyEntries: boolean;
  viewAllEntries: boolean;
  viewAllUsers: boolean;
  viewCompanyData: boolean;
  viewTeamEntries: boolean;
}

// Other User-related interfaces are defined in the same pattern
```

### Company Interface

```typescript
interface Company {
  id: string;                    // Company's unique ID
  name: string;                  // Company name
  address: Address;              // Company address details
  contactInfo: ContactInfo;      // Company contact information
  taxInfo: TaxInfo;              // Tax information
  settings: CompanySettings;     // Company-wide settings
  subscription: Subscription;    // Subscription details
  status: string;                // Company status (active, inactive)
  createdAt: Timestamp;          // When the company was created
  updatedAt: Timestamp;          // When the company was last updated
}

interface CompanySettings {
  weekConfig: {
    startDay: number;            // 0 = Sunday, 1 = Monday
    workWeekLength: number;      // Typically 5
    overtimeThreshold: number;   // Hours threshold for overtime
    timeZone: string;            // Default timezone (e.g., "America/New_York")
  };
  payroll: {
    payPeriod: string;           // weekly, biweekly, monthly
    payrollProvider: string;
  };
  billing: {
    defaultRate: number;         // Default hourly rate
    currency: string;            // USD, EUR, etc.
    invoicingPeriod: string;     // monthly, quarterly
  };
  approvals: {
    requireManagerApproval: boolean;
    autoApproveRegularHours: boolean;
    requireOvertimeApproval: boolean;
  };
}

// Other Company-related interfaces are defined in the same pattern
```

### Other Critical Interfaces

```typescript
interface UserStats {
  userId: string;                // User ID reference
  totalHoursWorked: number;      // Total hours worked
  averageHoursPerWeek: number;   // Average hours per week
  totalOvertimeHours: number;    // Total overtime hours
  totalPtoUsed: number;          // Total PTO used
  totalSickDaysUsed: number;     // Total sick days used
  submissionStreak: number;      // Consecutive days with submissions
  lastSubmission: Timestamp;     // Last submission date
  createdAt: Timestamp;          // When stats were first created
  updatedAt: Timestamp;          // When stats were last updated
}

interface Report {
  id: string;                    // Report ID
  companyId: string;             // Company ID
  reportType: string;            // Type of report
  startDate: Timestamp;          // Report period start
  endDate: Timestamp;            // Report period end
  generatedBy: string;           // User who generated the report
  format: string;                // PDF, CSV, Excel
  status: string;                // generated, pending, error
  url: string;                   // Download URL for the report
  settings: ReportSettings;      // Report settings
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## 5. FIRESTORE COLLECTIONS STRUCTURE

The application uses the following Firestore collections:

- **timeEntries/**: Stores all time tracking entries with detailed hour types
- **users/**: User accounts with detailed profiles, permissions, and settings
- **companies/**: Company information including settings and subscription details
- **userStats/**: Aggregated statistics for each user's time entries
- **reports/**: Generated report metadata and download links

All collections maintain exact alignment with the TypeScript interfaces defined above to ensure type safety throughout the application.

## 6. TIME AND DATE HANDLING

Time and date management is critical in a time tracking application. The system implements the following approach:

### Core Time Strategy
- **Storage**: All timestamps and dates are stored in UTC in the database
  - TimeEntry dates use ISO format strings ('YYYY-MM-DD')
  - Timestamps use Firebase Timestamp objects (based on UTC)
- **Display**: Times and dates are converted to the company's local timezone only for display
  - Each company configures its preferred timezone (e.g., "America/New_York")
  - The frontend uses date-fns to handle all conversions

### Week Structure
- **Week Start**: Configurable per company (0 = Sunday, 1 = Monday)
- **Work Week Length**: Customizable per company (typically 5 days)
- **Work Hours**: User schedules define expected work hours

### Time Calculations
- **Regular Hours**: Tracked against company-defined thresholds
- **Overtime Hours**: Calculated when work exceeds threshold
- **Time Off**: Categorized by type (PTO, sick leave, unpaid)

### Best Practices
- Always perform time-based calculations in UTC to avoid DST complications
- Apply timezone conversions only at the presentation layer
- Ensure all reporting periods align with company-defined week structures
- Store date ranges with inclusive start and exclusive end dates

## 7. FEATURE MODULES

### Hours Site (End-User)

#### Authentication
- Multi-factor authentication with SMS verification
- Secure authentication flow with email verification
- Short-lived JWT tokens with automatic refresh
- Session management with ability to terminate sessions
- Security features including IP detection and rate limiting

#### Time Entry Management
- Time entry creation and editing with validation
- Filterable list and calendar views of entries
- Quick-entry mode for faster time logging

#### Calendar Views
- Day, week, and month visualizations of time entries
- Interactive entry creation directly from calendar
- Aggregated view of hours by project or category

#### User Profile
- Personal information management
- Password and security settings
- Notification preferences

### Admin Site (Management)

#### User Management
- User creation, editing, and deactivation
- Role and permission assignment
- Bulk user operations

#### Approval Workflow
- Dashboard of pending approvals
- Detailed entry review interface
- Batch approval capabilities

#### Reporting & Analytics
- Customizable report generation
- Data visualization dashboards
- Export to multiple formats (PDF, Excel, CSV)

#### System Settings
- Company-wide configuration
- Project and task management
- Integration with other systems

## 8. AUTHENTICATION & SECURITY

### Authentication Flow
1. Users sign in with email/password or SSO
2. Firebase Authentication validates credentials
3. Custom claims are attached to auth tokens for role-based permissions
4. Auth state is maintained using React Context
5. Protected routes enforce access based on roles and permissions

### Security Model
1. **Role-Based Access Control**:
   - Worker: Access to own time entries
   - Manager: Access to assigned workers' entries, approval capabilities
   - Admin: Full system access
   - Super Admin: Configuration and security rule changes

2. **Firestore Security Rules**: Rules verify that users can only:
   - Read/write their own time entries
   - Managers can read/approve their team's entries
   - Company access is restricted to company members
   - Administrative actions require appropriate roles

3. **Token Security**:
   - Short-lived JWT tokens (1 hour expiration)
   - Secure token refresh mechanism
   - Token revocation on security events

## 9. ERROR HANDLING

The application implements a comprehensive error handling strategy:

1. **Client-Side Validation**:
   - Zod schema validation for all forms
   - Field-level error messages
   - Client-side validation before submission

2. **API Error Handling**:
   - Clear user feedback for all API errors
   - Retry mechanisms for transient errors
   - Fallback UI components when data is unavailable

3. **Connectivity Management**:
   - Clear offline indicators
   - Guidance for operations requiring connectivity
   - Recovery paths when connection is restored

## 10. TESTING STRATEGY

The testing strategy employs multiple layers:

1. **Unit Testing**: For utility functions and business logic
2. **Component Testing**: For UI components and interactions
3. **Integration Testing**: For feature modules and flows
4. **E2E Testing**: For complete user journeys
5. **Firebase Testing**: Using emulators for database and auth testing

Automated tests run on pull requests and before deployments to ensure quality.

## 11. DEPLOYMENT

The application uses Firebase Hosting with a multi-site configuration:

1. Each site (/hours and /admin) has its own hosting target
2. GitHub Actions automate the build and deployment process
3. Preview deployments are created for pull requests
4. Production deployments require approval
5. Cache configurations optimize loading performance

## 12. FIRESTORE BEST PRACTICES

1. **Document Structure**:
   - Keep documents under 1MB
   - Use subcollections for one-to-many relationships
   - Denormalize critical data for query efficiency

2. **Query Optimization**:
   - Create compound indexes for common queries
   - Always include filters on indexed fields
   - Use pagination for large result sets

3. **Data Access Patterns**:
   - Use batched writes for related updates
   - Use transactions for consistency-critical operations
   - Prefer one-time gets over real-time listeners where appropriate

## 13. CONCLUSION

This architecture document provides the foundation for building a modern, maintainable time tracking system with two separate sites hosted on Firebase. It emphasizes:

- Clear type definitions aligned with Firestore collections
- Separation of concerns between user and admin functionality
- Robust security and authentication
- Comprehensive error handling
- Performance-optimized data access

The system is designed to be modular and extensible, allowing for future feature expansion while maintaining a consistent architecture.

## 14. RELATED DOCUMENTATION

This architecture overview is complemented by the following detailed implementation guides:

### Core Implementation Guides

| Guide | Description | Priority |
|-------|-------------|----------|
| [Security Implementation Guide](security-implementation-guide.md) | Detailed guide on Firestore security rules, authentication flows, and token management | High |
| [State Management Guide](state-management-guide.md) | Patterns for managing application state, data flow, and Firebase integration | High |
| [Time Entry Workflow Guide](time-entry-workflow-guide.md) | Complete implementation of the time entry lifecycle from creation to approval | High |
| [Firebase Data Access Patterns](firebase-data-access-patterns.md) | Detailed patterns for accessing Firestore data, service layer implementation, and React Query integration | High |
| [Firebase Integration Guide](firebase-integration-guide.md) | Comprehensive Firebase setup with type-safe configuration, authentication, Firestore access, and emulator integration | High |
| [UI Component Library](ui-component-library.md) | Comprehensive component library with Tailwind implementation using #ff8d00 accent color and Roboto Condensed font | Medium |
| [Development & Deployment Guide](development-deployment-guide.md) | Local development configuration, workflows, and deployment procedures | Medium |
| [Reporting System](reporting-system-guide.md) | Client-side report generation with data export capabilities and scalable architecture | Medium |

### User Flows & Business Logic

| Document | Description | Priority |
|----------|-------------|----------|
| [Time Entry Workflow](time-entry-workflow-guide.md) | Detailed flow diagrams and validation rules for time entry submission and approval | High |
| [Reporting System](reporting-system-guide.md) | Report generation specifications, data aggregation patterns, and export functionality | Medium |
| [User Management Flow](user-management-flow.md) | User onboarding, role assignment, and permission management | Medium |

### Operational Documentation

| Document | Description | Priority |
|----------|-------------|----------|
| [Monitoring & Logging](monitoring-logging-guide.md) | Logging standards, monitoring setup, and alerting configuration | Low |
| [Development & Deployment Guide](development-deployment-guide.md) | Comprehensive guide for development environment setup, workflows, and deployment procedures | Medium |
| **Performance Benchmarks** | Performance expectations, testing methodologies, and optimization techniques | Low |

### Development References

| Document | Description | Priority |
|----------|-------------|----------|
| [Development & Deployment Guide](development-deployment-guide.md) | Local development configuration, emulator setup, testing environment, and deployment procedures | High |
| **Contribution Guidelines** | Code standards, PR process, and review checklist | Medium |
| **Troubleshooting Guide** | Common issues and their solutions | Low |

Each of these documents follows a consistent structure:
1. Purpose and scope
2. Detailed implementation guidelines
3. Examples and code snippets
4. Integration with other system components
5. Do's and don'ts