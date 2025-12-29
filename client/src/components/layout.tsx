import { useLocation, Link } from 'wouter';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect } from 'react';
import {
  BrainIcon,
  UsersIcon,
  SparklesIcon,
  BarChart3Icon,
  SettingsIcon,
  ListTodo,
  Mail,
  Inbox,
  FileText,
  Zap,
  Shield,
  Code,
  Building2,
  FolderTree,
  LogOut,
  User as UserIcon,
  Trophy,
  BookOpen,
  ArrowRightLeft,
  ChevronRight,
  ChevronLeft,
  Users2,
  Home
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: string | number;
  requireAdmin?: boolean;
}

const routeLabels: Record<string, string> = {
  '/': 'AI Search',
  '/prospects': 'Prospects',
  '/import': 'Import',
  '/sequences': 'Sequences',
  '/automation-dashboard': 'Automation',
  '/mailboxes': 'Mailboxes',
  '/content-management': 'Content',
  '/enrichment': 'Enrichment',
  '/analytics': 'Analytics',
  '/leaderboard': 'Leaderboard',
  '/best-practices': 'Best Practices',
  '/ae-handoff': 'AE Handoff',
  '/ai-prospecting': 'AI Prospecting',
  '/api-docs': 'API Docs',
  '/admin/users': 'User Management',
  '/organization-settings': 'Organization',
  '/workspace-management': 'Workspaces',
  '/admin-infrastructure': 'Infrastructure',
  '/settings': 'Settings',
  '/profile': 'Profile',
  '/manager/dashboard': 'Manager Dashboard',
};

function getPageTitle(path: string): string {
  if (routeLabels[path]) return routeLabels[path];
  
  for (const [route, label] of Object.entries(routeLabels)) {
    if (path.startsWith(route) && route !== '/') {
      return label;
    }
  }
  return 'Dashboard';
}

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, [location]);

  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation('/');
    }
  };

  const pageTitle = getPageTitle(location);

  const mainNavItems: NavItem[] = [
    { href: '/', icon: <SparklesIcon className="w-4 h-4" />, label: 'AI Search' },
    { href: '/prospects', icon: <UsersIcon className="w-4 h-4" />, label: 'Prospects' },
    { href: '/sequences', icon: <ListTodo className="w-4 h-4" />, label: 'Sequences' },
    { href: '/mailboxes', icon: <Inbox className="w-4 h-4" />, label: 'Mailboxes' },
    { href: '/content-management', icon: <FileText className="w-4 h-4" />, label: 'Content' },
    { href: '/automation-dashboard', icon: <Zap className="w-4 h-4" />, label: 'Automation' },
    { href: '/analytics', icon: <BarChart3Icon className="w-4 h-4" />, label: 'Analytics' },
  ];

  const engagementNavItems: NavItem[] = [
    { href: '/leaderboard', icon: <Trophy className="w-4 h-4" />, label: 'Leaderboard' },
    { href: '/best-practices', icon: <BookOpen className="w-4 h-4" />, label: 'Best Practices' },
    { href: '/ae-handoff', icon: <ArrowRightLeft className="w-4 h-4" />, label: 'AE Handoff' },
  ];

  const adminNavItems: NavItem[] = [
    { href: '/manager/dashboard', icon: <Users2 className="w-4 h-4" />, label: 'Manager Dashboard', requireAdmin: true },
    { href: '/admin/users', icon: <Shield className="w-4 h-4" />, label: 'User Admin', requireAdmin: true },
    { href: '/organization-settings', icon: <Building2 className="w-4 h-4" />, label: 'Organization', requireAdmin: true },
    { href: '/workspace-management', icon: <FolderTree className="w-4 h-4" />, label: 'Workspaces', requireAdmin: true },
    { href: '/admin-infrastructure', icon: <SettingsIcon className="w-4 h-4" />, label: 'Infrastructure', requireAdmin: true },
    { href: '/api-docs', icon: <Code className="w-4 h-4" />, label: 'API Docs' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return location === '/';
    return location.startsWith(href);
  };

  const renderNavItem = (item: NavItem) => {
    if (item.requireAdmin && user?.role !== 'admin') return null;

    const active = isActive(item.href);
    return (
      <Link key={item.href} href={item.href}>
        <Button
          variant="ghost"
          className={`w-full justify-start gap-3 ${
            active
              ? 'bg-primary/10 text-primary hover:bg-primary/20'
              : 'text-muted-foreground hover:bg-muted'
          }`}
          data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {item.icon}
          <span>{item.label}</span>
          {item.badge && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {item.badge}
            </Badge>
          )}
        </Button>
      </Link>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-60 bg-card border-r border-border flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <BrainIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold" data-testid="app-title">AISDR</h1>
              <p className="text-xs text-muted-foreground">AI Sales Platform</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="space-y-1">
            {mainNavItems.map(renderNavItem)}
          </div>

          <div className="pt-4">
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Engagement
            </p>
            {engagementNavItems.map(renderNavItem)}
          </div>

          {user?.role === 'admin' && (
            <div className="pt-4">
              <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Admin
              </p>
              {adminNavItems.map(renderNavItem)}
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" data-testid="user-name">
                {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.role === 'admin' ? 'Administrator' : 'User'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/profile" className="flex-1">
              <Button variant="outline" size="sm" className="w-full" data-testid="btn-profile">
                <UserIcon className="w-3 h-3 mr-1" />
                Profile
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="text-destructive hover:text-destructive"
              data-testid="btn-logout"
            >
              <LogOut className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto flex flex-col">
        <header className="sticky top-0 z-10 bg-background border-b border-border px-6 py-3 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoBack}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            data-testid="btn-go-back"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          
          <div className="flex items-center gap-2 text-sm">
            <Link href="/">
              <Button variant="ghost" size="sm" className="p-1 h-auto" data-testid="btn-home">
                <Home className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <span className="font-medium text-foreground" data-testid="text-page-title">{pageTitle}</span>
          </div>
        </header>
        
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default Layout;
