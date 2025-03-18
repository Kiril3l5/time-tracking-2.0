import { getAuth } from 'firebase/auth';
import { TimeEntry } from '../types/firestore';

/**
 * Type for user roles in the system
 */
export type UserRole = 'super-admin' | 'admin' | 'manager' | 'worker';

/**
 * Interface for user data with role information
 */
interface UserWithRole {
  uid: string;
  role?: UserRole;
  assignedWorkers?: string[];
}

/**
 * Check if a user is authenticated
 * @returns Boolean indicating if user is logged in
 */
export function isAuthenticated(): boolean {
  const auth = getAuth();
  return !!auth.currentUser;
}

/**
 * Check if current user has admin role when no user is provided
 * @returns Boolean indicating if user has admin role
 */
export function isAdmin(): boolean;
/**
 * Check if the user is an admin
 * @param user User to check
 * @returns Boolean indicating if user is admin
 */
export function isAdmin(user: UserWithRole | null): boolean;
export function isAdmin(user?: UserWithRole | null): boolean {
  if (user === undefined) {
    // Implementation would typically check claims or roles
    // For now, we'll return a placeholder
    return false;
  }
  
  if (!user) return false;
  return user.role === 'super-admin' || user.role === 'admin';
}

/**
 * Check if current user has manager role when no user is provided
 * @returns Boolean indicating if user has manager role
 */
export function isManager(): boolean;
/**
 * Check if the user is a manager
 * @param user User to check
 * @returns Boolean indicating if user is manager
 */
export function isManager(user: UserWithRole | null): boolean;
export function isManager(user?: UserWithRole | null): boolean {
  if (user === undefined) {
    // Implementation would typically check claims or roles
    return false;
  }
  
  if (!user) return false;
  return user.role === 'manager';
}

/**
 * Check if user can access a specific feature
 * @param featureId The feature identifier to check
 * @returns Boolean indicating if user has access to the feature
 */
export function canAccessFeature(featureId: string): boolean {
  // Implementation would check user's permissions
  // For basic demo, we'll grant access to some features
  const allowedForAll = ['dashboard', 'profile', 'timesheet'];
  return allowedForAll.includes(featureId);
}

/**
 * Check if user can edit a specific resource
 * @param resourceType The type of resource
 * @param resourceId The ID of the resource
 * @returns Boolean indicating if user can edit the resource
 */
export function canEdit(_resourceType: string, _resourceId: string): boolean {
  // Implementation would check ownership or permissions
  return isAdmin() || isManager();
}

/**
 * Check if the manager has a specific worker assigned
 */
export function isManagerOf(manager: UserWithRole | null, workerId: string): boolean {
  if (!manager || !isManager(manager) || !manager.assignedWorkers) return false;
  return manager.assignedWorkers.includes(workerId);
}

/**
 * Check if the user can view a specific time entry
 */
export function canViewTimeEntry(entry: TimeEntry, user: UserWithRole | null): boolean {
  if (!user || !entry) return false;

  // Admin can view any entry
  if (isAdmin(user)) return true;

  // User can view their own entries
  if (entry.userId === user.uid) return true;

  // Manager can view entries from assigned workers
  if (isManager(user) && isManagerOf(user, entry.userId)) return true;

  return false;
}

/**
 * Check if the user can create a time entry
 */
export function canCreateTimeEntry(userId: string, user: UserWithRole | null): boolean {
  if (!user) return false;

  // Users can only create entries for themselves
  return userId === user.uid;
}

/**
 * Check if the user can edit a specific time entry
 */
export function canEditTimeEntry(entry: TimeEntry, user: UserWithRole | null): boolean {
  if (!user || !entry) return false;

  // Admin can edit any entry
  if (isAdmin(user)) return true;

  // User can only edit their own pending entries
  if (entry.userId === user.uid) {
    return entry.status === 'pending';
  }

  return false;
}

/**
 * Check if the user can approve a specific time entry
 */
export function canApproveTimeEntry(entry: TimeEntry, user: UserWithRole | null): boolean {
  if (!user || !entry) return false;

  // Admin can approve any entry
  if (isAdmin(user)) return true;

  // Manager can approve entries from assigned workers
  if (isManager(user) && isManagerOf(user, entry.userId)) {
    return entry.status === 'pending';
  }

  return false;
}

/**
 * Check if the user can delete (soft delete) a specific time entry
 */
export function canDeleteTimeEntry(entry: TimeEntry, user: UserWithRole | null): boolean {
  if (!user || !entry) return false;

  // Admin can delete any entry
  if (isAdmin(user)) return true;

  // User can only delete their own pending entries
  if (entry.userId === user.uid) {
    return entry.status === 'pending';
  }

  return false;
}

/**
 * Check if the user can hard delete a time entry
 * This should only be allowed for admins, and potentially through admin tools
 */
export function canHardDeleteTimeEntry(user: UserWithRole | null): boolean {
  if (!user) return false;

  // Only super-admin can hard delete
  return user.role === 'super-admin';
}
