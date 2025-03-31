import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { onAuthChange, getUserProfile, getUserClaims } from './auth-service';
import { UserProfile } from '../../types/firestore';

/**
 * Type for user claims from Firebase
 */
interface UserClaims {
  role?: string;
  permissions?: string[];
  companyId?: string;
  [key: string]: unknown; // For any other properties in the claims
}

/**
 * Hook to get and monitor the authentication state
 */
export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userClaims, setUserClaims] = useState<UserClaims | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthChange(async authUser => {
      setLoading(true);
      try {
        if (authUser) {
          setUser(authUser);
          
          // Get user profile data
          const profile = await getUserProfile(authUser.uid);
          setUserProfile(profile);
          
          // Get user claims for role-based access
          const claims = await getUserClaims(authUser);
          setUserClaims(claims);
        } else {
          setUser(null);
          setUserProfile(null);
          setUserClaims(null);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown authentication error'));
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Helper to check user role
  const hasRole = useCallback((role: string): boolean => {
    if (!userClaims) return false;
    return userClaims.role === role;
  }, [userClaims]);

  // Helper to check if user has permission
  const hasPermission = useCallback((permission: string): boolean => {
    if (!userClaims || !userClaims.permissions) return false;
    return Array.isArray(userClaims.permissions) && userClaims.permissions.includes(permission);
  }, [userClaims]);

  // Helper to check if user is an admin
  const isAdmin = useCallback((): boolean => {
    return hasRole('admin') || hasRole('superadmin');
  }, [hasRole]);

  // Helper to check if user is a manager
  const isManager = useCallback((): boolean => {
    return hasRole('manager');
  }, [hasRole]);

  // Helper to check if user is a regular worker
  const isWorker = useCallback((): boolean => {
    return hasRole('user');
  }, [hasRole]);

  // Helper to check company association
  const hasCompanyAccess = useCallback((companyId: string): boolean => {
    if (!userClaims) return false;
    return userClaims.companyId === companyId;
  }, [userClaims]);

  return { 
    user, 
    userProfile, 
    claims: userClaims,
    loading, 
    error,
    // Access control helpers
    hasRole,
    hasPermission,
    isAdmin,
    isManager,
    isWorker,
    hasCompanyAccess
  };
};

/**
 * Hook to check if a user is authenticated
 */
export const useIsAuthenticated = () => {
  const { user, loading } = useAuth();
  return { isAuthenticated: !!user, loading };
};

/**
 * Hook to check if current user has a specific role
 */
export const useHasRole = (role: string) => {
  const { hasRole, loading } = useAuth();
  return { hasRole: hasRole(role), loading };
};

/**
 * Hook to check if current user has a specific permission
 */
export const useHasPermission = (permission: string) => {
  const { hasPermission, loading } = useAuth();
  return { hasPermission: hasPermission(permission), loading };
};
