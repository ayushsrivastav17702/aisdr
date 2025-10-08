import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { SparklesIcon, SearchIcon, SlidersHorizontalIcon, XIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

interface ActiveFilter {
  type: string;
  value: string;
  icon: string;
}

interface AdvancedFilters {
  industries?: string[];
  locations?: string[];
  jobTitles?: string[];
  seniorityLevels?: string[];
  companySize?: { min?: number; max?: number };
}

export default function AISearch() {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

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
      
      // If job queue is not available (no job created), execute Apollo search immediately
      if (!data.job && data.apolloFilters) {
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
    mutationFn: (apolloFilters: any) => api.apolloSearchAndSave(apolloFilters, 1, 50),
    onSuccess: (data) => {
      // Invalidate prospects query to show newly saved prospects
      queryClient.invalidateQueries({ queryKey: ["/api/prospects"] });
      
      const totalFound = data.pagination?.total_entries || data.saved;
      
      toast({
        title: "Prospects Saved Successfully",
        description: `Saved ${data.saved} prospects (${totalFound.toLocaleString()} total available). Navigating to Prospects page...`,
      });

      // Navigate to Prospects page after a short delay to show the toast
      setTimeout(() => {
        setLocation("/");
      }, 1500);
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

  // Helper function to map industries to Apollo IDs
  const mapIndustryToApolloId = (industry: string): string => {
    const mapping: { [key: string]: string } = {
      'fintech': '5567cdcc7369646289050000',
      'saas': '5567cdcc7369646289040000',
      'healthcare': '5567cdcc7369646289030000',
      'technology': '5567cdcc7369646289020000',
      'financial services': '5567cdcc7369646289010000'
    };
    return mapping[industry.toLowerCase()] || industry;
  };

  // Helper function to map seniority to Apollo format
  const mapSeniorityToApollo = (seniority: string): string => {
    const mapping: { [key: string]: string } = {
      'executive': 'c_level',
      'director': 'director',
      'manager': 'manager',
      'senior': 'senior',
      'entry': 'entry'
    };
    return mapping[seniority.toLowerCase()] || seniority;
  };

  const handleAdvancedSearch = () => {
    // Validate at least one filter is set
    if (!advancedFilters.industries?.length && 
        !advancedFilters.locations?.length && 
        !advancedFilters.jobTitles?.length && 
        !advancedFilters.seniorityLevels?.length && 
        !advancedFilters.companySize) {
      toast({
        variant: "destructive",
        title: "No Filters Selected",
        description: "Please select at least one filter to search",
      });
      return;
    }

    // Build filters object from advanced filters with proper Apollo formatting
    const filters: any = {};
    
    if (advancedFilters.industries?.length) {
      filters.organization_industry_tag_ids = advancedFilters.industries.map(mapIndustryToApolloId);
    }
    if (advancedFilters.locations?.length) {
      filters.person_locations = advancedFilters.locations;
    }
    if (advancedFilters.jobTitles?.length) {
      filters.person_titles = advancedFilters.jobTitles;
    }
    if (advancedFilters.seniorityLevels?.length) {
      filters.person_seniorities = advancedFilters.seniorityLevels.map(mapSeniorityToApollo);
    }
    if (advancedFilters.companySize) {
      const { min = 1, max = 999999 } = advancedFilters.companySize;
      filters.organization_num_employees_ranges = [`${min},${max}`];
    }

    // Execute Apollo search directly with filters
    apolloSearchMutation.mutate(filters);
  };

  const removeFilter = (index: number) => {
    setActiveFilters(filters => filters.filter((_, i) => i !== index));
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
    setQuery("");
    setAdvancedFilters({});
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

        {/* Advanced Filters Toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          data-testid="button-advanced-filters"
        >
          <SlidersHorizontalIcon className="w-4 h-4" />
          Advanced Filters
          {showAdvancedFilters ? (
            <ChevronUpIcon className="w-3 h-3" />
          ) : (
            <ChevronDownIcon className="w-3 h-3" />
          )}
        </Button>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Industries */}
              <div className="space-y-2">
                <Label htmlFor="industries">Industries</Label>
                <Select
                  value={advancedFilters.industries?.[0] || ""}
                  onValueChange={(value) => setAdvancedFilters({
                    ...advancedFilters,
                    industries: value ? [value] : undefined
                  })}
                >
                  <SelectTrigger id="industries" data-testid="select-industries">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technology">Technology</SelectItem>
                    <SelectItem value="saas">SaaS</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="fintech">Fintech</SelectItem>
                    <SelectItem value="financial services">Financial Services</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Locations */}
              <div className="space-y-2">
                <Label htmlFor="locations">Locations</Label>
                <Input
                  id="locations"
                  placeholder="e.g., New York, San Francisco, Remote"
                  value={advancedFilters.locations?.join(", ") || ""}
                  onChange={(e) => setAdvancedFilters({
                    ...advancedFilters,
                    locations: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                  })}
                  data-testid="input-locations"
                />
              </div>

              {/* Job Titles */}
              <div className="space-y-2">
                <Label htmlFor="job-titles">Job Titles (Multiple)</Label>
                <Input
                  id="job-titles"
                  placeholder="Merchandiser, Visual Merchandiser, Product Merchandiser"
                  value={advancedFilters.jobTitles?.join(", ") || ""}
                  onChange={(e) => setAdvancedFilters({
                    ...advancedFilters,
                    jobTitles: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                  })}
                  data-testid="input-job-titles"
                />
                <p className="text-xs text-muted-foreground">
                  Separate multiple titles with commas
                </p>
              </div>

              {/* Seniority Levels */}
              <div className="space-y-2">
                <Label htmlFor="seniority">Seniority Levels</Label>
                <Select
                  value={advancedFilters.seniorityLevels?.[0] || ""}
                  onValueChange={(value) => setAdvancedFilters({
                    ...advancedFilters,
                    seniorityLevels: value ? [value] : undefined
                  })}
                >
                  <SelectTrigger id="seniority" data-testid="select-seniority">
                    <SelectValue placeholder="Select seniority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="executive">Executive</SelectItem>
                    <SelectItem value="director">Director</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="senior">Senior</SelectItem>
                    <SelectItem value="entry">Entry Level</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Company Size */}
              <div className="space-y-2">
                <Label htmlFor="company-size">Company Size</Label>
                <Select
                  value={advancedFilters.companySize ? `${advancedFilters.companySize.min}-${advancedFilters.companySize.max}` : ""}
                  onValueChange={(value) => {
                    const [min, max] = value.split("-").map(Number);
                    setAdvancedFilters({
                      ...advancedFilters,
                      companySize: { min, max }
                    });
                  }}
                >
                  <SelectTrigger id="company-size" data-testid="select-company-size">
                    <SelectValue placeholder="Select company size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1-10 employees</SelectItem>
                    <SelectItem value="11-50">11-50 employees</SelectItem>
                    <SelectItem value="51-200">51-200 employees</SelectItem>
                    <SelectItem value="201-500">201-500 employees</SelectItem>
                    <SelectItem value="501-1000">501-1000 employees</SelectItem>
                    <SelectItem value="1001-5000">1001-5000 employees</SelectItem>
                    <SelectItem value="5001-10000">5001-10000 employees</SelectItem>
                    <SelectItem value="10001-999999">10001+ employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Apply Filters Button */}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setAdvancedFilters({});
                  setShowAdvancedFilters(false);
                }}
                data-testid="button-cancel-filters"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAdvancedSearch}
                disabled={apolloSearchMutation.isPending}
                data-testid="button-apply-filters"
              >
                {apolloSearchMutation.isPending ? (
                  <>
                    <SparklesIcon className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <SearchIcon className="w-4 h-4 mr-2" />
                    Apply Filters
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
