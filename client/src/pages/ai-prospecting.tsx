import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { 
  SearchIcon, 
  SparklesIcon, 
  DatabaseIcon, 
  DollarSignIcon,
  TrendingUpIcon,
  ClockIcon,
  UsersIcon,
  SettingsIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  BarChartIcon,
  ActivityIcon,
  LayersIcon,
  XIcon
} from "lucide-react";

interface SearchCriteria {
  industry?: string;
  companySize?: string;
  jobTitles?: string[];
  location?: string;
  limit: number;
  keywords?: string;
  seniority?: string[];
  departments?: string[];
  technologies?: string[];
  fundingStage?: string;
  revenueRange?: {
    min?: number;
    max?: number;
  };
}

interface ProviderChainEntry {
  provider: string;
  fetched: number;
  unique: number;
  cost: number;
}

interface SearchResult {
  success: boolean;
  providers: string[];
  prospects: any[];
  totalCost: number;
  providerChain: ProviderChainEntry[];
  searchId?: string;
  summary: {
    totalFetched: number;
    totalUnique: number;
    primaryProvider: string;
  };
}

interface SearchHistory {
  id: string;
  searchCriteria: any;
  resultsCount: number;
  totalCost: number;
  createdAt: string;
  providers: string[];
}

interface UsageStats {
  totalCost: number;
  totalCalls: number;
  byProvider: Record<string, { calls: number; cost: number }>;
}

interface ProviderStatus {
  name: string;
  available: boolean;
  priority: number;
}

const INDUSTRIES = [
  "Technology", "SaaS", "Software", "Healthcare", "Fintech",
  "Financial Services", "E-commerce", "Manufacturing", "Education",
  "Marketing", "Real Estate", "Consulting", "Legal", "Media",
  "Retail", "Telecommunications", "Energy", "Transportation"
];

const COMPANY_SIZES = [
  { value: "1-10", label: "Startup (1-10)" },
  { value: "11-50", label: "Small (11-50)" },
  { value: "51-200", label: "Medium (51-200)" },
  { value: "201-1000", label: "Large (201-1000)" },
  { value: "1001-999999", label: "Enterprise (1000+)" }
];

const SENIORITY_LEVELS = [
  { value: "entry", label: "Entry Level" },
  { value: "senior", label: "Senior" },
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "vp", label: "VP" },
  { value: "c_level", label: "C-Suite" },
  { value: "owner", label: "Owner/Founder" }
];

const DEPARTMENTS = [
  "Engineering", "Sales", "Marketing", "Product", "Finance",
  "HR", "Operations", "Legal", "Customer Success", "IT"
];

