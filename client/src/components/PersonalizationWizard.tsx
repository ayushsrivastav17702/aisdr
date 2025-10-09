import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { api } from '@/lib/api';
import { 
  Brain, 
  Target, 
  Sparkles, 
  Users, 
  Building, 
  TrendingUp, 
  Mail, 
  CheckCircle,
  AlertCircle,
  Zap,
  Eye,
  ArrowRight,
  Clock,
  Copy,
  RefreshCw,
  Search
} from 'lucide-react';

interface PersonalizationData {
  prospect: any;
  companyInsights: {
    industry: string;
    size: string;
    revenue: string;
    challenges: string[];
    recentNews: string[];
    competitors: string[];
    focusAreas?: string[];
  };
  roleInsights: {
    responsibilities: string[];
    painPoints: string[];
    metrics: string[];
    decisionMakingPower: string;
  };
  personalizationFactors: {
    factor: string;
    relevance: number;
    source: string;
    insight: string;
  }[];
  recommendations: {
    tone: string;
    approach: string;
    keyMessages: string[];
    callToAction: string;
  };
}

interface PersonalizationWizardProps {
  open: boolean;
  onClose: () => void;
  prospectId?: number;
  initialSelectedIds?: string[];
  onComplete?: (personalizedEmail: any) => void;
}

const personalizationSteps = [
  { id: 'select', title: 'Select Prospects', icon: Users },
  { id: 'analyze', title: 'AI Analysis', icon: Brain },
  { id: 'insights', title: 'Smart Insights', icon: Target },
  { id: 'personalize', title: 'Generate Emails', icon: Sparkles },
  { id: 'review', title: 'Review & Send', icon: Eye }
];

