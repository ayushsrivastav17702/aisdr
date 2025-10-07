import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { api, type ProspectsResponse } from "@/lib/api";
import { 
  EyeIcon,
  SparklesIcon,
  MoreVerticalIcon,
  DownloadIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TableCellsSplit,
  ListIcon
} from "lucide-react";

interface ProspectsTableProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export default function ProspectsTable({ selectedIds, onSelectionChange }: ProspectsTableProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on search
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/prospects", { search: debouncedSearch, status, page }],
    queryFn: () => api.getProspects({ 
      search: debouncedSearch, 
      status: status === "all" ? undefined : status, 
      page, 
      limit: 50 
    }),
  });

  const enrichMutation = useMutation({
    mutationFn: api.enrichProspects,
    onSuccess: () => {
      toast({
        title: "Enrichment Started",
        description: `Started enriching ${selectedIds.length} prospects`,
      });
      onSelectionChange([]);
      queryClient.invalidateQueries({ queryKey: ["/api/prospects"] });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Enrichment Failed",
        description: error.message,
      });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked && data) {
      const allIds = data.prospects.map((p: any) => p.id);
      onSelectionChange(allIds);
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectProspect = (prospectId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, prospectId]);
    } else {
      onSelectionChange(selectedIds.filter(id => id !== prospectId));
    }
  };

  const handleEnrichSelected = () => {
    if (selectedIds.length === 0) {
      toast({
        variant: "destructive",
        title: "No Selection",
        description: "Please select prospects to enrich",
      });
      return;
    }
    
    enrichMutation.mutate(selectedIds);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "enriched":
        return (
          <Badge className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Enriched
          </Badge>
        );
      case "partial":
        return (
          <Badge className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            Partial
          </Badge>
        );
      case "failed":
        return (
          <Badge className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            Failed
          </Badge>
        );
      default:
        return (
          <Badge className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 border-slate-200">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
            New
          </Badge>
        );
    }
  };

  const getInitials = (firstName: string = "", lastName: string = "") => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  if (error) {
    return (
      <Card className="m-8">
        <CardContent className="p-6 text-center">
          <p className="text-destructive">Failed to load prospects</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/prospects"] })}
          >
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Results Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold" data-testid="results-title">Search Results</h3>
            <p className="text-sm text-muted-foreground mt-1">
              <span data-testid="total-results">{data?.total || 0}</span> prospects found
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-48" data-testid="filter-status">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="enriched">Enriched</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Search prospects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
              data-testid="input-search-prospects"
            />
            
            <div className="flex rounded-md border border-border overflow-hidden">
              <Button variant="ghost" size="sm" className="bg-primary/10 text-primary">
                <TableCellsSplit className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <ListIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.length > 0 && (
          <Card className="p-4 bg-primary/10 border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-primary" data-testid="selected-count">
                  {selectedIds.length} prospects selected
                </span>
                <div className="h-4 w-px bg-primary/30"></div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-sm text-primary hover:text-primary/80"
                  onClick={() => handleSelectAll(true)}
                  data-testid="button-select-all"
                >
                  Select all {data?.total}
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" data-testid="button-export">
                  <DownloadIcon className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <Button 
                  size="sm"
                  onClick={handleEnrichSelected}
                  disabled={enrichMutation.isPending}
                  data-testid="button-enrich-selected"
                >
                  <SparklesIcon className="w-4 h-4 mr-2" />
                  {enrichMutation.isPending ? "Enriching..." : "Enrich Selected"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Prospects Table */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">Loading prospects...</p>
            </CardContent>
          ) : !data?.prospects.length ? (
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No prospects found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search or filters
              </p>
            </CardContent>
          ) : (
            <>
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="w-12 px-4 py-3 text-left">
                      <Checkbox
                        checked={selectedIds.length === data.prospects.length && data.prospects.length > 0}
                        onCheckedChange={handleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                
                <tbody className="divide-y divide-border">
                  {data.prospects.map((prospect: any) => (
                    <tr key={prospect.id} className="hover:bg-muted/50 transition-colors" data-testid={`prospect-row-${prospect.id}`}>
                      <td className="px-4 py-4">
                        <Checkbox
                          checked={selectedIds.includes(prospect.id)}
                          onCheckedChange={(checked) => handleSelectProspect(prospect.id, checked as boolean)}
                          data-testid={`checkbox-prospect-${prospect.id}`}
                        />
                      </td>
                      
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-medium text-sm">
                            {getInitials(prospect.firstName, prospect.lastName)}
                          </div>
                          <div>
                            <p className="text-sm font-medium" data-testid={`prospect-name-${prospect.id}`}>
                              {prospect.fullName || `${prospect.firstName || ""} ${prospect.lastName || ""}`.trim() || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground" data-testid={`prospect-email-${prospect.id}`}>
                              {prospect.primaryEmail || "No email"}
                            </p>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-4">
                        <p className="text-sm" data-testid={`prospect-title-${prospect.id}`}>
                          {prospect.jobTitle || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {prospect.department || ""}
                        </p>
                      </td>
                      
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                            <span className="text-xs">🏢</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium" data-testid={`prospect-company-${prospect.id}`}>
                              {prospect.companyName || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {prospect.companySize || ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-4">
                        <p className="text-sm" data-testid={`prospect-location-${prospect.id}`}>
                          {prospect.contactLocation || prospect.companyLocation || "Unknown"}
                        </p>
                      </td>
                      
                      <td className="px-4 py-4" data-testid={`prospect-status-${prospect.id}`}>
                        {getStatusBadge(prospect.enrichmentStatus)}
                      </td>
                      
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" data-testid={`button-view-${prospect.id}`}>
                            <EyeIcon className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => enrichMutation.mutate([prospect.id])}
                            disabled={enrichMutation.isPending}
                            data-testid={`button-enrich-${prospect.id}`}
                          >
                            <SparklesIcon className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" data-testid={`button-more-${prospect.id}`}>
                            <MoreVerticalIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing <span className="font-medium">{((page - 1) * 50) + 1}</span> to{" "}
                    <span className="font-medium">{Math.min(page * 50, data.total)}</span> of{" "}
                    <span className="font-medium" data-testid="pagination-total">{data.total}</span> results
                  </p>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      data-testid="button-previous-page"
                    >
                      <ChevronLeftIcon className="w-4 h-4 mr-2" />
                      Previous
                    </Button>
                    
                    <div className="flex items-center gap-1">
                      {/* Simple pagination numbers */}
                      {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                        const pageNum = i + 1;
                        return (
                          <Button
                            key={pageNum}
                            variant={page === pageNum ? "default" : "ghost"}
                            size="sm"
                            className="w-9 h-9"
                            onClick={() => setPage(pageNum)}
                            data-testid={`button-page-${pageNum}`}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                      
                      {data.totalPages > 5 && (
                        <>
                          <span className="px-2 text-muted-foreground">...</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-9 h-9"
                            onClick={() => setPage(data.totalPages)}
                            data-testid={`button-page-${data.totalPages}`}
                          >
                            {data.totalPages}
                          </Button>
                        </>
                      )}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                      disabled={page >= data.totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRightIcon className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