export default function AIProspecting() {
  const [activeTab, setActiveTab] = useState("search");
  const [criteria, setCriteria] = useState<SearchCriteria>({ limit: 50 });
  const [jobTitleInput, setJobTitleInput] = useState("");
  const [techInput, setTechInput] = useState("");
  const [saveToDb, setSaveToDb] = useState(false);
  const [extractionName, setExtractionName] = useState("");
  const [tag, setTag] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: providerStatus } = useQuery<{ providers: ProviderStatus[] }>({
    queryKey: ["/api/waterfall/providers"],
  });

  const { data: usageStats } = useQuery<UsageStats>({
    queryKey: ["/api/waterfall/usage"],
  });

  const { data: searchHistory } = useQuery<{ searches: SearchHistory[] }>({
    queryKey: ["/api/waterfall/history"],
  });

  const { data: costSummary } = useQuery<{ summary: Record<string, any> }>({
    queryKey: ["/api/waterfall/cost-summary"],
  });

  const searchMutation = useMutation({
    mutationFn: async (data: { criteria: SearchCriteria; saveToDb: boolean; extractionName?: string; tag?: string }) => {
      const endpoint = data.saveToDb ? "/api/waterfall/search-and-save" : "/api/waterfall/search";
      const body = data.saveToDb 
        ? { criteria: data.criteria, extractionName: data.extractionName, tag: data.tag }
        : data.criteria;
      const response = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || 'Search failed');
      }
      return response.json() as Promise<SearchResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/waterfall/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/waterfall/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/waterfall/cost-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prospects"] });
      
      toast({
        title: "Search Complete",
        description: `Found ${data.prospects.length} prospects via ${data.providers.join(" → ")}. Cost: $${data.totalCost.toFixed(4)}`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Search Failed",
        description: error.message || "An error occurred during search",
        variant: "destructive"
      });
    }
  });

  const addJobTitle = () => {
    if (jobTitleInput.trim()) {
      setCriteria(prev => ({
        ...prev,
        jobTitles: [...(prev.jobTitles || []), jobTitleInput.trim()]
      }));
      setJobTitleInput("");
    }
  };

  const removeJobTitle = (title: string) => {
    setCriteria(prev => ({
      ...prev,
      jobTitles: prev.jobTitles?.filter(t => t !== title)
    }));
  };

  const addTechnology = () => {
    if (techInput.trim()) {
      setCriteria(prev => ({
        ...prev,
        technologies: [...(prev.technologies || []), techInput.trim()]
      }));
      setTechInput("");
    }
  };

  const removeTechnology = (tech: string) => {
    setCriteria(prev => ({
      ...prev,
      technologies: prev.technologies?.filter(t => t !== tech)
    }));
  };

  const toggleSeniority = (value: string) => {
    setCriteria(prev => ({
      ...prev,
      seniority: prev.seniority?.includes(value)
        ? prev.seniority.filter(s => s !== value)
        : [...(prev.seniority || []), value]
    }));
  };

  const toggleDepartment = (value: string) => {
    setCriteria(prev => ({
      ...prev,
      departments: prev.departments?.includes(value)
        ? prev.departments.filter(d => d !== value)
        : [...(prev.departments || []), value]
    }));
  };

  const handleSearch = () => {
    searchMutation.mutate({ criteria, saveToDb, extractionName, tag });
  };

  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'perplexity': return '🔮';
      case 'apollo': return '🚀';
      case 'lusha': return '📧';
      case 'openrouter': return '🤖';
      default: return '📡';
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <SparklesIcon className="h-8 w-8 text-primary" />
            AI Prospecting
          </h1>
          <p className="text-muted-foreground mt-1">
            Multi-provider waterfall search for intelligent prospect discovery
          </p>
        </div>
        <div className="flex items-center gap-4">
          {providerStatus?.providers && (
            <div className="flex items-center gap-2">
              {providerStatus.providers.map(p => (
                <Badge 
                  key={p.name} 
                  variant={p.available ? "default" : "outline"}
                  className={p.available ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" : ""}
                  data-testid={`badge-provider-${p.name}`}
                >
                  {getProviderIcon(p.name)} {p.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="search" className="flex items-center gap-2" data-testid="tab-search">
            <SearchIcon className="h-4 w-4" /> Search
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2" data-testid="tab-history">
            <ClockIcon className="h-4 w-4" /> History
          </TabsTrigger>
          <TabsTrigger value="usage" className="flex items-center gap-2" data-testid="tab-usage">
            <BarChartIcon className="h-4 w-4" /> Usage
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2" data-testid="tab-settings">
            <SettingsIcon className="h-4 w-4" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Search Criteria</CardTitle>
                  <CardDescription>
                    Define your ideal prospect profile. The system will search across multiple providers.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Industry</Label>
                      <Select
                        value={criteria.industry || ""}
                        onValueChange={(value) => setCriteria(prev => ({ ...prev, industry: value }))}
                      >
                        <SelectTrigger data-testid="select-industry">
                          <SelectValue placeholder="Select industry" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDUSTRIES.map(ind => (
                            <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Company Size</Label>
                      <Select
                        value={criteria.companySize || ""}
                        onValueChange={(value) => setCriteria(prev => ({ ...prev, companySize: value }))}
                      >
                        <SelectTrigger data-testid="select-company-size">
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent>
                          {COMPANY_SIZES.map(size => (
                            <SelectItem key={size.value} value={size.value}>{size.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Input 
                      placeholder="e.g., San Francisco, California" 
                      value={criteria.location || ""}
                      onChange={(e) => setCriteria(prev => ({ ...prev, location: e.target.value }))}
                      data-testid="input-location"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Job Titles</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Add job title..." 
                        value={jobTitleInput}
                        onChange={(e) => setJobTitleInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addJobTitle()}
                        data-testid="input-job-title"
                      />
                      <Button onClick={addJobTitle} variant="outline" data-testid="button-add-job-title">Add</Button>
                    </div>
                    {criteria.jobTitles && criteria.jobTitles.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {criteria.jobTitles.map(title => (
                          <Badge key={title} variant="secondary" className="flex items-center gap-1">
                            {title}
                            <XIcon 
                              className="h-3 w-3 cursor-pointer" 
                              onClick={() => removeJobTitle(title)}
                            />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Keywords</Label>
                    <Input 
                      placeholder="Search keywords..." 
                      value={criteria.keywords || ""}
                      onChange={(e) => setCriteria(prev => ({ ...prev, keywords: e.target.value }))}
                      data-testid="input-keywords"
                    />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Seniority Levels</Label>
                    <div className="flex flex-wrap gap-2">
                      {SENIORITY_LEVELS.map(level => (
                        <Badge 
                          key={level.value}
                          variant={criteria.seniority?.includes(level.value) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleSeniority(level.value)}
                          data-testid={`badge-seniority-${level.value}`}
                        >
                          {level.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Departments</Label>
                    <div className="flex flex-wrap gap-2">
                      {DEPARTMENTS.map(dept => (
                        <Badge 
                          key={dept}
                          variant={criteria.departments?.includes(dept) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleDepartment(dept)}
                          data-testid={`badge-department-${dept}`}
                        >
                          {dept}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Technologies</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Add technology..." 
                        value={techInput}
                        onChange={(e) => setTechInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addTechnology()}
                        data-testid="input-technology"
                      />
                      <Button onClick={addTechnology} variant="outline" data-testid="button-add-technology">Add</Button>
                    </div>
                    {criteria.technologies && criteria.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {criteria.technologies.map(tech => (
                          <Badge key={tech} variant="secondary" className="flex items-center gap-1">
                            {tech}
                            <XIcon 
                              className="h-3 w-3 cursor-pointer" 
                              onClick={() => removeTechnology(tech)}
                            />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Results Limit: {criteria.limit}</Label>
                    <Slider
                      value={[criteria.limit]}
                      onValueChange={(value) => setCriteria(prev => ({ ...prev, limit: value[0] }))}
                      min={10}
                      max={200}
                      step={10}
                      data-testid="slider-limit"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DatabaseIcon className="h-5 w-5" />
                    Save Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="saveToDb" 
                      checked={saveToDb}
                      onCheckedChange={(checked) => setSaveToDb(checked as boolean)}
                      data-testid="checkbox-save-to-db"
                    />
                    <Label htmlFor="saveToDb">Save prospects to database</Label>
                  </div>
                  
                  {saveToDb && (
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label>Extraction Name</Label>
                        <Input 
                          placeholder="e.g., Q1 Campaign" 
                          value={extractionName}
                          onChange={(e) => setExtractionName(e.target.value)}
                          data-testid="input-extraction-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tag</Label>
                        <Input 
                          placeholder="e.g., hot-leads" 
                          value={tag}
                          onChange={(e) => setTag(e.target.value)}
                          data-testid="input-tag"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LayersIcon className="h-5 w-5" />
                    Provider Cascade
                  </CardTitle>
                  <CardDescription>
                    Search providers in priority order
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {providerStatus?.providers?.map((provider, index) => (
                      <div 
                        key={provider.name} 
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          provider.available ? 'border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800' : 'border-gray-200 bg-gray-50 dark:bg-gray-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getProviderIcon(provider.name)}</span>
                          <span className="font-medium">{provider.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">#{index + 1}</Badge>
                          {provider.available ? (
                            <CheckCircleIcon className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertCircleIcon className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </div>
                    )) || (
                      <div className="text-center text-muted-foreground py-4">
                        Loading providers...
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Button 
                onClick={handleSearch}
                disabled={searchMutation.isPending}
                className="w-full"
                size="lg"
                data-testid="button-search"
              >
                {searchMutation.isPending ? (
                  <>
                    <ActivityIcon className="h-5 w-5 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <SearchIcon className="h-5 w-5 mr-2" />
                    Search Prospects
                  </>
                )}
              </Button>

              {searchMutation.data && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUpIcon className="h-5 w-5" />
                      Search Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-primary/10 rounded-lg">
                        <div className="text-2xl font-bold">{searchMutation.data.prospects.length}</div>
                        <div className="text-sm text-muted-foreground">Prospects Found</div>
                      </div>
                      <div className="text-center p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                        <div className="text-2xl font-bold">${searchMutation.data.totalCost.toFixed(4)}</div>
                        <div className="text-sm text-muted-foreground">Total Cost</div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Provider Chain</Label>
                      {searchMutation.data.providerChain.map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm py-1">
                          <div className="flex items-center gap-2">
                            <span>{getProviderIcon(entry.provider)}</span>
                            <span>{entry.provider}</span>
                          </div>
                          <div className="flex items-center gap-4 text-muted-foreground">
                            <span>{entry.unique}/{entry.fetched}</span>
                            <span>${entry.cost.toFixed(4)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Search History</CardTitle>
              <CardDescription>Recent waterfall searches and their results</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {searchHistory?.searches?.map((search) => (
                    <div key={search.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {search.providers?.map(p => (
                            <Badge key={p} variant="outline">
                              {getProviderIcon(p)} {p}
                            </Badge>
                          ))}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(search.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span><UsersIcon className="h-4 w-4 inline mr-1" />{search.resultsCount} results</span>
                        <span><DollarSignIcon className="h-4 w-4 inline mr-1" />${search.totalCost?.toFixed(4) || '0.00'}</span>
                      </div>
                    </div>
                  )) || (
                    <div className="text-center text-muted-foreground py-8">
                      No search history yet
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSignIcon className="h-5 w-5" />
                  Total Spend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${usageStats?.totalCost?.toFixed(4) || '0.00'}</div>
                <p className="text-muted-foreground">Last 30 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ActivityIcon className="h-5 w-5" />
                  API Calls
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{usageStats?.totalCalls || 0}</div>
                <p className="text-muted-foreground">Last 30 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUpIcon className="h-5 w-5" />
                  Cost Per Call
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  ${usageStats?.totalCalls ? (usageStats.totalCost / usageStats.totalCalls).toFixed(4) : '0.00'}
                </div>
                <p className="text-muted-foreground">Average</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Usage by Provider</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {usageStats?.byProvider && Object.entries(usageStats.byProvider).map(([provider, stats]) => (
                  <div key={provider} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getProviderIcon(provider)}</span>
                      <div>
                        <div className="font-medium">{provider}</div>
                        <div className="text-sm text-muted-foreground">{stats.calls} calls</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">${stats.cost.toFixed(4)}</div>
                      <div className="text-sm text-muted-foreground">
                        ${stats.calls > 0 ? (stats.cost / stats.calls).toFixed(4) : '0.00'}/call
                      </div>
                    </div>
                  </div>
                )) || (
                  <div className="text-center text-muted-foreground py-8">
                    No usage data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Provider Settings</CardTitle>
              <CardDescription>Configure waterfall search behavior and provider priorities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="p-4 border rounded-lg bg-muted/50">
                  <h3 className="font-medium mb-2">Current Provider Order</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    The system searches providers in this order, accumulating results until the target limit is reached:
                  </p>
                  <ol className="list-decimal list-inside space-y-2">
                    <li className="flex items-center gap-2">
                      <span>🔮 Perplexity AI</span>
                      <Badge variant="outline">AI-powered research</Badge>
                    </li>
                    <li className="flex items-center gap-2">
                      <span>🚀 Apollo.io</span>
                      <Badge variant="outline">Verified contacts</Badge>
                    </li>
                    <li className="flex items-center gap-2">
                      <span>📧 Lusha</span>
                      <Badge variant="outline">Email enrichment</Badge>
                    </li>
                    <li className="flex items-center gap-2">
                      <span>🤖 OpenRouter</span>
                      <Badge variant="outline">AI fallback</Badge>
                    </li>
                  </ol>
                </div>

                <div className="p-4 border rounded-lg">
                  <h3 className="font-medium mb-2">Cost Rates</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Perplexity:</span> $5/$15 per 1M tokens
                    </div>
                    <div>
                      <span className="text-muted-foreground">Apollo:</span> Per-credit pricing
                    </div>
                    <div>
                      <span className="text-muted-foreground">Lusha:</span> Per-credit pricing
                    </div>
                    <div>
                      <span className="text-muted-foreground">OpenRouter:</span> $15/$75 per 1M tokens
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