export function PersonalizationWizard({ 
  open, 
  onClose, 
  prospectId, 
  initialSelectedIds = [],
  onComplete 
}: PersonalizationWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedProspectId, setSelectedProspectId] = useState(prospectId?.toString() || initialSelectedIds[0] || '');
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>(
    initialSelectedIds.length > 0 ? initialSelectedIds : (prospectId ? [prospectId.toString()] : [])
  );
  const [batchMode, setBatchMode] = useState(initialSelectedIds.length > 1);
  const [personalizationData, setPersonalizationData] = useState<PersonalizationData | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [generatedEmail, setGeneratedEmail] = useState<any>(null);
  const [batchGeneratedEmails, setBatchGeneratedEmails] = useState<Map<string, any>>(new Map());
  const [activeProspectTab, setActiveProspectTab] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [emailSettings, setEmailSettings] = useState({
    tone: 'professional',
    focus: 'value_proposition',
    urgency: 'medium',
    length: 'medium'
  });
  const [useAdvancedMode, setUseAdvancedMode] = useState(true);
  const [advancedAnalysisData, setAdvancedAnalysisData] = useState<any>(null);
  const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);
  const [prospectSearchTerm, setProspectSearchTerm] = useState('');

  const { toast } = useToast();

  // Reset state when wizard opens with new initial selections
  useEffect(() => {
    if (open && initialSelectedIds.length > 0) {
      setSelectedProspectIds(initialSelectedIds);
      setSelectedProspectId(initialSelectedIds[0]);
      setBatchMode(initialSelectedIds.length > 1);
      setCurrentStep(0);
    }
  }, [open, initialSelectedIds]);

  // Debounce search to avoid too many API calls
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(prospectSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [prospectSearchTerm]);

  // Load prospects for selection with backend search
  const { data } = useQuery<{ prospects: any[]; total: number }>({
    queryKey: ["/api/prospects", { search: debouncedSearchTerm, limit: 100 }],
    queryFn: () => api.getProspects({ search: debouncedSearchTerm, limit: 100 }),
    enabled: open
  });
  const prospects = data?.prospects ?? [];

  // Load content library
  const { data: contentLibrary } = useQuery({
    queryKey: ["/api/content-library"],
    enabled: open
  });
  const contentItems = (contentLibrary as any)?.items || [];

  // Advanced AI analysis mutation
  const advancedAnalyzeMutation = useMutation({
    mutationFn: async (prospectId: string) => {
      const response = await fetch('/api/personalization/advanced-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId })
      });
      if (!response.ok) throw new Error('Failed to perform advanced analysis');
      return response.json();
    },
    onSuccess: (data) => {
      setAdvancedAnalysisData(data);
      setCurrentStep(2);
      toast({
        title: "Advanced Analysis Complete",
        description: `Personalization score: ${data.personalizationScore}/100 with ${data.variables?.length || 0} data points`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Advanced Analysis Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Start AI analysis mutation
  const analyzeProspectMutation = useMutation({
    mutationFn: async (prospectId: string) => {
      const response = await fetch('/api/personalization/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId })
      });
      if (!response.ok) throw new Error('Failed to analyze prospect');
      return response.json();
    },
    onSuccess: (data) => {
      setPersonalizationData(data);
      setCurrentStep(2);
      toast({
        title: "Analysis Complete",
        description: "AI has gathered comprehensive insights about your prospect"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Generate personalized email mutation
  const generateEmailMutation = useMutation({
    mutationFn: async (data: any) => {
      const MAX_RETRIES = 3;
      let lastEmail: any = null;
      let lastError: string | null = null;
      
      // Auto-retry logic: regenerate if validation fails
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        console.log(`📧 Email generation attempt ${attempt}/${MAX_RETRIES}`);
        
        const response = await fetch('/api/personalization/generate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to generate email');
        }
        
        const emailData = await response.json();
        lastEmail = emailData;
        
        // Check if email passes content library validation
        const hasContentLibrary = data.contentItemIds && data.contentItemIds.length > 0;
        if (hasContentLibrary) {
          if (!emailData.validationWarnings || emailData.validationWarnings.length === 0) {
            console.log(`✅ Email passed validation on attempt ${attempt}`);
            return emailData;
          } else {
            console.log(`❌ Attempt ${attempt} failed validation:`, emailData.validationWarnings);
            lastError = `Attempt ${attempt}: ${emailData.validationWarnings.join(', ')}`;
            
            if (attempt < MAX_RETRIES) {
              // Add slight delay before retry
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        } else {
          // No content library, accept the email
          return emailData;
        }
      }
      
      // All attempts failed validation
      if (lastError) {
        throw new Error(`Failed to generate compliant email after ${MAX_RETRIES} attempts. Please check your content library settings and try again.`);
      }
      
      // Fallback: return last email even if it has warnings
      return lastEmail;
    },
    onSuccess: (data) => {
      setGeneratedEmail(data);
      setCurrentStep(4);
      
      // Show success toast only if validation passed
      if (!data.validationWarnings || data.validationWarnings.length === 0) {
        toast({
          title: "✅ Email Generated Successfully",
          description: "Your personalized email follows all content library guidelines."
        });
      } else {
        toast({
          title: "Email Generated",
          description: "Your personalized email is ready for review"
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Simulate analysis progress for both modes
  useEffect(() => {
    if (currentStep === 1 && (analyzeProspectMutation.isPending || advancedAnalyzeMutation.isPending)) {
      const interval = setInterval(() => {
        setAnalysisProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + Math.random() * 15;
        });
      }, 300);
      return () => clearInterval(interval);
    }
  }, [currentStep, analyzeProspectMutation.isPending, advancedAnalyzeMutation.isPending]);

  const handleProspectSelect = () => {
    const prospectsToAnalyze = batchMode ? selectedProspectIds : [selectedProspectId];
    
    if (prospectsToAnalyze.length === 0 || (prospectsToAnalyze.length === 1 && !prospectsToAnalyze[0])) {
      toast({
        title: "No Prospects Selected",
        description: batchMode ? "Please select at least one prospect to continue." : "Please select a prospect to continue.",
        variant: "destructive"
      });
      return;
    }
    
    if (batchMode && prospectsToAnalyze.length > 10) {
      toast({
        title: "Too Many Prospects",
        description: "Please select maximum 10 prospects for batch processing.",
        variant: "destructive"
      });
      return;
    }
    
    setCurrentStep(1);
    setAnalysisProgress(0);
    
    // For now, analyze the first prospect (can be enhanced later for true batch processing)
    const prospectToAnalyze = prospectsToAnalyze[0];
    setSelectedProspectId(prospectToAnalyze); // Ensure single prospect ID is set for downstream processing
    
    // Use advanced analysis if enabled
    if (useAdvancedMode) {
      advancedAnalyzeMutation.mutate(prospectToAnalyze);
    } else {
      analyzeProspectMutation.mutate(prospectToAnalyze);
    }
  };

  const handleGenerateEmail = async () => {
    setCurrentStep(3);
    
    if (batchMode && selectedProspectIds.length > 1) {
      // Generate emails for all selected prospects - each with their own analysis
      const emailsMap = new Map();
      let successCount = 0;
      let failCount = 0;
      
      for (const prospectId of selectedProspectIds) {
        try {
          // First, analyze this specific prospect
          const analysisResponse = await fetch('/api/personalization/advanced-analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prospectId })
          });
          
          if (!analysisResponse.ok) {
            throw new Error(`Analysis failed for prospect ${prospectId}`);
          }
          
          const analysisData = await analysisResponse.json();
          
          // Then generate email using this prospect's specific analysis
          const emailResponse = await fetch('/api/personalization/generate-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prospectId,
              personalizationData: analysisData,
              settings: emailSettings,
              customPrompt,
              useAdvanced: true,
              contentItemIds: selectedContentIds
            })
          });
          
          if (emailResponse.ok) {
            const emailData = await emailResponse.json();
            emailsMap.set(prospectId, emailData);
            successCount++;
          } else {
            failCount++;
            const prospect = prospects.find((p: any) => p.id.toString() === prospectId);
            toast({
              variant: "destructive",
              title: "Email Generation Failed",
              description: `Failed to generate email for ${prospect?.firstName} ${prospect?.lastName}`
            });
          }
        } catch (error: any) {
          failCount++;
          const prospect = prospects.find((p: any) => p.id.toString() === prospectId);
          toast({
            variant: "destructive",
            title: "Processing Failed",
            description: `Error processing ${prospect?.firstName} ${prospect?.lastName}: ${error.message}`
          });
        }
      }
      
      if (successCount > 0) {
        setBatchGeneratedEmails(emailsMap);
        setActiveProspectTab(selectedProspectIds[0]);
        setCurrentStep(4);
        toast({
          title: "Batch Generation Complete",
          description: `Generated ${successCount} personalized email${successCount > 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}`
        });
      } else {
        toast({
          variant: "destructive",
          title: "Batch Generation Failed",
          description: "Failed to generate any emails. Please try again."
        });
      }
    } else {
      // Single prospect mode
      const dataToUse = advancedAnalysisData || personalizationData;
      if (!dataToUse) return;
      
      generateEmailMutation.mutate({
        prospectId: selectedProspectId,
        personalizationData: dataToUse,
        settings: emailSettings,
        customPrompt,
        useAdvanced: !!advancedAnalysisData,
        contentItemIds: selectedContentIds
      });
    }
  };

  const handleCompleteWizard = () => {
    if (generatedEmail && selectedProspectId && onComplete) {
      // Include prospect information with the generated email
      const emailWithProspect = {
        ...generatedEmail,
        prospectId: parseInt(selectedProspectId),
        prospect: (prospects as any[]).find((p: any) => p.id === parseInt(selectedProspectId))
      };
      
      onComplete(emailWithProspect);
      onClose();
      // Reset wizard state
      setCurrentStep(0);
      setSelectedProspectId('');
      setPersonalizationData(null);
      setGeneratedEmail(null);
      setCustomPrompt('');
      setAdvancedAnalysisData(null);
    }
  };

  const selectedProspect = selectedProspectId ? 
    (prospects as any[]).find((p: any) => p.id.toString() === selectedProspectId) : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col p-0" data-testid="dialog-personalization-wizard">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-purple-600" />
            Intelligent Email Personalization Wizard
          </DialogTitle>
          <DialogDescription>
            Use AI to analyze prospects and generate highly personalized emails based on their role, company, and industry context.
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b">
          <div className="flex items-center justify-center space-x-4 overflow-x-auto">
          {personalizationSteps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            
            return (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  isCompleted 
                    ? 'bg-green-100 dark:bg-green-900 border-green-500 text-green-700 dark:text-green-300' 
                    : isActive 
                    ? 'bg-purple-100 dark:bg-purple-900 border-purple-500 text-purple-700 dark:text-purple-300' 
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-500'
                }`}>
                  {isCompleted ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <span className={`ml-2 text-sm font-medium whitespace-nowrap ${
                  isActive ? 'text-purple-700 dark:text-purple-300' : isCompleted ? 'text-green-700 dark:text-green-300' : 'text-gray-500'
                }`}>
                  {step.title}
                </span>
                {index < personalizationSteps.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-gray-400 mx-4" />
                )}
              </div>
            );
          })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: Prospect Selection */}
          {currentStep === 0 && (
            <div className="space-y-6 max-h-full overflow-y-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Select Prospects for Personalization
                  </CardTitle>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="single-mode"
                        checked={!batchMode}
                        onChange={() => {
                          setBatchMode(false);
                          setSelectedProspectIds(selectedProspectId ? [selectedProspectId] : []);
                        }}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        data-testid="radio-single-mode"
                      />
                      <label htmlFor="single-mode" className="text-sm font-medium">Single Prospect</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="batch-mode"
                        checked={batchMode}
                        onChange={() => {
                          setBatchMode(true);
                          setSelectedProspectIds([]);
                          setSelectedProspectId('');
                        }}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        data-testid="radio-batch-mode"
                      />
                      <label htmlFor="batch-mode" className="text-sm font-medium">Multiple Prospects</label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Search Input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Search prospects by name, company, or job title..."
                        value={prospectSearchTerm}
                        onChange={(e) => setProspectSearchTerm(e.target.value)}
                        className="pl-10"
                        data-testid="input-search-prospects-personalization"
                      />
                    </div>
                    
                    {!batchMode ? (
                      // Single prospect selection
                      <Select value={selectedProspectId} onValueChange={(value) => {
                        setSelectedProspectId(value);
                        setSelectedProspectIds([value]);
                      }}>
                        <SelectTrigger data-testid="select-prospect">
                          <SelectValue placeholder="Choose a prospect to personalize email for..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.isArray(prospects) && prospects.map((prospect: any) => (
                            <SelectItem key={prospect.id} value={prospect.id.toString()}>
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                  {prospect.firstName?.[0]}{prospect.lastName?.[0]}
                                </div>
                                <div>
                                  <div className="font-medium">
                                    {prospect.fullName || `${prospect.firstName} ${prospect.lastName}`}
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    {prospect.jobTitle} at {prospect.companyName || 'Unknown Company'}
                                  </div>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      // Multiple prospect selection
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Select prospects (up to 10):</span>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const allIds = (prospects as any[]).slice(0, 10).map(p => p.id.toString());
                                setSelectedProspectIds(allIds);
                              }}
                              data-testid="button-select-all"
                            >
                              Select All
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setSelectedProspectIds([])}
                              data-testid="button-clear-all"
                            >
                              Clear All
                            </Button>
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto border rounded-lg p-2 space-y-1">
                          {Array.isArray(prospects) && prospects.map((prospect: any) => (
                            <div 
                              key={prospect.id}
                              className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
                                selectedProspectIds.includes(prospect.id.toString()) ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 border' : ''
                              }`}
                              onClick={() => {
                                const prospectId = prospect.id.toString();
                                if (selectedProspectIds.includes(prospectId)) {
                                  setSelectedProspectIds(selectedProspectIds.filter(id => id !== prospectId));
                                } else if (selectedProspectIds.length < 10) {
                                  setSelectedProspectIds([...selectedProspectIds, prospectId]);
                                }
                              }}
                              data-testid={`prospect-item-${prospect.id}`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedProspectIds.includes(prospect.id.toString())}
                                onChange={() => {}} // Handled by parent div onClick
                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                              />
                              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                {prospect.firstName?.[0]}{prospect.lastName?.[0]}
                              </div>
                              <div>
                                <div className="font-medium">
                                  {prospect.fullName || `${prospect.firstName} ${prospect.lastName}`}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  {prospect.jobTitle} at {prospect.companyName || 'Unknown Company'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {selectedProspectIds.length > 0 && (
                          <div className="text-sm text-purple-600 dark:text-purple-400 font-medium">
                            {selectedProspectIds.length} prospect{selectedProspectIds.length > 1 ? 's' : ''} selected
                          </div>
                        )}
                      </div>
                    )}

                    {selectedProspect && (
                      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border-blue-200 dark:border-blue-800">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
                              {selectedProspect.firstName?.[0]}{selectedProspect.lastName?.[0]}
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-lg">
                                {selectedProspect.fullName || `${selectedProspect.firstName} ${selectedProspect.lastName}`}
                              </h3>
                              <p className="text-gray-600 dark:text-gray-300">{selectedProspect.jobTitle}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {selectedProspect.companyName || 'Company information available'}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="space-y-4">
                      <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <div className="flex items-center space-x-3">
                          <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          <div>
                            <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Advanced Personalization Mode</span>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                              Uses LinkedIn profile analysis, company website scraping, and advanced AI scoring
                            </p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={useAdvancedMode}
                          onChange={(e) => setUseAdvancedMode(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          data-testid="checkbox-advanced-mode"
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button 
                          onClick={handleProspectSelect}
                          disabled={batchMode ? selectedProspectIds.length === 0 : !selectedProspectId}
                          className="bg-purple-600 hover:bg-purple-700"
                          data-testid="button-start-analysis"
                        >
                          <Brain className="h-4 w-4 mr-2" />
                          {batchMode 
                            ? `Analyze ${selectedProspectIds.length} Prospect${selectedProspectIds.length > 1 ? 's' : ''}`
                            : (useAdvancedMode ? 'Start Advanced Analysis' : 'Start AI Analysis')
                          }
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2: AI Analysis in Progress */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 animate-pulse text-purple-600" />
                    AI Analysis in Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                        <Brain className="h-8 w-8 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">
                        Analyzing {selectedProspect?.firstName} {selectedProspect?.lastName}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        Our AI is gathering comprehensive insights about your prospect...
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span>Analysis Progress</span>
                        <span>{Math.round(analysisProgress)}%</span>
                      </div>
                      <Progress value={analysisProgress} className="h-2" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Company Research
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Role Analysis
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Industry Insights
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-yellow-500 animate-spin" />
                        Personalization Factors
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 3: Smart Insights */}
          {currentStep === 2 && (personalizationData || advancedAnalysisData) && (
            <div className="space-y-6 max-h-full overflow-y-auto">
              {/* Advanced Analysis Results */}
              {advancedAnalysisData && (
                <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border-blue-200 dark:border-blue-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      Advanced Personalization Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {advancedAnalysisData.personalizationScore || 0}/100
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Personalization Score</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {advancedAnalysisData.variables?.length || 0}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Data Points</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {advancedAnalysisData.contentRecommendations?.length || 0}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Content Matches</div>
                      </div>
                    </div>

                    {/* Email Suggestions Preview */}
                    {advancedAnalysisData.emailSuggestions && (
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                        <h4 className="font-semibold mb-3 text-gray-800 dark:text-gray-200">AI Email Suggestions</h4>
                        <div className="space-y-3">
                          <div>
                            <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Subject Line</Label>
                            <p className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 p-2 rounded">
                              {advancedAnalysisData.emailSuggestions.subject}
                            </p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Opening</Label>
                            <p className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 p-2 rounded">
                              {advancedAnalysisData.emailSuggestions.opening}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Key Insights</h3>
                  <div className="space-y-4">
                    {advancedAnalysisData?.variables && (
                      <div>
                        <Label className="text-sm font-medium">Top Personalization Variables</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {advancedAnalysisData.variables.slice(0, 5).map((variable: any, index: number) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {variable.name}: {variable.value}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {personalizationData?.companyInsights && (
                      <div>
                        <Label className="text-sm font-medium">Company Focus</Label>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {personalizationData.companyInsights.industry} • {personalizationData.companyInsights.size}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end mt-6">
                    <Button 
                      onClick={() => setCurrentStep(3)}
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid="button-continue-to-email"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Continue to Email Generation
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 4: Generate Emails */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-600" />
                    Email Generation Settings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="tone">Tone</Label>
                      <Select value={emailSettings.tone} onValueChange={(value) => setEmailSettings({...emailSettings, tone: value})}>
                        <SelectTrigger id="tone" data-testid="select-tone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="friendly">Friendly</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="focus">Focus</Label>
                      <Select value={emailSettings.focus} onValueChange={(value) => setEmailSettings({...emailSettings, focus: value})}>
                        <SelectTrigger id="focus" data-testid="select-focus">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="value_proposition">Value Proposition</SelectItem>
                          <SelectItem value="problem_solving">Problem Solving</SelectItem>
                          <SelectItem value="relationship_building">Relationship Building</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="urgency">Urgency</Label>
                      <Select value={emailSettings.urgency} onValueChange={(value) => setEmailSettings({...emailSettings, urgency: value})}>
                        <SelectTrigger id="urgency" data-testid="select-urgency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="length">Length</Label>
                      <Select value={emailSettings.length} onValueChange={(value) => setEmailSettings({...emailSettings, length: value})}>
                        <SelectTrigger id="length" data-testid="select-length">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="short">Short (50-75 words)</SelectItem>
                          <SelectItem value="medium">Medium (100-150 words)</SelectItem>
                          <SelectItem value="long">Long (200+ words)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Label htmlFor="customPrompt">Custom Instructions (Optional)</Label>
                    <Textarea
                      id="customPrompt"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="Add any specific instructions for the AI..."
                      className="mt-2"
                      rows={3}
                      data-testid="textarea-custom-prompt"
                    />
                  </div>

                  {contentItems.length > 0 && (
                    <div className="mt-4">
                      <Label>Reference Content (Optional)</Label>
                      <p className="text-sm text-muted-foreground mb-2">Select content to include in email generation</p>
                      <ScrollArea className="h-32 border rounded-md p-2">
                        {contentItems.map((item: any) => (
                          <div key={item.id} className="flex items-center gap-2 py-1">
                            <input
                              type="checkbox"
                              id={`content-${item.id}`}
                              checked={selectedContentIds.includes(item.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedContentIds([...selectedContentIds, item.id]);
                                } else {
                                  setSelectedContentIds(selectedContentIds.filter(id => id !== item.id));
                                }
                              }}
                              data-testid={`checkbox-content-${item.id}`}
                            />
                            <label htmlFor={`content-${item.id}`} className="text-sm cursor-pointer flex-1">
                              {item.title} <span className="text-muted-foreground">({item.type})</span>
                            </label>
                          </div>
                        ))}
                      </ScrollArea>
                      {selectedContentIds.length > 0 && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {selectedContentIds.length} content item{selectedContentIds.length > 1 ? 's' : ''} selected
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end mt-6">
                    <Button 
                      onClick={handleGenerateEmail}
                      disabled={generateEmailMutation.isPending}
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid="button-generate-email"
                    >
                      {generateEmailMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate Personalized Email
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 5: Review & Send */}
          {currentStep === 4 && (batchMode && batchGeneratedEmails.size > 0 ? true : generatedEmail) && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-green-600" />
                    Review Generated Email{batchMode && batchGeneratedEmails.size > 1 ? 's' : ''}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {batchMode && batchGeneratedEmails.size > 1 ? (
                    <Tabs value={activeProspectTab} onValueChange={setActiveProspectTab}>
                      <TabsList className="mb-4">
                        {Array.from(batchGeneratedEmails.keys()).map((prospectId) => {
                          const prospect = prospects.find((p: any) => p.id.toString() === prospectId);
                          return (
                            <TabsTrigger key={prospectId} value={prospectId} data-testid={`tab-prospect-${prospectId}`}>
                              {prospect?.firstName} {prospect?.lastName}
                            </TabsTrigger>
                          );
                        })}
                      </TabsList>
                      {Array.from(batchGeneratedEmails.entries()).map(([prospectId, email]) => {
                        const prospect = prospects.find((p: any) => p.id.toString() === prospectId);
                        return (
                          <TabsContent key={prospectId} value={prospectId}>
                            <div className="space-y-4">
                              <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                                <p className="text-sm font-medium">
                                  Prospect: {prospect?.firstName} {prospect?.lastName} • {prospect?.jobTitle} at {prospect?.company}
                                </p>
                              </div>
                              
                              <div>
                                <Label className="text-sm font-medium">Subject Line</Label>
                                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border">
                                  <p className="font-medium">{email.subject || 'No subject generated'}</p>
                                </div>
                              </div>

                              <div>
                                <Label className="text-sm font-medium">Email Body</Label>
                                <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border whitespace-pre-wrap">
                                  {email.body || 'No email body generated'}
                                </div>
                              </div>

                              {email.personalizationScore && (
                                <div className="flex items-center gap-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                                  <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                  <div>
                                    <p className="text-sm font-medium">Personalization Score</p>
                                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                      {email.personalizationScore}/100
                                    </p>
                                  </div>
                                </div>
                              )}

                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    navigator.clipboard.writeText(email.body);
                                    toast({ title: "Copied to clipboard" });
                                  }}
                                  data-testid={`button-copy-email-${prospectId}`}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy Email
                                </Button>
                              </div>
                            </div>
                          </TabsContent>
                        );
                      })}
                    </Tabs>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Subject Line</Label>
                        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border">
                          <p className="font-medium">{generatedEmail?.subject || 'No subject generated'}</p>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Email Body</Label>
                        <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border whitespace-pre-wrap">
                          {generatedEmail?.body || 'No email body generated'}
                        </div>
                      </div>

                      {generatedEmail?.validationWarnings && generatedEmail.validationWarnings.length > 0 && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-300 dark:border-amber-700">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="font-semibold text-amber-900 dark:text-amber-100 mb-2">⚠️ Content Library Validation Issues</p>
                              <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                                This email doesn't follow your content library guidelines. Please regenerate or edit manually:
                              </p>
                              <ul className="text-sm space-y-1 list-none">
                                {generatedEmail.validationWarnings.map((warning: string, idx: number) => (
                                  <li key={idx} className="text-amber-700 dark:text-amber-300">{warning}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}

                      {generatedEmail?.personalizationScore && (
                        <div className="flex items-center gap-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                          <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          <div>
                            <p className="text-sm font-medium">Personalization Score</p>
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                              {generatedEmail.personalizationScore}/100
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentStep(3)}
                      data-testid="button-back-to-settings"
                    >
                      Back to Settings
                    </Button>
                    <div className="flex gap-2">
                      {!batchMode && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(generatedEmail.body);
                            toast({ title: "Copied to clipboard" });
                          }}
                          data-testid="button-copy-email"
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Email
                        </Button>
                      )}
                      <Button
                        onClick={handleCompleteWizard}
                        disabled={batchMode ? batchGeneratedEmails.size === 0 : (!generatedEmail || !selectedProspectId)}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid="button-complete"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Complete & Use Email{batchMode && batchGeneratedEmails.size > 1 ? 's' : ''}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
