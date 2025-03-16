# User Management Flow Guide

## Overview

This guide documents the complete user lifecycle within the Time Tracking System, from initial onboarding to eventual offboarding. It defines the processes for user creation, role assignment, permission management, and team structuring that form the foundation of the admin portal functionality.

## User Lifecycle

```
┌──────────────┐     ┌──────────────┐     ┌───────────────┐     ┌────────────┐     ┌───────────────┐
│  Invitation  │────▶│  Onboarding  │────▶│ Active Status │────▶│ Offboarding│────▶│   Archived    │
└──────────────┘     └──────────────┘     └───────────────┘     └────────────┘     └───────────────┘
```

### 1. Invitation Phase

The lifecycle begins when an administrator or manager with user management permissions invites a new user:

1. Admin creates user profile with initial role assignment
2. System generates secure invitation token
3. Email invitation is sent with secure registration link
4. Invitation has configurable expiration (default: 7 days)

### 2. Onboarding Phase

When a user accepts an invitation:

1. User completes registration by:
   - Setting password (meeting security requirements)
   - Completing required profile information
   - Accepting terms and privacy policy
2. Admin receives notification of completed registration
3. Admin configures additional permissions and team assignments
4. User completes any required training or orientation

### 3. Active Status

During active employment:

1. User regularly submits time entries
2. Periodic permission and role reviews occur
3. Team assignments may change based on organizational needs
4. Manager assignments may change

### 4. Offboarding Phase

When a user leaves the organization:

1. Admin initiates offboarding process
2. User account is deactivated (not deleted)
3. Manager is notified to reassign responsibilities
4. Final time approvals are processed

### 5. Archived Status

After offboarding:

1. User data is retained according to retention policies
2. Account can be reactivated if user returns
3. Historical time data remains accessible to authorized administrators

## Role Assignment

### Core Roles

The system implements a hierarchical role structure:

1. **Worker**
   - Basic time entry capabilities
   - View and edit own time entries
   - View own reports and statistics

2. **Manager**
   - All worker capabilities
   - Approve assigned workers' time entries
   - View team reports and statistics
   - Limited user management for team members

3. **Admin**
   - All manager capabilities
   - Full user management across the organization
   - Company settings configuration
   - Access to all reports and analytics

4. **Super Admin**
   - All admin capabilities
   - Security configuration access
   - System-wide settings management
   - Billing and subscription management

### Role Assignment Process

1. Initial role is assigned during user creation
2. Role changes require appropriate permissions
3. Role changes trigger security rule reevaluation
4. History of role changes is maintained in audit logs

## Permission Management

The system uses granular permissions that can be assigned independently of roles for maximum flexibility:

### Permission Categories

1. **Time Entry Permissions**
   - Create own entries
   - Edit own entries
   - View historical entries
   - Submit entries for approval

2. **Approval Permissions**
   - Approve team time entries
   - Approve overtime
   - Override approvals
   - Batch approve entries

3. **User Management Permissions**
   - Create users
   - Deactivate users
   - Assign roles
   - Modify permissions
   - Manage team assignments

4. **Reporting Permissions**
   - Generate reports
   - Export data
   - Schedule recurring reports
   - Access sensitive financial data

5. **Administrative Permissions**
   - Manage company settings
   - Configure workflows
   - Integrate with external systems
   - Access audit logs

### Permission Assignment Flow

Permissions can be managed at three levels:

1. **Role-Based Default Permissions**
   - Each role has a default set of permissions
   - When a role is assigned, its default permissions are applied

2. **Custom Permission Profiles**
   - Administrators can create permission profiles
   - Profiles can be applied to multiple users

3. **Individual Permission Overrides**
   - Specific permissions can be granted or revoked per user
   - Overrides take precedence over role-based permissions

## Team Structuring

Teams represent organizational units within the company, typically departments or projects:

### Team Hierarchy

The system supports multi-level team structures:

