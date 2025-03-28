import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';

interface ProtectedRouteProps {
  // Child components to render if authenticated
  children: ReactNode;
  // Require specific role (optional)
  requiredRole?: string;
  // Require specific permission (optional)
  requiredPermission?: string;
  // Fallback route to redirect to if not authenticated
  fallbackPath?: string;
}

/**
 * Protected route component that checks authentication status
 * and optionally roles/permissions before rendering children
 */
export const ProtectedRoute = ({
  children,
  requiredRole,
  requiredPermission,
  fallbackPath = '/login',
}: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, hasRole, hasPermission } = useAuth();
  const location = useLocation();

  // Show nothing while loading to avoid flashes
  if (isLoading) {
    return <div>Loading...</div>;
  }

  // Check if user is authenticated
  if (!isAuthenticated) {
    // Redirect to login page with return URL
    return <Navigate to={fallbackPath} state={{ from: location.pathname }} replace />;
  }

  // Check for required role
  if (requiredRole && !hasRole(requiredRole)) {
    // Redirect to unauthorized page
    return <Navigate to="/unauthorized" replace />;
  }

  // Check for required permission
  if (requiredPermission && !hasPermission(requiredPermission)) {
    // Redirect to unauthorized page
    return <Navigate to="/unauthorized" replace />;
  }

  // All checks passed, render children
  return <>{children}</>;
};

// Export specialized route components for common roles
export const AdminRoute = ({ children, fallbackPath }: Omit<ProtectedRouteProps, 'requiredRole'>) => (
  <ProtectedRoute requiredRole="admin" fallbackPath={fallbackPath}>
    {children}
  </ProtectedRoute>
);

export const ManagerRoute = ({ children, fallbackPath }: Omit<ProtectedRouteProps, 'requiredRole'>) => (
  <ProtectedRoute requiredRole="manager" fallbackPath={fallbackPath}>
    {children}
  </ProtectedRoute>
);

export const WorkerRoute = ({ children, fallbackPath }: Omit<ProtectedRouteProps, 'requiredRole'>) => (
  <ProtectedRoute requiredRole="user" fallbackPath={fallbackPath}>
    {children}
  </ProtectedRoute>
);

export default ProtectedRoute; 