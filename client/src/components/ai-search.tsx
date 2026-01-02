import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { getCsrfToken } from "@/lib/csrf";
import { SparklesIcon, SearchIcon, SlidersHorizontalIcon, XIcon, ChevronDownIcon, ChevronUpIcon, AlertCircleIcon, CheckCircleIcon, EditIcon, Loader2Icon, BuildingIcon } from "lucide-react";

interface ActiveFilter {
  type: string;
  value: string;
  icon: string;
}

interface ResolvedCompany {
  input: string;           // Original input (name or domain)
  id: string;              // Apollo organization_id (or synthetic ID for non-Apollo sources)
  name: string;            // Normalized company name
  domain?: string;         // Company domain
  resolved: boolean;       // Whether resolution succeeded
  error?: string;          // Error message if resolution failed
  source?: string;         // Which provider resolved this (apollo, perplexity, lusha, openrouter)
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
  targetCompanies?: ResolvedCompany[];  // New: resolved company filter
}

interface ParsedFilters {
  apolloFilters: any;
  aiFilters: any;
  originalQuery: string;
}

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
  const [parsedFilters, setParsedFilters] = useState<ParsedFilters | null>(null);
  const [showFilterPreview, setShowFilterPreview] = useState(false);
  const [jobTitleInput, setJobTitleInput] = useState(""); // Separate input state for job titles
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  // Add job titles from input - handles comma-separated, semicolon-separated, or single titles
  const addJobTitles = (input: string) => {
    // Split by comma or semicolon, trim each, filter empties
    const titles = input
      .split(/[,;]/)
      .map(t => t.trim())
      .filter(Boolean);
    
    if (titles.length === 0) return;
    
    const current = advancedFilters.jobTitles || [];
    const newTitles: string[] = [];
    const duplicates: string[] = [];
    
    for (const title of titles) {
      // Check for duplicates (case-insensitive) in both existing and newly added
      const isDuplicate = current.some(t => t.toLowerCase() === title.toLowerCase()) ||
                          newTitles.some(t => t.toLowerCase() === title.toLowerCase());
      if (isDuplicate) {
        duplicates.push(title);
      } else {
        newTitles.push(title);
      }
    }
    
    // Show toast for duplicates
    if (duplicates.length > 0) {
      toast({
        title: duplicates.length === 1 ? "Duplicate title" : "Duplicate titles",
        description: `"${duplicates.join('", "')}" already added`,
        variant: "destructive"
      });
    }
    
    // Add non-duplicate titles
    if (newTitles.length > 0) {
      setAdvancedFilters({
        ...advancedFilters,
        jobTitles: [...current, ...newTitles]
      });
    }
    
    setJobTitleInput(""); // Clear input after adding
  };
  
  // Handle job title input keydown (Enter to add)
  const handleJobTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (jobTitleInput.trim()) {
        addJobTitles(jobTitleInput);
      }
    }
    // For comma key, let the character be typed and then process on next change
  };
  
  // Handle input change - check for comma at the end to auto-add
  const handleJobTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // If user types a comma at the end, process and add the title(s)
    if (value.endsWith(",")) {
      const beforeComma = value.slice(0, -1).trim();
      if (beforeComma) {
        addJobTitles(beforeComma);
      }
    } else {
      setJobTitleInput(value);
    }
  };
  
  // Remove a job title by index
  const removeJobTitle = (index: number) => {
    const updated = advancedFilters.jobTitles?.filter((_, i) => i !== index) || [];
    setAdvancedFilters({
      ...advancedFilters,
      jobTitles: updated
    });
  };

  // Company filter state and handlers
  const [companyInput, setCompanyInput] = useState("");
  const [isResolvingCompany, setIsResolvingCompany] = useState(false);
  
  // Resolve company name/domain to Apollo organization ID
  const resolveCompany = async (input: string): Promise<ResolvedCompany> => {
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch("/api/resolve-company", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken
        },
        credentials: "include",
        body: JSON.stringify({ query: input })
      });
      
      if (!response.ok) {
        const error = await response.json();
        return {
          input,
          id: "",
          name: input,
          resolved: false,
          error: error.message || "Company not found"
        };
      }
      
      const data = await response.json();
      return {
        input,
        id: data.organizationId,
        name: data.name,
        domain: data.domain,
        resolved: true,
        source: data.source  // Track which provider resolved this
      };
    } catch (error) {
      return {
        input,
        id: "",
        name: input,
        resolved: false,
        error: "Failed to resolve company"
      };
    }
  };
  
  // Add companies from input
  const addCompanies = async (input: string) => {
    const entries = input
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(Boolean);
    
    if (entries.length === 0) return;
    
    const current = advancedFilters.targetCompanies || [];
    const duplicates: string[] = [];
    const toResolve: string[] = [];
    
    for (const entry of entries) {
      // Check for duplicates by input (case-insensitive)
      const isDuplicate = current.some(c => 
        c.input.toLowerCase() === entry.toLowerCase() ||
        c.name.toLowerCase() === entry.toLowerCase()
      );
      if (isDuplicate) {
        duplicates.push(entry);
      } else {
        toResolve.push(entry);
      }
    }
    
    if (duplicates.length > 0) {
      toast({
        title: "Duplicate company",
        description: `"${duplicates.join('", "')}" already added`,
        variant: "destructive"
      });
    }
    
    if (toResolve.length === 0) {
      setCompanyInput("");
      return;
    }
    
    setIsResolvingCompany(true);
    
    try {
      // Resolve all companies in parallel
      const resolved = await Promise.all(toResolve.map(resolveCompany));
      
      // Check for resolution failures
      const failed = resolved.filter(r => !r.resolved);
      const succeeded = resolved.filter(r => r.resolved);
      
      if (failed.length > 0) {
        toast({
          title: "Company resolution failed",
          description: `Could not find: ${failed.map(f => f.input).join(", ")}. Check spelling or try company website.`,
          variant: "destructive"
        });
      }
      
      if (succeeded.length > 0) {
        setAdvancedFilters({
          ...advancedFilters,
          targetCompanies: [...current, ...succeeded]
        });
        
        toast({
          title: "Companies added",
          description: `Added: ${succeeded.map(s => s.name).join(", ")}`,
        });
      }
    } finally {
      setIsResolvingCompany(false);
      setCompanyInput("");
    }
  };
  
  // Handle company input keydown
  const handleCompanyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (companyInput.trim() && !isResolvingCompany) {
        addCompanies(companyInput);
      }
    }
  };
  
  // Handle company input change
  const handleCompanyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.endsWith(",")) {
      const beforeComma = value.slice(0, -1).trim();
      if (beforeComma && !isResolvingCompany) {
        addCompanies(beforeComma);
      }
    } else {
      setCompanyInput(value);
    }
  };
  
  // Remove a company by index
  const removeCompany = (index: number) => {
    const updated = advancedFilters.targetCompanies?.filter((_, i) => i !== index) || [];
    setAdvancedFilters({
      ...advancedFilters,
      targetCompanies: updated
    });
  };

  const aiSearchMutation = useMutation({
    mutationFn: api.aiSearch,
    onSuccess: (data) => {
      const filters: ActiveFilter[] = [];
      
      if (data.aiFilters.jobTitles?.length) {
        filters.push({
          type: "jobTitles",
          value: data.aiFilters.jobTitles.join(" OR "),
          icon: "💼"
        });
      }
      
      if (data.aiFilters.industries?.length) {
        filters.push({
          type: "industries", 
          value: data.aiFilters.industries.join(" OR "),
          icon: "🏢"
        });
      }
      
      if (data.aiFilters.locations?.length) {
        filters.push({
          type: "locations",
          value: data.aiFilters.locations.join(" OR "),
          icon: "📍"
        });
      }

      if (data.aiFilters.companyNames?.length) {
        filters.push({
          type: "companies",
          value: data.aiFilters.companyNames.join(" OR "),
          icon: "🏛️"
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
      
      setParsedFilters({
        apolloFilters: data.apolloFilters,
        aiFilters: data.aiFilters,
        originalQuery: query
      });
      setShowFilterPreview(true);
      
      toast({
        title: "Filters Parsed",
        description: "Review the filters below before executing the search.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: error.message || "Failed to parse search query",
      });
    },
  });

  const apolloSearchMutation = useMutation({
    mutationFn: (params: { apolloFilters: any; extractionName?: string; tag?: string; prospectCount?: number; useWaterfall?: boolean }) => 
      api.apolloSearchAndSave(
        params.apolloFilters, 
        1, 
        params.prospectCount || 50,
        params.extractionName,
        params.tag,
        params.useWaterfall ?? true
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospects"] });
      
      const totalFound = data.pagination?.total_entries || data.saved;
      
      if (data.saved === 0) {
        const totalAvailable = data.pagination?.total_entries || 0;
        if (totalAvailable > 0) {
          toast({
            variant: "destructive",
            title: "Apollo Credits Required",
            description: `Apollo found ${totalAvailable.toLocaleString()} matching prospects but your account needs credits to access them.`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "No Prospects Found",
            description: data.searchStrategyMessage || `No prospects matched your search criteria.`,
          });
        }
        return;
      }
      
      let successMessage = '';
      const newCount = data.newCount || 0;
      const updatedCount = data.updatedCount || 0;
      
      if (newCount > 0 && updatedCount > 0) {
        successMessage = `Added ${newCount} new prospect${newCount === 1 ? '' : 's'}, updated ${updatedCount} existing (${totalFound.toLocaleString()} total available).`;
      } else if (newCount > 0) {
        successMessage = `Added ${newCount} new prospect${newCount === 1 ? '' : 's'} (${totalFound.toLocaleString()} total available).`;
      } else if (updatedCount > 0) {
        successMessage = `Updated ${updatedCount} existing prospect${updatedCount === 1 ? '' : 's'} - all were duplicates (${totalFound.toLocaleString()} total available).`;
      }
      
      if (data.searchStrategyMessage) {
        successMessage = `${data.searchStrategyMessage}. ${successMessage}`;
      }
      
      toast({
        title: "Prospects Saved Successfully",
        description: successMessage,
      });

      setShowFilterPreview(false);
      setParsedFilters(null);
      setActiveFilters([]);

      setTimeout(() => {
        setLocation("/prospects");
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

  const handleParseQuery = () => {
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

  const handleExecuteSearch = () => {
    if (!parsedFilters) return;
    
    const extractionName = advancedFilters.extractionName?.trim() || query.substring(0, 100);
    const tag = advancedFilters.tag?.trim() || "AI Search";
    
    const finalFilters = { ...parsedFilters.apolloFilters };
    
    if (advancedFilters.jobTitles?.length) {
      finalFilters.person_titles = advancedFilters.jobTitles;
    }
    if (advancedFilters.countries?.length) {
      finalFilters.person_locations = advancedFilters.countries;
    }
    if (advancedFilters.seniorityLevels?.length) {
      finalFilters.person_seniorities = advancedFilters.seniorityLevels;
    }
    
    // TARGET COMPANIES - HARD FILTER that takes precedence
    const resolvedCompanies = advancedFilters.targetCompanies?.filter(c => c.resolved) || [];
    if (resolvedCompanies.length > 0) {
      // Split by source: Apollo IDs use organization_ids, others use q_organization_name
      const apolloCompanies = resolvedCompanies.filter(c => c.source === 'apollo');
      const otherCompanies = resolvedCompanies.filter(c => c.source !== 'apollo');
      
      if (apolloCompanies.length > 0) {
        // Use organization_ids for Apollo-resolved companies (precise matching)
        finalFilters.organization_ids = apolloCompanies.map(c => c.id);
      }
      
      if (otherCompanies.length > 0) {
        // Use q_organization_name for non-Apollo sources (fuzzy matching by name)
        const companyNames = otherCompanies.map(c => c.name);
        finalFilters.q_organization_name = companyNames.join(' OR ');
      }
      
      // CRITICAL: Clear org-level filters that conflict with company targeting
      delete finalFilters.organization_industry_tag_ids;
      delete finalFilters.organization_num_employees_ranges;
      delete finalFilters.q_organization_keyword_tags;
    } else {
      // Only apply these filters when NOT using target companies
      if (advancedFilters.companySizes?.length) {
        finalFilters.organization_num_employees_ranges = advancedFilters.companySizes;
      }
      if (advancedFilters.industries?.length) {
        const mappedIndustries = advancedFilters.industries
          .map(mapIndustryToApolloId)
          .filter((id): id is string => id !== null);
        if (mappedIndustries.length > 0) {
          finalFilters.organization_industry_tag_ids = mappedIndustries;
        }
      }
      if (advancedFilters.specificCompanies?.trim()) {
        const companies = advancedFilters.specificCompanies.split(',').map(c => c.trim()).filter(Boolean);
        if (companies.length > 0) {
          finalFilters.q_organization_name = companies.join(' OR ');
        }
      }
    }
    
    if (advancedFilters.technologies?.trim()) {
      finalFilters.q_keywords = advancedFilters.technologies;
    }
    if (advancedFilters.departments?.trim()) {
      const depts = advancedFilters.departments.split(',').map(d => d.trim()).filter(Boolean);
      finalFilters.person_departments = depts;
    }
    
    apolloSearchMutation.mutate({ 
      apolloFilters: finalFilters,
      extractionName,
      tag,
      prospectCount: advancedFilters.prospectCount || 50
    });
  };

  const handleEditFiltersInAdvanced = () => {
    if (parsedFilters?.aiFilters) {
      const ai = parsedFilters.aiFilters;
      setAdvancedFilters({
        ...advancedFilters,
        extractionName: advancedFilters.extractionName || query.substring(0, 100),
        tag: advancedFilters.tag || "AI Search",
        jobTitles: ai.jobTitles || [],
        countries: ai.locations || [],
        specificCompanies: ai.companyNames?.join(", ") || "",
        industries: ai.industries || [],
        seniorityLevels: ai.seniority || [],
        departments: ai.departments?.join(", ") || "",
        technologies: ai.keywords?.join(", ") || "",
      });
    }
    setShowFilterPreview(false);
    setParsedFilters(null);
    setShowAdvancedFilters(true);
  };

  const mapIndustryToApolloId = (industry: string): string | null => {
    const mapping: { [key: string]: string } = {
      'fintech': '5567cdcc7369646289050000',
      'saas': '5567cdcc7369646289040000',
      'healthcare': '5567cdcc7369646289030000',
      'technology': '5567cdcc7369646289020000',
      'software': '5567cdcc7369646289040000',
      'financial services': '5567cdcc7369646289010000',
      'finance': '5567cdcc7369646289010000',
      'banking': '5567cdcc7369646289010000',
    };
    return mapping[industry.toLowerCase()] || null;
  };

  const handleAdvancedSearch = () => {
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
    
    // Check if any filter is set (including targetCompanies)
    const resolvedCompanies = advancedFilters.targetCompanies?.filter(c => c.resolved) || [];
    const hasFilters = advancedFilters.industries?.length || 
        advancedFilters.countries?.length || 
        advancedFilters.jobTitles?.length || 
        advancedFilters.seniorityLevels?.length || 
        advancedFilters.companySizes?.length ||
        advancedFilters.specificCompanies?.trim() ||
        advancedFilters.technologies?.trim() ||
        advancedFilters.departments?.trim() ||
        resolvedCompanies.length > 0;
    
    if (!hasFilters) {
      toast({
        variant: "destructive",
        title: "No Filters Selected",
        description: "Please select at least one filter to search",
      });
      return;
    }

    const filters: any = {};
    
    // TARGET COMPANIES - HARD FILTER (takes precedence)
    if (resolvedCompanies.length > 0) {
      // Split by source: Apollo IDs use organization_ids, others use q_organization_name
      const apolloCompanies = resolvedCompanies.filter(c => c.source === 'apollo');
      const otherCompanies = resolvedCompanies.filter(c => c.source !== 'apollo');
      
      if (apolloCompanies.length > 0) {
        filters.organization_ids = apolloCompanies.map(c => c.id);
      }
      
      if (otherCompanies.length > 0) {
        const companyNames = otherCompanies.map(c => c.name);
        filters.q_organization_name = companyNames.join(' OR ');
      }
      // Don't apply industry/size filters when targeting specific companies
    } else {
      // Only apply these when NOT using target companies
      if (advancedFilters.industries?.length) {
        const mappedIndustries = advancedFilters.industries
          .map(mapIndustryToApolloId)
          .filter((id): id is string => id !== null);
        
        if (mappedIndustries.length > 0) {
          filters.organization_industry_tag_ids = mappedIndustries;
        }
      }
      if (advancedFilters.companySizes?.length) {
        filters.organization_num_employees_ranges = advancedFilters.companySizes;
      }
      if (advancedFilters.specificCompanies) {
        const companies = advancedFilters.specificCompanies.split(',').map(c => c.trim()).filter(Boolean);
        if (companies.length > 0) {
          filters.q_organization_name = companies.join(' OR ');
        }
      }
    }
    
    // These filters always apply
    if (advancedFilters.countries?.length) {
      filters.person_locations = advancedFilters.countries;
    }
    if (advancedFilters.jobTitles?.length) {
      filters.person_titles = advancedFilters.jobTitles;
    }
    if (advancedFilters.seniorityLevels?.length) {
      filters.person_seniorities = advancedFilters.seniorityLevels;
    }
    if (advancedFilters.technologies) {
      filters.q_keywords = advancedFilters.technologies;
    }
    if (advancedFilters.departments) {
      const depts = advancedFilters.departments.split(',').map(d => d.trim()).filter(Boolean);
      filters.person_departments = depts;
    }

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
    setParsedFilters(null);
    setShowFilterPreview(false);
  };

  return (
    <div className="p-8 border-b border-border bg-gradient-to-br from-primary/5 to-accent/5">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="relative">
          <SparklesIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-accent w-5 h-5" />
          <Input
            type="text"
            placeholder="Describe who you're looking for... (e.g., 'Find CTOs in fintech companies in NYC with 100+ employees')"
            className="w-full pl-12 pr-32 py-4 text-base rounded-lg border-2 border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleParseQuery()}
            data-testid="input-ai-search"
          />
          <Button
            className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2"
            onClick={handleParseQuery}
            disabled={aiSearchMutation.isPending || apolloSearchMutation.isPending}
            data-testid="button-parse-search"
          >
            {aiSearchMutation.isPending ? (
              <SparklesIcon className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <SearchIcon className="w-4 h-4 mr-2" />
            )}
            {aiSearchMutation.isPending ? "Parsing..." : "Parse Query"}
          </Button>
        </div>

        {showFilterPreview && parsedFilters && (
          <div className="bg-card border-2 border-primary/30 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircleIcon className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-lg">Review Parsed Filters</h3>
              </div>
              <Badge variant="outline" className="text-xs">
                AI Interpretation
              </Badge>
            </div>
            
            <p className="text-sm text-muted-foreground">
              Review the filters below before executing the search. Use "Edit in Advanced Filters" for precise control.
            </p>

            <div className="bg-muted/50 rounded-md p-4 space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Query: "{parsedFilters.originalQuery}"</div>
              
              {parsedFilters.aiFilters.jobTitles?.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium min-w-24">Job Titles:</span>
                  <div className="flex flex-wrap gap-1">
                    {parsedFilters.aiFilters.jobTitles.map((title: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {title}
                        {i < parsedFilters.aiFilters.jobTitles.length - 1 && 
                          <span className="ml-1 text-amber-600 font-bold">OR</span>
                        }
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {parsedFilters.aiFilters.locations?.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium min-w-24">Locations:</span>
                  <div className="flex flex-wrap gap-1">
                    {parsedFilters.aiFilters.locations.map((loc: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {loc}
                        {i < parsedFilters.aiFilters.locations.length - 1 && 
                          <span className="ml-1 text-amber-600 font-bold">OR</span>
                        }
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {parsedFilters.aiFilters.companyNames?.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium min-w-24">Companies:</span>
                  <div className="flex flex-wrap gap-1">
                    {parsedFilters.aiFilters.companyNames.map((company: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {company}
                        {i < parsedFilters.aiFilters.companyNames.length - 1 && 
                          <span className="ml-1 text-amber-600 font-bold">OR</span>
                        }
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {parsedFilters.aiFilters.industries?.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium min-w-24">Industries:</span>
                  <div className="flex flex-wrap gap-1">
                    {parsedFilters.aiFilters.industries.map((ind: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {ind}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {parsedFilters.aiFilters.companySize && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium min-w-24">Company Size:</span>
                  <Badge variant="secondary" className="text-xs">
                    {parsedFilters.aiFilters.companySize.min || 0}+ employees
                  </Badge>
                </div>
              )}

              {parsedFilters.aiFilters.seniority?.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium min-w-24">Seniority:</span>
                  <div className="flex flex-wrap gap-1">
                    {parsedFilters.aiFilters.seniority.map((level: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {level}
                        {i < parsedFilters.aiFilters.seniority.length - 1 && 
                          <span className="ml-1 text-amber-600 font-bold">OR</span>
                        }
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {parsedFilters.aiFilters.departments?.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium min-w-24">Departments:</span>
                  <div className="flex flex-wrap gap-1">
                    {parsedFilters.aiFilters.departments.map((dept: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {dept}
                        {i < parsedFilters.aiFilters.departments.length - 1 && 
                          <span className="ml-1 text-amber-600 font-bold">OR</span>
                        }
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {parsedFilters.aiFilters.keywords?.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium min-w-24">Keywords:</span>
                  <div className="flex flex-wrap gap-1">
                    {parsedFilters.aiFilters.keywords.map((kw: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(parsedFilters.aiFilters).filter(k => 
                parsedFilters.aiFilters[k] && 
                (Array.isArray(parsedFilters.aiFilters[k]) ? parsedFilters.aiFilters[k].length > 0 : true) &&
                !['jobTitles', 'locations', 'companyNames', 'industries', 'companySize', 'seniority', 'departments', 'keywords'].includes(k)
              ).length === 0 && 
              !parsedFilters.aiFilters.jobTitles?.length && 
              !parsedFilters.aiFilters.locations?.length && 
              !parsedFilters.aiFilters.companyNames?.length && 
              !parsedFilters.aiFilters.industries?.length &&
              !parsedFilters.aiFilters.companySize &&
              !parsedFilters.aiFilters.seniority?.length &&
              !parsedFilters.aiFilters.departments?.length &&
              !parsedFilters.aiFilters.keywords?.length && (
                <div className="text-sm text-amber-600">
                  No specific filters extracted. Use Advanced Filters for precise targeting.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="preview-extraction-name">Extraction Name *</Label>
                <Input
                  id="preview-extraction-name"
                  placeholder="e.g., Tech CEOs Q1 2025"
                  value={advancedFilters.extractionName || ""}
                  onChange={(e) => setAdvancedFilters({
                    ...advancedFilters,
                    extractionName: e.target.value
                  })}
                  data-testid="input-preview-extraction-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preview-tag">Tag for Prospects *</Label>
                <Input
                  id="preview-tag"
                  placeholder="e.g., ai-search-q1"
                  value={advancedFilters.tag || ""}
                  onChange={(e) => setAdvancedFilters({
                    ...advancedFilters,
                    tag: e.target.value
                  })}
                  data-testid="input-preview-tag"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowFilterPreview(false);
                  setParsedFilters(null);
                }}
                data-testid="button-cancel-preview"
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={handleEditFiltersInAdvanced}
                data-testid="button-edit-in-advanced"
              >
                <EditIcon className="w-4 h-4 mr-2" />
                Edit in Advanced Filters
              </Button>
              <Button
                onClick={handleExecuteSearch}
                disabled={apolloSearchMutation.isPending || !advancedFilters.extractionName?.trim() || !advancedFilters.tag?.trim()}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                data-testid="button-execute-search"
              >
                {apolloSearchMutation.isPending ? (
                  <>
                    <SparklesIcon className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-4 h-4 mr-2" />
                    Execute Search
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {activeFilters.length > 0 && !showFilterPreview && (
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

        <Button
          variant="ghost"
          size="sm"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          data-testid="button-advanced-filters"
        >
          <SlidersHorizontalIcon className="w-4 h-4" />
          Advanced Filters (Precise Control)
          {showAdvancedFilters ? (
            <ChevronUpIcon className="w-3 h-3" />
          ) : (
            <ChevronDownIcon className="w-3 h-3" />
          )}
        </Button>

        {showAdvancedFilters && (
          <div className="bg-card border border-border rounded-lg p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Advanced Filters</h3>
                  <p className="text-sm text-muted-foreground">
                    These filters take precedence over AI search. Use for precise targeting.
                  </p>
                </div>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                  Source of Truth
                </Badge>
              </div>

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

              {/* Company Filter - HARD FILTER that takes precedence */}
              <div className="space-y-2 p-4 border-2 border-primary/20 rounded-lg bg-primary/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BuildingIcon className="h-4 w-4 text-primary" />
                    <Label htmlFor="target-companies" className="font-semibold">Target Companies (Priority Filter)</Label>
                  </div>
                  {advancedFilters.targetCompanies && advancedFilters.targetCompanies.length > 0 && (
                    <Badge variant="default" className="text-xs bg-primary">
                      HARD FILTER
                    </Badge>
                  )}
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Search job titles ONLY within these specific companies. Takes precedence over industries/size filters.
                </p>
                
                {/* Show resolved company badges */}
                {advancedFilters.targetCompanies && advancedFilters.targetCompanies.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-background" data-testid="target-companies-badges">
                    {advancedFilters.targetCompanies.map((company, index) => (
                      <Badge 
                        key={index} 
                        variant={company.resolved ? "secondary" : "destructive"}
                        className="text-sm flex items-center gap-1 py-1 px-2"
                      >
                        <BuildingIcon className="h-3 w-3" />
                        {company.name}
                        {company.domain && (
                          <span className="text-xs text-muted-foreground ml-1">({company.domain})</span>
                        )}
                        {index < advancedFilters.targetCompanies!.length - 1 && (
                          <span className="text-amber-600 font-bold ml-1 text-xs">OR</span>
                        )}
                        <button
                          onClick={() => removeCompany(index)}
                          className="ml-1 hover:text-destructive text-muted-foreground hover:text-red-500 transition-colors"
                          data-testid={`remove-company-${index}`}
                          aria-label={`Remove ${company.name}`}
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                
                {/* Input for adding companies */}
                <div className="flex gap-2">
                  <Input
                    id="target-companies"
                    placeholder={advancedFilters.targetCompanies?.length 
                      ? "Add another company (name or website)" 
                      : "e.g., Puma or puma.com (press Enter to add)"
                    }
                    value={companyInput}
                    onChange={handleCompanyChange}
                    onKeyDown={handleCompanyKeyDown}
                    onBlur={() => {
                      if (companyInput.trim() && !isResolvingCompany) {
                        addCompanies(companyInput);
                      }
                    }}
                    disabled={isResolvingCompany}
                    data-testid="input-target-companies"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addCompanies(companyInput)}
                    disabled={!companyInput.trim() || isResolvingCompany}
                    data-testid="button-add-company"
                  >
                    {isResolvingCompany ? (
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  {advancedFilters.targetCompanies && advancedFilters.targetCompanies.length > 0 
                    ? `${advancedFilters.targetCompanies.length} company(s) - job titles will be searched ONLY within these companies` 
                    : "Enter company name or website domain. Multiple companies = OR logic."
                  }
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="job-titles">Decision Makers & Job Titles</Label>
                  {advancedFilters.jobTitles && advancedFilters.jobTitles.length > 0 && (
                    <Badge variant="outline" className="text-xs text-amber-600">
                      OR Logic
                    </Badge>
                  )}
                </div>
                
                {/* Show badges FIRST when titles exist */}
                {advancedFilters.jobTitles && advancedFilters.jobTitles.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/30" data-testid="job-titles-badges">
                    {advancedFilters.jobTitles.map((title, index) => (
                      <Badge key={index} variant="secondary" className="text-sm flex items-center gap-1 py-1 px-2">
                        {title}
                        {index < advancedFilters.jobTitles!.length - 1 && (
                          <span className="text-amber-600 font-bold ml-1 text-xs">OR</span>
                        )}
                        <button
                          onClick={() => removeJobTitle(index)}
                          className="ml-1 hover:text-destructive text-muted-foreground hover:text-red-500 transition-colors"
                          data-testid={`remove-title-${index}`}
                          aria-label={`Remove ${title}`}
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                
                {/* Input for adding new titles */}
                <div className="flex gap-2">
                  <Input
                    id="job-titles"
                    placeholder={advancedFilters.jobTitles?.length 
                      ? "Add another title (Enter or comma to add)" 
                      : "e.g., CEO, CTO, VP Sales (Enter or comma to add)"
                    }
                    value={jobTitleInput}
                    onChange={handleJobTitleChange}
                    onKeyDown={handleJobTitleKeyDown}
                    onBlur={() => {
                      // Add any remaining text when focus leaves (handles comma-separated too)
                      if (jobTitleInput.trim()) {
                        addJobTitles(jobTitleInput);
                      }
                    }}
                    data-testid="input-job-titles"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addJobTitles(jobTitleInput)}
                    disabled={!jobTitleInput.trim()}
                    data-testid="button-add-job-title"
                  >
                    Add
                  </Button>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  {advancedFilters.jobTitles && advancedFilters.jobTitles.length > 0 
                    ? `${advancedFilters.jobTitles.length} title(s) added - matches ANY of these (OR logic)` 
                    : "Type a job title and press Enter or comma to add. Add multiple titles for OR matching."
                  }
                </p>
              </div>

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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Countries (Select Multiple)</Label>
                  <Badge variant="outline" className="text-xs text-amber-600">
                    OR Logic
                  </Badge>
                </div>
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