```
Company
  ├── Department A
  │   ├── Team A1
  │   └── Team A2
  └── Department B
      ├── Team B1
      └── Team B2
```

### Team Management Process

1. **Team Creation**
   - Admins define teams with clear hierarchy
   - Teams have designated managers
   - Teams can be associated with projects or departments

2. **User Assignment**
   - Users can belong to multiple teams
   - Primary team determines default approval flow
   - Secondary teams enable work across departments

3. **Manager Assignment**
   - Each team has one or more managers
   - Managers have approval authority for team members
   - Manager reassignment includes approval transfer

## Implementation Patterns

### User Creation

```typescript
// Core user creation function in the admin service
async function createUser(userData: NewUserData): Promise<UserCreationResult> {
  try {
    // 1. Validate input data
    const validatedData = validateUserData(userData);
    
    // 2. Create auth user (handled by Firebase Cloud Function)
    const authResult = await createAuthUser(validatedData.email);
    
    // 3. Create Firestore user document
    const userDoc = await createUserDocument({
      id: authResult.uid,
      email: validatedData.email,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      role: validatedData.role,
      companyId: validatedData.companyId,
      managerId: validatedData.managerId,
      status: 'invited',
      // Initialize default fields based on role
      permissions: getDefaultPermissionsForRole(validatedData.role),
      // Other required fields with defaults
    });
    
    // 4. Generate and store invitation token
    const invitationToken = await generateInvitationToken(authResult.uid);
    
    // 5. Send invitation email
    await sendInvitationEmail({
      email: validatedData.email,
      token: invitationToken,
      expiresIn: INVITATION_EXPIRY_DAYS,
    });
    
    // 6. Return success with user ID
    return {
      success: true,
      userId: authResult.uid,
      status: 'invited',
    };
  } catch (error) {
    // Handle specific error cases
    return {
      success: false,
      error: formatUserCreationError(error),
    };
  }
}
```

### Role and Permission Updates

```typescript
// Update user role with appropriate permission changes
async function updateUserRole(userId: string, newRole: UserRole, options?: RoleUpdateOptions): Promise<UpdateResult> {
  return await runTransaction(async (transaction) => {
    // 1. Get current user data
    const userRef = doc(db, 'users', userId);
    const userSnap = await transaction.get(userRef);
    
    if (!userSnap.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userSnap.data() as User;
    const oldRole = userData.role;
    
    // 2. Determine permission changes
    let newPermissions = userData.permissions;
    
    if (options?.resetPermissions) {
      // Replace with default permissions for new role
      newPermissions = getDefaultPermissionsForRole(newRole);
    } else {
      // Merge: Add any new permissions for the role, keep custom ones
      newPermissions = {
        ...userData.permissions,
        ...getDefaultPermissionsForRole(newRole),
      };
    }
    
    // 3. Update user document
    transaction.update(userRef, {
      role: newRole,
      permissions: newPermissions,
      updatedAt: serverTimestamp(),
    });
    
    // 4. Log role change to audit trail
    const auditRef = doc(collection(db, 'auditLogs'));
    transaction.set(auditRef, {
      type: 'ROLE_CHANGE',
      userId,
      oldRole,
      newRole,
      changedBy: auth.currentUser?.uid,
      timestamp: serverTimestamp(),
    });
    
    // 5. Update custom claims if needed (via separate Cloud Function)
    if (oldRole !== newRole) {
      await updateUserClaims(userId, { role: newRole });
    }
    
    return {
      success: true,
      userId,
      role: newRole,
    };
  });
}
```

### Team Assignment

