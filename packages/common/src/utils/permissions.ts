import { User } from 'firebase/auth';
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
 * Check if the user is an admin
 */
export function isAdmin(user: UserWithRole | null): boolean {
  if (!user) return false;
  return user.role === 'super-admin' || user.role === 'admin';
}

/**
 * Check if the user is a manager
 */
export function isManager(user: UserWithRole | null): boolean {
  if (!user) return false;
  return user.role === 'manager';
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