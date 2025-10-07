import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { SparklesIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";

interface ActiveFilter {
  type: string;
  value: string;
  icon: string;
}

export default function AISearch() {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const aiSearchMutation = useMutation({
    mutationFn: api.aiSearch,
    onSuccess: (data) => {
      // Update active filters based on AI parsing results
      const filters: ActiveFilter[] = [];
      
      if (data.aiFilters.jobTitles?.length) {
        filters.push({
          type: "jobTitles",
          value: data.aiFilters.jobTitles.join(", "),
          icon: "💼"
        });
      }
      
      if (data.aiFilters.industries?.length) {
        filters.push({
          type: "industries", 
          value: data.aiFilters.industries.join(", "),
          icon: "🏢"
        });
      }
      
      if (data.aiFilters.locations?.length) {
        filters.push({
          type: "locations",
          value: data.aiFilters.locations.join(", "),
          icon: "📍"
        });
      }

      if (data.aiFilters.companySize) {
        const { min, max } = data.aiFilters.companySize;
        filters.push({
          type: "companySize",
          value: `${min || 0}+ employees`,
          icon: "👥"
        });
      }

      setActiveFilters(filters);
      
      // If job queue is not available (warning present), execute Apollo search immediately
      if (data.warning && data.apolloFilters) {
        apolloSearchMutation.mutate(data.apolloFilters);
      } else if (data.job) {
        // Job queue is available - prospects will appear when job completes
        toast({
          title: "AI Search Executed",
          description: `Processing search job with ${filters.length} filters applied.`,
        });
      }
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: error.message || "Failed to execute AI search",
      });
    },
  });

  const apolloSearchMutation = useMutation({
    mutationFn: (apolloFilters: any) => api.apolloSearchAndSave(apolloFilters, 1, 20),
    onSuccess: (data) => {
      // Invalidate prospects query to show newly saved prospects
      queryClient.invalidateQueries({ queryKey: ["/api/prospects"] });
      
      toast({
        title: "Prospects Found",
        description: `Found and saved ${data.saved} prospects from Apollo search.`,
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Apollo Search Failed",
        description: error.message || "Failed to fetch prospects from Apollo",
      });
    },
  });

  const handleSearch = () => {
    if (!query.trim()) {
      toast({
        variant: "destructive",
        title: "Invalid Query",
        description: "Please enter a search query",
      });
      return;
    }
    
    aiSearchMutation.mutate(query);
  };

  const removeFilter = (index: number) => {
    setActiveFilters(filters => filters.filter((_, i) => i !== index));
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
    setQuery("");
  };

  return (
    <div className="p-8 border-b border-border bg-gradient-to-br from-primary/5 to-accent/5">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* AI Search Input */}
        <div className="relative">
          <SparklesIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-accent w-5 h-5" />
          <Input
            type="text"
            placeholder="Describe who you're looking for... (e.g., 'Find CTOs in fintech companies in NYC with 100+ employees')"
            className="w-full pl-12 pr-32 py-4 text-base rounded-lg border-2 border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            data-testid="input-ai-search"
          />
          <Button
            className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2"
            onClick={handleSearch}
            disabled={aiSearchMutation.isPending || apolloSearchMutation.isPending}
            data-testid="button-search"
          >
            {aiSearchMutation.isPending || apolloSearchMutation.isPending ? (
              <SparklesIcon className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <SearchIcon className="w-4 h-4 mr-2" />
            )}
            {aiSearchMutation.isPending ? "Parsing..." : apolloSearchMutation.isPending ? "Fetching..." : "Search"}
          </Button>
        </div>

        {/* Active Filters Display */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-primary/10 text-primary"
                data-testid={`filter-${filter.type}`}
              >
                <span>{filter.icon}</span>
                {filter.value}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1 h-auto p-0 text-primary hover:text-destructive"
                  onClick={() => removeFilter(index)}
                  data-testid={`remove-filter-${index}`}
                >
                  <XIcon className="w-3 h-3" />
                </Button>
              </Badge>
            ))}
            
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground ml-2"
              onClick={clearAllFilters}
              data-testid="button-clear-filters"
            >
              Clear all
            </Button>
          </div>
        )}

        {/* Quick Filters Toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
          data-testid="button-advanced-filters"
        >
          <SlidersHorizontalIcon className="w-4 h-4" />
          Advanced Filters
          {/* <ChevronDownIcon className="w-3 h-3" /> */}
        </Button>
      </div>
    </div>
  );
}
