import { useEffect } from 'react';
import { useLocation, Redirect } from 'wouter';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireRole?: 'super_admin' | 'manager' | 'user'; // Explicit role requirement
  allowedRoles?: Array<'super_admin' | 'manager' | 'user'>; // Multiple allowed roles
}

/**
 * ROLE IS SOURCE OF TRUTH
 * - Routing decisions are based ONLY on user.role
 * - No inference from tenant, managerId, or permissions
 * - Each role is strictly isolated from others
 */
export function ProtectedRoute({ children, requireRole, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  // Redirect based on role mismatch
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      // Check if specific role is required
      if (requireRole && user.role !== requireRole) {
        console.log(`[PROTECTED_ROUTE] Role mismatch: required=${requireRole}, actual=${user.role}`);
        redirectToRoleDashboard(user.role, setLocation);
        return;
      }

      // Check if user role is in allowed roles list
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        console.log(`[PROTECTED_ROUTE] Role not in allowedRoles: allowed=${allowedRoles.join(',')}, actual=${user.role}`);
        redirectToRoleDashboard(user.role, setLocation);
        return;
      }
    }
  }, [isLoading, isAuthenticated, user, requireRole, allowedRoles, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  // Check role requirements
  if (requireRole && user?.role !== requireRole) {
    return null;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Redirect user to their role-appropriate dashboard
 */
function redirectToRoleDashboard(role: string, setLocation: (path: string) => void) {
  switch (role) {
    case 'super_admin':
      setLocation('/super-admin');
      break;
    case 'manager':
      setLocation('/manager/dashboard');
      break;
    case 'user':
    default:
      setLocation('/');
      break;
  }
}