```typescript
// Assign user to a team
async function assignUserToTeam(userId: string, teamId: string, isPrimary: boolean = false): Promise<TeamAssignmentResult> {
  try {
    // 1. Validate both user and team exist
    const [userDoc, teamDoc] = await Promise.all([
      getDoc(doc(db, 'users', userId)),
      getDoc(doc(db, 'teams', teamId))
    ]);
    
    if (!userDoc.exists()) throw new Error('User not found');
    if (!teamDoc.exists()) throw new Error('Team not found');
    
    const userData = userDoc.data() as User;
    const teamData = teamDoc.data() as Team;
    
    // 2. Update user's team assignments
    const userUpdate: Partial<User> = {
      teams: arrayUnion(teamId),
      updatedAt: serverTimestamp(),
    };
    
    // If primary team, update primaryTeamId
    if (isPrimary) {
      userUpdate.primaryTeamId = teamId;
      userUpdate.managerId = teamData.managerId; // Update manager to team manager
    }
    
    await updateDoc(doc(db, 'users', userId), userUpdate);
    
    // 3. Update team's member list
    await updateDoc(doc(db, 'teams', teamId), {
      members: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });
    
    // 4. If team manager changed, update approvals
    if (isPrimary && userData.managerId !== teamData.managerId) {
      await updatePendingApprovals(userId, teamData.managerId);
    }
    
    return {
      success: true,
      userId,
      teamId,
      isPrimary,
    };
  } catch (error) {
    return {
      success: false,
      error: formatTeamAssignmentError(error),
    };
  }
}
```

## React Query Patterns

The admin interface uses React Query to efficiently manage user data:

```typescript
// Hook for users list with filtering and pagination
function useUsers(filters: UserFilters, pagination: PaginationOptions) {
  return useQuery({
    queryKey: ['users', filters, pagination],
    queryFn: () => fetchUsers(filters, pagination),
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook for role management
function useUpdateUserRole(options?: MutationOptions) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, role }: UpdateRoleParams) => 
      updateUserRole(userId, role),
    onSuccess: (data, variables) => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries(['users']);
      queryClient.invalidateQueries(['user', variables.userId]);
      
      // Optimistically update the user in cache
      queryClient.setQueryData(['user', variables.userId], (oldData: User | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          role: variables.role,
        };
      });
    },
    ...options,
  });
}
```

## Admin UI Patterns

The admin interface follows these patterns for user management:

1. **Tabular User Management**
   - Sortable and filterable user tables
   - Batch operations for efficiency
   - Inline quick actions for common tasks

2. **Hierarchical Team Views**
   - Organizational chart visualization
   - Drag-and-drop team assignments
   - Clear indication of reporting structure

3. **Role and Permission Matrix**
   - Visual matrix of permissions by role
   - Streamlined permission editing
   - Permission comparison between users

## Security Considerations

1. **Permission Validation**
   - All user management actions require appropriate permissions
   - Security rules verify administrator status
   - Audit logs track all permission changes

2. **Principle of Least Privilege**
   - Users receive only permissions needed for their role
   - Temporary permission elevation with automatic expiration
   - Regular permission audits

3. **Critical Action Protection**
   - Two-factor authentication for sensitive operations
   - Confirmation workflows for destructive actions
   - Cool-down period for critical changes

## Best Practices

1. **Efficient User Onboarding**
   - Use batch creation for teams
   - Define permission templates for common roles
   - Provide clear onboarding checklists

2. **Maintaining Security**
   - Conduct periodic role and permission reviews
   - Use the principle of least privilege
   - Document unusual permission configurations

3. **Team Structure Management**
   - Keep team hierarchies flat when possible
   - Clearly document team purposes and responsibilities
   - Regularly review and update team structures

4. **Performance Considerations**
   - Use pagination for large user lists
   - Implement efficient filtering
   - Cache team structures appropriately

## Conclusion

This User Management Flow guide provides a comprehensive framework for implementing the complete user lifecycle within the Time Tracking System. By following these patterns, the application will support efficient user administration while maintaining appropriate security boundaries and organizational structures.

The implementation focuses on a lean approach that can scale as organizational complexity increases, with a clear separation between basic functionality in the initial implementation and more advanced features that can be added incrementally as needed. 