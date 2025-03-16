# Firestore Security Rules Review

## Overview

This document provides a review of the Firestore security rules and recommendations for enhancing security and access control in the Time Tracking System.

## Current Security Design

The current security model implements:

1. **Role-based Access Control** - Uses roles (admin, manager, user) to determine access permissions
2. **User-specific Access** - Restricts users to accessing only their own data
3. **Hierarchical Access** - Managers can access their assigned workers' data
4. **Company-level Access** - Restricts users to accessing data within their own company

## Security Rule Helper Functions

The current implementation includes several helper functions:

- `isAdmin()` - Checks if the user has admin role
- `isManager()` - Checks if the user has manager role
- `isAuthenticatedUser()` - Verifies authentication
- `hasPermission(permission)` - Checks for specific permissions
- `isManagerOf(workerId)` - Verifies manager relationship
- `getUserCompanyId()` - Gets the user's company ID
- `hasCompanyAccess(companyId)` - Checks if user belongs to a company

## Key Recommendations

### 1. Implement Data Validation

All write operations should validate the incoming data structure to prevent malformed data:

```
// Example: Validate time entry structure
function isValidTimeEntry(data) {
  return data.keys().hasAll(['date', 'hours', 'userId', 'companyId']) &&
         data.date is string &&
         data.hours is number &&
         data.hours >= 0 &&
         data.hours <= 24;
}
```

### 2. Enforce User Identity in Time Entries

Add validation to ensure users can only create/modify entries with their own userId:

```
// In timeEntries collection rules
allow create: if
  request.auth != null &&
  request.resource.data.userId == request.auth.uid &&
  request.resource.data.status == 'pending' &&
  isValidTimeEntry(request.resource.data);
```

### 3. Add Field-level Security for Managers

Restrict what fields managers can modify in worker time entries:

```
// In timeEntries collection rules
allow update: if
  request.auth != null && (
    isAdmin() ||
    (isManager() && 
     getUserAssignedWorkers().hasAny([resource.data.userId]) &&
     request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['status', 'managerApproved', 'managerNotes', 'updatedAt', 'updatedBy'])) ||
    (resource.data.userId == request.auth.uid && 
     resource.data.status == 'pending')
  );
```

### 4. Add Access Auditing

Include `updatedBy` field on all write operations to track changes:

```
// In timeEntries collection rules
allow update: if
  request.auth != null && 
  request.resource.data.updatedBy == request.auth.uid &&
  ...
```

### 5. Protect Deleted Records

Ensure proper handling of soft-deleted entries:

```
// In timeEntries collection rules
allow read: if
  request.auth != null && 
  (!resource.data.isDeleted || isAdmin()) && // Only admins can read deleted entries
  ...
```

### 6. Add Rate Limiting

Consider implementing rate limiting at the Firebase level using Cloud Functions.

### 7. Fix Permissions Checks

Streamline permission checks to avoid redundancy:

```
function canActOnTimeEntry(entryData) {
  return isAdmin() ||
         (isManager() && getUserAssignedWorkers().hasAny([entryData.userId])) ||
         (entryData.userId == request.auth.uid);
}
```

## Implementation Plan

1. **Immediate Changes**:
   - Add data validation to all write operations
   - Fix manager field-level permissions
   - Add updatedBy field enforcement

2. **Near-term Improvements**:
   - Audit and refactor helper functions for consistency
   - Add rate limiting with Cloud Functions
   - Implement comprehensive test suite for security rules

3. **Long-term Security Enhancements**:
   - Consider moving to a Claims-based permission system
   - Implement row-level security for multi-tenant data
   - Add anomaly detection for suspicious activity

## Testing Security Rules

Security rules should be tested thoroughly using the Firebase emulator suite. Example test cases:

1. User can read/write their own time entries
2. User cannot read/write other users' time entries
3. Manager can read their workers' time entries
4. Manager can only update approved fields in worker entries
5. Admin can access all entries across the system 