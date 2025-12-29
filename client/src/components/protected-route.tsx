import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  blockManager?: boolean; // If true, managers will be redirected to manager dashboard
}

export function ProtectedRoute({ children, requireAdmin = false, blockManager = false }: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && requireAdmin && user?.role !== 'admin') {
      setLocation('/');
    }
  }, [isLoading, isAuthenticated, requireAdmin, user, setLocation]);

  // Block managers from accessing SDR-only routes
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

  if (requireAdmin && user?.role !== 'admin') {
    return null;
  }

  // Block managers from SDR routes
  if (blockManager && user?.isManager) {
    return null;
  }

  return <>{children}</>;
}
