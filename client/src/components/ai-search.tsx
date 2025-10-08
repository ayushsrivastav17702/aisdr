import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { SparklesIcon, SearchIcon, SlidersHorizontalIcon, XIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

interface ActiveFilter {
  type: string;
  value: string;
  icon: string;
}

interface AdvancedFilters {
  extractionName?: string;
  tag?: string;
  jobTitles?: string[];
  industries?: string[];
  countries?: string[];
  companySizes?: string[];
  prospectCount?: number;
  specificCompanies?: string;
  technologies?: string;
  departments?: string;
  seniorityLevels?: string[];
}

// Only industries with valid Apollo ID mappings to prevent 422 errors
const INDUSTRIES = [
  "Technology",
  "SaaS", 
  "Software",
  "Healthcare",
  "Fintech",
  "Financial Services",
  "Finance",
  "Banking"
];

const COUNTRIES = [
  "United States", "Canada", "United Kingdom", "Germany", "France", "Spain", "Italy",
  "Netherlands", "Sweden", "Norway", "Denmark", "Finland", "Australia", "New Zealand",
  "Singapore", "Hong Kong", "Japan", "South Korea", "India", "China", "Brazil", "Mexico",
  "Argentina", "Chile", "South Africa", "Israel", "United Arab Emirates", "Switzerland",
  "Austria", "Belgium", "Ireland", "Portugal", "Poland", "Czech Republic"
];

const COMPANY_SIZES = [
  { value: "1-10", label: "Startup (1-10 employees)" },
  { value: "11-50", label: "Small (11-50 employees)" },
  { value: "51-200", label: "Medium (51-200 employees)" },
  { value: "201-1000", label: "Large (201-1000 employees)" },
  { value: "1001-999999", label: "Enterprise (1000+ employees)" }
];

const SENIORITY_LEVELS = [
  { value: "entry", label: "Entry Level" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "vp", label: "VP" },
  { value: "c_level", label: "C-Suite" },
  { value: "owner", label: "Owner" }
];

export default function AISearch() {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    prospectCount: 50
  });
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
    mutationFn: (params: { apolloFilters: any; extractionName?: string; tag?: string; prospectCount?: number }) => 
      api.apolloSearchAndSave(
        params.apolloFilters, 
        1, 
        params.prospectCount || 50,
        params.extractionName,
        params.tag
      ),
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

  // Helper function to map industries to Apollo IDs (returns null if no mapping)
  const mapIndustryToApolloId = (industry: string): string | null => {
    const mapping: { [key: string]: string } = {
      'fintech': '5567cdcc7369646289050000',
      'saas': '5567cdcc7369646289040000',
      'healthcare': '5567cdcc7369646289030000',
      'technology': '5567cdcc7369646289020000',
      'software': '5567cdcc7369646289040000', // Same as SaaS
      'financial services': '5567cdcc7369646289010000',
      'finance': '5567cdcc7369646289010000',
      'banking': '5567cdcc7369646289010000',
      // Note: Industries without mappings will be filtered out
    };
    return mapping[industry.toLowerCase()] || null;
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
    // Validate required fields
    if (!advancedFilters.extractionName?.trim()) {
      toast({
        variant: "destructive",
        title: "Extraction Name Required",
        description: "Please provide an extraction name for this search",
      });
      return;
    }
    
    if (!advancedFilters.tag?.trim()) {
      toast({
        variant: "destructive",
        title: "Tag Required",
        description: "Please provide a tag for the prospects from this search",
      });
      return;
    }
    
    // Validate at least one filter is set
    if (!advancedFilters.industries?.length && 
        !advancedFilters.countries?.length && 
        !advancedFilters.jobTitles?.length && 
        !advancedFilters.seniorityLevels?.length && 
        !advancedFilters.companySizes?.length &&
        !advancedFilters.specificCompanies?.trim() &&
        !advancedFilters.technologies?.trim() &&
        !advancedFilters.departments?.trim()) {
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
      const mappedIndustries = advancedFilters.industries
        .map(mapIndustryToApolloId)
        .filter((id): id is string => id !== null);
      
      if (mappedIndustries.length > 0) {
        filters.organization_industry_tag_ids = mappedIndustries;
      }
    }
    if (advancedFilters.countries?.length) {
      filters.person_locations = advancedFilters.countries;
    }
    if (advancedFilters.jobTitles?.length) {
      filters.person_titles = advancedFilters.jobTitles;
    }
    if (advancedFilters.seniorityLevels?.length) {
      filters.person_seniorities = advancedFilters.seniorityLevels;
    }
    if (advancedFilters.companySizes?.length) {
      filters.organization_num_employees_ranges = advancedFilters.companySizes;
    }
    if (advancedFilters.specificCompanies) {
      // Parse comma-separated companies and use first one for q_organization_name
      const companies = advancedFilters.specificCompanies.split(',').map(c => c.trim()).filter(Boolean);
      if (companies.length > 0) {
        filters.q_organization_name = companies[0];
      }
    }
    if (advancedFilters.technologies) {
      filters.q_keywords = advancedFilters.technologies;
    }
    if (advancedFilters.departments) {
      const depts = advancedFilters.departments.split(',').map(d => d.trim()).filter(Boolean);
      filters.person_departments = depts;
    }

    // Execute Apollo search with filters, extraction name, tag, and prospect count
    apolloSearchMutation.mutate({
      apolloFilters: filters,
      extractionName: advancedFilters.extractionName,
      tag: advancedFilters.tag,
      prospectCount: advancedFilters.prospectCount || 50
    });
  };

  const removeFilter = (index: number) => {
    setActiveFilters(filters => filters.filter((_, i) => i !== index));
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
    setQuery("");
    setAdvancedFilters({ prospectCount: 50 });
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

        {/* Comprehensive Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="bg-card border border-border rounded-lg p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Find Your Ideal Prospects</h3>
              <p className="text-sm text-muted-foreground">
                Create detailed targeting criteria to find your exact ideal customer profile
              </p>

              {/* Extraction Name & Tag */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="extraction-name">Extraction Name *</Label>
                  <Input
                    id="extraction-name"
                    placeholder="e.g., Tech CEOs Q1 2025"
                    value={advancedFilters.extractionName || ""}
                    onChange={(e) => setAdvancedFilters({
                      ...advancedFilters,
                      extractionName: e.target.value
                    })}
                    data-testid="input-extraction-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tag">Tag for Prospects *</Label>
                  <Input
                    id="tag"
                    placeholder="e.g., tech-ceos-q1"
                    value={advancedFilters.tag || ""}
                    onChange={(e) => setAdvancedFilters({
                      ...advancedFilters,
                      tag: e.target.value
                    })}
                    data-testid="input-tag"
                  />
                </div>
              </div>

              {/* Job Titles / Decision Makers */}
              <div className="space-y-2">
                <Label htmlFor="job-titles">Decision Makers & Job Titles</Label>
                <Input
                  id="job-titles"
                  placeholder="e.g., CEO, CTO, VP Sales, Merchandiser"
                  value={advancedFilters.jobTitles?.join(", ") || ""}
                  onChange={(e) => setAdvancedFilters({
                    ...advancedFilters,
                    jobTitles: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                  })}
                  data-testid="input-job-titles"
                />
                <p className="text-xs text-muted-foreground">Comma-separated</p>
              </div>

              {/* Industries - Multi-select with Checkboxes */}
              <div className="space-y-2">
                <Label>Industries (Select Multiple)</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 border rounded-md max-h-48 overflow-y-auto" data-testid="industries-checkboxes">
                  {INDUSTRIES.map((industry) => (
                    <div key={industry} className="flex items-center space-x-2">
                      <Checkbox
                        id={`industry-${industry}`}
                        checked={advancedFilters.industries?.includes(industry.toLowerCase()) || false}
                        onCheckedChange={(checked) => {
                          const current = advancedFilters.industries || [];
                          const industryLower = industry.toLowerCase();
                          setAdvancedFilters({
                            ...advancedFilters,
                            industries: checked 
                              ? [...current, industryLower]
                              : current.filter(i => i !== industryLower)
                          });
                        }}
                      />
                      <label htmlFor={`industry-${industry}`} className="text-sm cursor-pointer">
                        {industry}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Countries - Multi-select with Checkboxes */}
              <div className="space-y-2">
                <Label>Countries (Select Multiple)</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 border rounded-md max-h-48 overflow-y-auto" data-testid="countries-checkboxes">
                  {COUNTRIES.map((country) => (
                    <div key={country} className="flex items-center space-x-2">
                      <Checkbox
                        id={`country-${country}`}
                        checked={advancedFilters.countries?.includes(country) || false}
                        onCheckedChange={(checked) => {
                          const current = advancedFilters.countries || [];
                          setAdvancedFilters({
                            ...advancedFilters,
                            countries: checked 
                              ? [...current, country]
                              : current.filter(c => c !== country)
                          });
                        }}
                      />
                      <label htmlFor={`country-${country}`} className="text-sm cursor-pointer">
                        {country}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Company Size - Multi-select with Checkboxes */}
              <div className="space-y-2">
                <Label>Company Size (Select Multiple)</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-4 border rounded-md" data-testid="company-size-checkboxes">
                  {COMPANY_SIZES.map((size) => (
                    <div key={size.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`size-${size.value}`}
                        checked={advancedFilters.companySizes?.includes(size.value) || false}
                        onCheckedChange={(checked) => {
                          const current = advancedFilters.companySizes || [];
                          setAdvancedFilters({
                            ...advancedFilters,
                            companySizes: checked 
                              ? [...current, size.value]
                              : current.filter(s => s !== size.value)
                          });
                        }}
                      />
                      <label htmlFor={`size-${size.value}`} className="text-sm cursor-pointer">
                        {size.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seniority Level - Multi-select with Checkboxes */}
              <div className="space-y-2">
                <Label>Seniority Level (Select Multiple)</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 border rounded-md" data-testid="seniority-checkboxes">
                  {SENIORITY_LEVELS.map((level) => (
                    <div key={level.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`seniority-${level.value}`}
                        checked={advancedFilters.seniorityLevels?.includes(level.value) || false}
                        onCheckedChange={(checked) => {
                          const current = advancedFilters.seniorityLevels || [];
                          setAdvancedFilters({
                            ...advancedFilters,
                            seniorityLevels: checked 
                              ? [...current, level.value]
                              : current.filter(s => s !== level.value)
                          });
                        }}
                      />
                      <label htmlFor={`seniority-${level.value}`} className="text-sm cursor-pointer">
                        {level.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Number of Prospects Slider */}
              <div className="space-y-2">
                <Label htmlFor="prospect-count">Number of Prospects: {advancedFilters.prospectCount || 50}</Label>
                <Slider
                  id="prospect-count"
                  min={10}
                  max={200}
                  step={10}
                  value={[advancedFilters.prospectCount || 50]}
                  onValueChange={(value) => setAdvancedFilters({
                    ...advancedFilters,
                    prospectCount: value[0]
                  })}
                  data-testid="slider-prospect-count"
                />
              </div>

              {/* Additional Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="specific-companies">Specific Companies (Optional)</Label>
                  <Input
                    id="specific-companies"
                    placeholder="e.g., Microsoft, Google, Amazon"
                    value={advancedFilters.specificCompanies || ""}
                    onChange={(e) => setAdvancedFilters({
                      ...advancedFilters,
                      specificCompanies: e.target.value
                    })}
                    data-testid="input-specific-companies"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="technologies">Technologies Used</Label>
                  <Input
                    id="technologies"
                    placeholder="e.g., Salesforce, HubSpot, Shopify"
                    value={advancedFilters.technologies || ""}
                    onChange={(e) => setAdvancedFilters({
                      ...advancedFilters,
                      technologies: e.target.value
                    })}
                    data-testid="input-technologies"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="departments">Departments</Label>
                  <Input
                    id="departments"
                    placeholder="e.g., marketing, sales, operations"
                    value={advancedFilters.departments || ""}
                    onChange={(e) => setAdvancedFilters({
                      ...advancedFilters,
                      departments: e.target.value
                    })}
                    data-testid="input-departments"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end border-t pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setAdvancedFilters({ prospectCount: 50 });
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
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                {apolloSearchMutation.isPending ? (
                  <>
                    <SparklesIcon className="w-4 h-4 mr-2 animate-spin" />
                    Finding Prospects...
                  </>
                ) : (
                  <>
                    <SearchIcon className="w-4 h-4 mr-2" />
                    Find My Prospects
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
