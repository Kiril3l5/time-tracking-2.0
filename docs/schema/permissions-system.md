# Time Tracking System Permissions

## Overview

This document details the permissions system used throughout the Time Tracking application. The system implements role-based access control (RBAC) with granular permissions at the feature level.

## Role Hierarchy

The system implements the following role hierarchy, from highest to lowest privileges:

1. **Superadmin**: Complete system access with no limitations
2. **Admin**: Company-wide administrative access
3. **Manager**: Team and worker management capabilities
4. **User**: Basic time tracking capabilities

## Permission Map

Each user has a permissions map that defines their specific capabilities:

| Permission | Description | Admin | Manager | User |
|------------|-------------|:-----:|:-------:|:----:|
| approveTime | Can approve time entries | ✓ | ✓ | ✗ |
| assignManagers | Can assign managers to workers | ✓ | ✗ | ✗ |
| generateInvoices | Can generate invoices | ✓ | ✓ | ✗ |
| generateReports | Can generate reports | ✓ | ✓ | ✗ |
| manageCompanySettings | Can manage company settings | ✓ | ✗ | ✗ |
| manageSettings | Can manage system settings | ✓ | ✗ | ✗ |
| manageUsers | Can manage users | ✓ | ✗ | ✗ |
| modifyEntries | Can modify entries after creation | ✓ | ✗ | ✗ |
| viewAllEntries | Can view all time entries | ✓ | ✗ | ✗ |
| viewAllUsers | Can view all users | ✓ | ✗ | ✗ |
| viewCompanyData | Can view company-wide data | ✓ | ✓ | ✗ |
| viewTeamEntries | Can view team's time entries | ✓ | ✓ | ✗ |

## Permission Implementation

Permissions are implemented at three levels:

1. **Database Security Rules**: Enforced at the Firestore level
2. **Server-side Functions**: Double-checked in Cloud Functions
3. **Client-side UI**: Reflected in UI visibility and capabilities

### Database Rules Implementation

```
// Check if user has specific permission
function hasPermission(permission) {
  let userData = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
  return permission in userData.permissions && 
         userData.permissions[permission] == true;
}
```

### Client-side Permission Helpers

The application provides several helper functions to check permissions:

```typescript
// Check if user has a specific permission
export function hasPermission(user: User, permission: string): boolean {
  if (!user || !user.permissions) return false;
  return user.permissions[permission] === true;
}

// Check if user can approve time entries
export function canApproveTime(user: User): boolean {
  return hasPermission(user, 'approveTime');
}
```

## Permissions by Role

### Superadmin

Superadmins have all permissions automatically granted and can:
- Access and modify any data within the system
- Manage system configuration
- Create and manage companies
- Access cross-company data and reports

### Admin

Admins can perform company-wide management:
- Manage all users within their company
- View and approve all time entries within their company
- Generate company-wide reports and invoices
- Configure company settings
- Manage billing rates and time-off policies

### Manager

Managers have team management capabilities:
- View and approve time entries for their assigned workers
- Generate reports for their team
- Generate invoices for their team
- View team performance metrics
- Cannot change company settings or access other teams' data

### User

Users have basic time tracking capabilities:
- Submit their own time entries
- View their own time history
- Request time off
- View their own time off balances
- Cannot view or modify other users' data

## Permission Assignment

### Default Permissions

New users receive default permissions based on their assigned role:

```typescript
// Generate permissions based on role
function generateDefaultPermissionsForRole(role: UserRole): UserPermissions {
  // Default - no permissions
  const base: UserPermissions = {
    approveTime: false,
    assignManagers: false,
    generateInvoices: false,
    generateReports: false,
    manageCompanySettings: false,
    manageSettings: false,
    manageUsers: false,
    modifyEntries: false,
    viewAllEntries: false,
    viewAllUsers: false,
    viewCompanyData: false,
    viewTeamEntries: false,
  };

  switch (role) {
    case 'superadmin':
      // All permissions
      return Object.keys(base).reduce((acc, key) => {
        acc[key as keyof UserPermissions] = true;
        return acc;
      }, { ...base });
      
    case 'admin':
      return {
        ...base,
        approveTime: true,
        assignManagers: true,
        generateInvoices: true,
        generateReports: true,
        manageUsers: true,
        viewAllEntries: true,
        viewAllUsers: true,
        viewCompanyData: true,
        viewTeamEntries: true,
      };
      
    case 'manager':
      return {
        ...base,
        approveTime: true,
        generateReports: true,
        generateInvoices: true,
        viewTeamEntries: true,
        viewCompanyData: true,
      };
      
    case 'user':
    default:
      return base;
  }
}
```

### Custom Permissions

Admins can assign custom permissions to users, overriding the defaults for their role. This allows for flexible permission schemes while maintaining the role-based structure.

## Advanced Manager Capabilities

Managers have additional capabilities defined in their managerInfo object:

```typescript
managerInfo: {
  canApproveOvertime: boolean,  // Whether manager can approve overtime
  departmentsManaged: string[], // Departments this manager supervises
  maxApprovalAmount: number     // Maximum amount this manager can approve
}
```

## Best Practices

1. **Principle of Least Privilege**: Always assign the minimum permissions needed
2. **Role Consistency**: Try to maintain standard permission sets for each role
3. **Permission Auditing**: Regularly review and audit user permissions
4. **Custom Permissions**: Use sparingly and document exceptions
5. **Separation of Duties**: Critical functions should require multiple roles 