import { ChevronRight, Home } from 'lucide-react';
import { Link, useLocation } from 'wouter';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs() {
  const [location] = useLocation();
  
  const getBreadcrumbs = (): BreadcrumbItem[] => {
    // Home
    if (location === '/') return [];
    
    const segments = location.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/' }];
    
    // Build breadcrumbs from path segments
    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      
      // Map paths to friendly names
      const label = segment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      // Don't make the last segment a link (current page)
      const isLast = index === segments.length - 1;
      breadcrumbs.push({
        label,
        href: isLast ? undefined : currentPath,
      });
    });
    
    return breadcrumbs;
  };
  
  const breadcrumbs = getBreadcrumbs();
  
  // Don't show breadcrumbs on homepage
  if (breadcrumbs.length === 0) return null;
  
  return (
    <nav className="flex items-center space-x-1 text-sm text-muted-foreground mb-4" data-testid="breadcrumbs">
      <Link href="/">
        <button className="flex items-center hover:text-foreground transition-colors" data-testid="breadcrumb-home">
          <Home className="h-4 w-4" />
        </button>
      </Link>
      
      {breadcrumbs.map((crumb, index) => (
        <div key={index} className="flex items-center space-x-1">
          <ChevronRight className="h-4 w-4" />
          {crumb.href ? (
            <Link href={crumb.href}>
              <button 
                className="hover:text-foreground transition-colors" 
                data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {crumb.label}
              </button>
            </Link>
          ) : (
            <span className="text-foreground font-medium" data-testid={`breadcrumb-current-${crumb.label.toLowerCase().replace(/\s+/g, '-')}`}>
              {crumb.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
