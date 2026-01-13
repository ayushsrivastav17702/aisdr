import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireManagerOrAdmin?: boolean; // Allows both managers and admins
  blockManager?: boolean; // If true, managers will be redirected to manager dashboard
}

export function ProtectedRoute({ children, requireAdmin = false, requireManagerOrAdmin = false, blockManager = false }: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  // Helper to check if user has manager/admin access
  const hasManagerAccess = user?.isManager || user?.role === 'admin' || user?.role === 'manager';
  
  // For requireAdmin, only allow users with manager role who are NOT flagged as pure managers
  // This allows org-admins (role='manager' but isManager=false) but blocks pure managers (isManager=true)
  useEffect(() => {
    if (!isLoading && isAuthenticated && requireAdmin) {
      const isAdminUser = (user?.role === 'admin' || user?.role === 'manager') && !user?.isManager;
      if (!isAdminUser) {
        setLocation('/');
      }
    }
  }, [isLoading, isAuthenticated, requireAdmin, user, setLocation]);

  // Block regular users from manager/admin routes
  useEffect(() => {
    if (!isLoading && isAuthenticated && requireManagerOrAdmin) {
      if (!hasManagerAccess) {
        setLocation('/');
      }
    }
  }, [isLoading, isAuthenticated, requireManagerOrAdmin, hasManagerAccess, setLocation]);

  // Block managers from accessing SDR-only routes (only use isManager flag, not role)
  // This allows admins with role='manager' but isManager=false to access SDR routes
  useEffect(() => {
    if (!isLoading && isAuthenticated && blockManager && user?.isManager) {
      setLocation('/manager/dashboard');
    }
  }, [isLoading, isAuthenticated, blockManager, user?.isManager, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // For requireAdmin, only allow org-admins (role='manager' but isManager=false)
  if (requireAdmin) {
    const isAdminUser = (user?.role === 'admin' || user?.role === 'manager') && !user?.isManager;
    if (!isAdminUser) {
      return null;
    }
  }

  // Block regular users from manager/admin routes
  if (requireManagerOrAdmin) {
    if (!hasManagerAccess) {
      return null;
    }
  }

  // Block managers from SDR routes (only use isManager flag)
  if (blockManager && user?.isManager) {
    return null;
  }

  return <>{children}</>;
}
