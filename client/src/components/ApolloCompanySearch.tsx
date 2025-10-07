import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Building2, Users, Globe, MapPin, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Company {
  id: string;
  name: string;
  title: string;
  organization: {
    id: string;
    name: string;
    website_url: string;
    industry: string;
    num_employees: number;
    headquarters_location?: {
      city: string;
      state: string;
      country: string;
    };
  };
}

interface ApolloCompanySearchProps {
  open: boolean;
  onClose: () => void;
  onSelectCompany?: (company: Company) => void;
}

export function ApolloCompanySearch({ open, onClose, onSelectCompany }: ApolloCompanySearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  const { data, isLoading, refetch } = useQuery<{ companies: Company[] }>({
    queryKey: ['/api/apollo/company-search', activeQuery],
    enabled: !!activeQuery,
  });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setActiveQuery(searchQuery.trim());
      refetch();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const formatEmployeeCount = (count: number) => {
    if (count >= 10000) return '10,000+';
    if (count >= 1000) return `${Math.floor(count / 1000)}k+`;
    return count.toString();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="dialog-company-search">
        <DialogHeader>
          <DialogTitle>Apollo Company Search</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Search for companies using Apollo.io database
          </p>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Search companies (e.g., 'SaaS companies in San Francisco')"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            data-testid="input-company-search"
          />
          <Button 
            onClick={handleSearch} 
            disabled={isLoading || !searchQuery.trim()}
            data-testid="button-search"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && !activeQuery && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Search Apollo Database</h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-md">
                  Enter a search query to find companies. Use natural language like
                  "tech companies in New York" or "SaaS startups 50-200 employees"
                </p>
              </CardContent>
            </Card>
          )}

          {!isLoading && data && data.companies.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No Results Found</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Try a different search query or broaden your criteria
                </p>
              </CardContent>
            </Card>
          )}

          {!isLoading && data && data.companies.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Found {data.companies.length} companies
              </p>
              {data.companies.map((company) => (
                <Card 
                  key={company.organization.id} 
                  className="hover:border-blue-500 transition-colors cursor-pointer"
                  onClick={() => onSelectCompany?.(company)}
                  data-testid={`card-company-${company.organization.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Building2 className="w-4 h-4" />
                          {company.organization.name}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {company.organization.industry}
                        </CardDescription>
                      </div>
                      {company.organization.website_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(
                              company.organization.website_url.startsWith('http')
                                ? company.organization.website_url
                                : `https://${company.organization.website_url}`,
                              '_blank'
                            );
                          }}
                          data-testid={`button-website-${company.organization.id}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {formatEmployeeCount(company.organization.num_employees)} employees
                      </Badge>
                      
                      {company.organization.website_url && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {company.organization.website_url.replace(/^https?:\/\//, '').split('/')[0]}
                        </Badge>
                      )}
                      
                      {company.organization.headquarters_location && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {[
                            company.organization.headquarters_location.city,
                            company.organization.headquarters_location.state,
                            company.organization.headquarters_location.country
                          ].filter(Boolean).join(', ')}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose} data-testid="button-close">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
