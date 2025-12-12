import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@/lib/api";
import { Link } from "wouter";
import { 
  Users, MessageSquare, Zap, BarChart3, Settings, Plus, RefreshCw, 
  Sparkles, X, Trash2, Mail, Send, Eye, Target,
  Clock, TrendingUp, Play, Pause, ArrowLeft, FileText, WandIcon,
  Search, Filter, Grid3x3, List, MoreVertical, Copy, Edit2, MailOpen, Reply, Loader2
} from "lucide-react";
import { PersonalizationWizard } from "@/components/PersonalizationWizard";
import { AutomationModal } from "@/components/AutomationModal";

export default function SequencesPage() {
  const [match, params] = useRoute("/sequences/:id");
  const sequenceId = params?.id;

  if (match && sequenceId) {
    return <ProductionSequenceBuilder sequenceId={sequenceId} />;
  }

  return <SequencesList />;
}

// Pre-defined sequence templates
const SEQUENCE_TEMPLATES = [
  {
    id: 'cold-outreach',
    name: 'Cold Outreach',
    description: 'Classic 4-step cold outreach sequence for new prospects',
    icon: Mail,
    category: 'Sales',
    steps: [
      {
        subject: 'Quick question about {{companyName}}',
        body: '<p>Hi {{firstName}},</p><p>I noticed {{companyName}} is growing fast in the {{industry}} space. I wanted to reach out because we help companies like yours solve [specific problem].</p><p>Would you be open to a quick 15-minute call this week to explore how we can help?</p><p>Best regards</p>',
        delayDays: 0,
      },
      {
        subject: 'Following up - {{companyName}}',
        body: '<p>Hi {{firstName}},</p><p>I wanted to follow up on my previous email. I understand you\'re busy, so I\'ll keep this brief.</p><p>We\'ve helped similar companies in {{industry}} achieve [specific result]. I think we could do the same for {{companyName}}.</p><p>Are you available for a quick chat this week?</p><p>Thanks!</p>',
        delayDays: 3,
      },
      {
        subject: 'Thought you might find this helpful',
        body: '<p>Hi {{firstName}},</p><p>I came across this case study that reminded me of {{companyName}}. [Company X] faced similar challenges and saw [specific results] after implementing our solution.</p><p>I thought this might be relevant to your goals. Would you like to discuss how we can help {{companyName}} achieve similar results?</p><p>Let me know!</p>',
        delayDays: 5,
      },
      {
        subject: 'Should I close your file?',
        body: '<p>Hi {{firstName}},</p><p>I haven\'t heard back from you, so I\'m assuming this isn\'t a priority right now. I\'ll go ahead and close your file.</p><p>If I\'m wrong and you\'d still like to explore how we can help {{companyName}}, just reply to this email and I\'ll reopen it.</p><p>All the best!</p>',
        delayDays: 7,
      },
    ],
  },
  {
    id: 'product-launch',
    name: 'Product Launch',
    description: '3-step sequence for announcing new products or features',
    icon: Sparkles,
    category: 'Marketing',
    steps: [
      {
        subject: 'Exciting news for {{companyName}}!',
        body: '<p>Hi {{firstName}},</p><p>I\'m excited to share that we just launched [Product Name], designed specifically for companies like {{companyName}} in the {{industry}} space.</p><p>[Product Name] helps you [key benefit] without [common pain point].</p><p>I\'d love to give you an exclusive early access demo. Are you available this week?</p><p>Cheers!</p>',
        delayDays: 0,
      },
      {
        subject: 'Early access demo for {{companyName}}',
        body: '<p>Hi {{firstName}},</p><p>Just wanted to make sure you saw my email about [Product Name]. We\'re offering early access to select companies, and I thought {{companyName}} would be a perfect fit.</p><p>The demo only takes 20 minutes, and I think you\'ll love what you see.</p><p>Can I book you in for this week?</p><p>Thanks!</p>',
        delayDays: 4,
      },
      {
        subject: 'Last chance for early access',
        body: '<p>Hi {{firstName}},</p><p>We\'re closing early access registration soon, and I didn\'t want {{companyName}} to miss out.</p><p>Companies that have seen the demo are already seeing [specific results]. I\'d hate for you to miss this opportunity.</p><p>Let me know if you\'d like to jump on a quick call!</p><p>Best,</p>',
        delayDays: 6,
      },
    ],
  },
  {
    id: 'follow-up',
    name: 'Follow-up Sequence',
    description: 'Gentle 3-step follow-up for warm leads',
    icon: Reply,
    category: 'Sales',
    steps: [
      {
        subject: 'Following up from our conversation',
        body: '<p>Hi {{firstName}},</p><p>It was great speaking with you about {{companyName}}\'s goals. As promised, I\'m sending over some additional information that might be helpful.</p><p>[Attach relevant resources or links]</p><p>Let me know if you have any questions, or if you\'d like to schedule a follow-up call.</p><p>Thanks!</p>',
        delayDays: 0,
      },
      {
        subject: 'Checking in - {{companyName}}',
        body: '<p>Hi {{firstName}},</p><p>I wanted to check in and see if you had a chance to review the information I sent over.</p><p>I\'m happy to answer any questions or set up a time to discuss next steps.</p><p>Looking forward to hearing from you!</p>',
        delayDays: 4,
      },
      {
        subject: 'Any questions about what we discussed?',
        body: '<p>Hi {{firstName}},</p><p>I haven\'t heard back, so I wanted to make sure everything is clear on your end.</p><p>If you need more information or would like to explore this further, just let me know. Otherwise, I\'ll follow up in a few weeks.</p><p>Thanks for your time!</p>',
        delayDays: 6,
      },
    ],
  },
  {
    id: 'reengagement',
    name: 'Re-engagement',
    description: '2-step sequence to re-engage inactive prospects',
    icon: RefreshCw,
    category: 'Sales',
    steps: [
      {
        subject: 'Are you still interested in [solution]?',
        body: '<p>Hi {{firstName}},</p><p>We spoke a while back about how we could help {{companyName}} with [specific challenge]. I wanted to reach out and see if this is still a priority for you.</p><p>A lot has changed since we last spoke - we\'ve added [new features/results] that I think would be really valuable for {{companyName}}.</p><p>Would you like to reconnect for a quick call?</p><p>Best,</p>',
        delayDays: 0,
      },
      {
        subject: 'Last check-in for {{companyName}}',
        body: '<p>Hi {{firstName}},</p><p>I understand priorities change, so this will be my last email unless I hear back from you.</p><p>If you\'re still interested in [solution], I\'d be happy to reconnect. Otherwise, I wish you and {{companyName}} all the best!</p><p>Thanks,</p>',
        delayDays: 5,
      },
    ],
  },
];

function SequencesList() {
  const { data: sequences, isLoading } = useQuery({
    queryKey: ["/api/sequences"],
  });
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const sequencesList = Array.isArray(sequences) ? sequences : [];

  // Filter and search sequences
  const filteredSequences = sequencesList.filter((seq: any) => {
    const matchesSearch = seq.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (seq.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || seq.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Sequences</h1>
              <p className="text-gray-500 dark:text-gray-400">Create and manage email sequences</p>
            </div>
          </div>
          <CreateSequenceButton />
        </div>

        {/* Toolbar */}
        {sequencesList.length > 0 && (
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-3 flex-1 max-w-2xl w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search sequences..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-sequences"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="filter-status">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* View Toggle */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                data-testid="view-grid"
              >
                <Grid3x3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                data-testid="view-list"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-16">Loading sequences...</div>
        ) : filteredSequences.length === 0 && sequencesList.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No sequences yet</h3>
              <p className="text-gray-500 mb-6">Create your first email sequence to get started</p>
              <CreateSequenceButton />
            </CardContent>
          </Card>
        ) : filteredSequences.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No sequences found</h3>
              <p className="text-gray-500">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSequences.map((sequence: any) => (
              <EnhancedSequenceCard key={sequence.id} sequence={sequence} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSequences.map((sequence: any) => (
              <SequenceListItem key={sequence.id} sequence={sequence} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateSequenceButton() {
  const [showMethodSelector, setShowMethodSelector] = useState(false);
  const [creationMethod, setCreationMethod] = useState<'scratch' | 'template' | 'ai' | 'auto-ai' | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/sequences", data);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "Sequence created successfully" });
      setShowMethodSelector(false);
      setCreationMethod(null);
      setName("");
      setDescription("");
      // Navigate to the newly created sequence builder
      if (data?.id) {
        setLocation(`/sequences/${data.id}`);
      }
    },
    onError: () => {
      toast({ title: "Failed to create sequence", variant: "destructive" });
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: async (data: { prompt: string; name: string; method: 'ai' | 'auto-ai' }) => {
      const res = await apiRequest("POST", "/api/sequences/generate-with-ai", data);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "AI-powered sequence created successfully" });
      setShowMethodSelector(false);
      setCreationMethod(null);
      setName("");
      setDescription("");
      setAiPrompt("");
      // Navigate to the newly created sequence builder
      if (data?.sequence?.id) {
        setLocation(`/sequences/${data.sequence.id}`);
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to generate sequence", 
        description: error?.message || "Please try again",
        variant: "destructive" 
      });
    },
  });

  const handleMethodSelect = (method: 'scratch' | 'template' | 'ai' | 'auto-ai') => {
    setCreationMethod(method);
  };

  const handleBackToMethods = () => {
    setCreationMethod(null);
    setSelectedTemplate(null);
    setAiPrompt("");
  };

  return (
    <>
      <Button onClick={() => setShowMethodSelector(true)} data-testid="button-new-sequence">
        <Plus className="w-4 h-4 mr-2" />
        New Sequence
      </Button>

      <Dialog open={showMethodSelector} onOpenChange={(open) => {
        setShowMethodSelector(open);
        if (!open) {
          setCreationMethod(null);
          setName("");
          setDescription("");
        }
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create Sequence</DialogTitle>
          </DialogHeader>

          {!creationMethod ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">How do you want to create your sequence?</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card 
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleMethodSelect('scratch')}
                  data-testid="method-scratch"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Create from Scratch</CardTitle>
                        <CardDescription>Create a sequence manually by yourself</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <Card 
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleMethodSelect('template')}
                  data-testid="method-template"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                        <Mail className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Choose from Template Library</CardTitle>
                        <CardDescription>Browse professional email sequence templates for instant use</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <Card 
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleMethodSelect('ai')}
                  data-testid="method-ai"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Generate with AI</CardTitle>
                        <CardDescription>Write a prompt and let AI create your email</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <Card 
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleMethodSelect('auto-ai')}
                  data-testid="method-auto-ai"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                        <Zap className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Auto Create with AI</CardTitle>
                        <CardDescription>Automatically generate best sequence using AI powered by ChatGPT</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </div>
            </div>
          ) : creationMethod === 'scratch' ? (
            <div className="space-y-4">
              <Button variant="ghost" onClick={handleBackToMethods} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Methods
              </Button>
              
              <div className="space-y-4">
                <div>
                  <Label>Sequence Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="New Sequence"
                    data-testid="input-sequence-name"
                  />
                </div>
                <div>
                  <Label>Description (Optional)</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Created from scratch"
                    data-testid="input-sequence-description"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      if (name.trim()) {
                        createMutation.mutate({ name, description });
                      }
                    }}
                    disabled={!name.trim() || createMutation.isPending}
                    data-testid="button-create-sequence"
                  >
                    {createMutation.isPending ? "Creating..." : "Create Sequence"}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setShowMethodSelector(false);
                    setCreationMethod(null);
                    setName("");
                    setDescription("");
                  }} data-testid="button-cancel">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : creationMethod === 'template' ? (
            <div className="space-y-4">
              <Button variant="ghost" onClick={handleBackToMethods} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Methods
              </Button>
              
              <div>
                <h3 className="text-lg font-semibold mb-4">Choose a Template</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                  {SEQUENCE_TEMPLATES.map((template) => {
                    const IconComponent = template.icon;
                    return (
                      <Card
                        key={template.id}
                        className={`cursor-pointer transition-colors ${
                          selectedTemplate === template.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-primary/50'
                        }`}
                        onClick={() => {
                          setSelectedTemplate(template.id);
                          setName(template.name);
                          setDescription(template.description);
                        }}
                        data-testid={`template-${template.id}`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                              <IconComponent className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base">{template.name}</CardTitle>
                              <CardDescription className="text-sm mt-1">{template.description}</CardDescription>
                              <div className="mt-2 flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">{template.category}</Badge>
                                <span className="text-xs text-muted-foreground">{template.steps.length} steps</span>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {selectedTemplate && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <Label>Sequence Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Sequence name"
                      data-testid="input-template-name"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        if (!name.trim() || !selectedTemplate) return;
                        
                        const template = SEQUENCE_TEMPLATES.find(t => t.id === selectedTemplate);
                        if (!template) return;

                        try {
                          // Create sequence
                          const res = await apiRequest("POST", "/api/sequences", {
                            name,
                            description: template.description,
                          });
                          const sequence = await res.json();

                          // Add template steps
                          for (const step of template.steps) {
                            await apiRequest("POST", `/api/sequences/${sequence.id}/steps`, step);
                          }

                          queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
                          toast({ title: "Sequence created from template successfully" });
                          setShowMethodSelector(false);
                          setCreationMethod(null);
                          setName("");
                          setDescription("");
                          setSelectedTemplate(null);
                          setLocation(`/sequences/${sequence.id}`);
                        } catch (error) {
                          toast({
                            title: "Failed to create sequence",
                            variant: "destructive"
                          });
                        }
                      }}
                      disabled={!name.trim() || !selectedTemplate}
                      data-testid="button-create-from-template"
                    >
                      Create from Template
                    </Button>
                    <Button variant="outline" onClick={handleBackToMethods}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : creationMethod === 'ai' ? (
            <div className="space-y-4">
              <Button variant="ghost" onClick={handleBackToMethods} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Methods
              </Button>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Generate with AI</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Describe the email you want to create, and AI will generate it for you
                  </p>
                </div>

                <div>
                  <Label>Sequence Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Product Demo Outreach"
                    data-testid="input-ai-name"
                  />
                </div>

                <div>
                  <Label>Describe your email</Label>
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g., Write a friendly outreach email to software engineers at mid-sized tech companies, introducing our new API product that helps with authentication. Keep it under 100 words and include a clear call-to-action to book a demo."
                    rows={6}
                    data-testid="input-ai-prompt"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Tip: Be specific about tone, target audience, and what action you want recipients to take
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      if (name.trim() && aiPrompt.trim()) {
                        aiGenerateMutation.mutate({
                          name,
                          prompt: aiPrompt,
                          method: 'ai'
                        });
                      }
                    }}
                    disabled={!name.trim() || !aiPrompt.trim() || aiGenerateMutation.isPending}
                    data-testid="button-generate-ai"
                  >
                    {aiGenerateMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Email
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleBackToMethods}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" onClick={handleBackToMethods} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Methods
              </Button>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Auto Create with AI</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    AI will automatically generate a complete multi-step outreach sequence for you
                  </p>
                </div>

                <div>
                  <Label>Sequence Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., SaaS Product Launch Campaign"
                    data-testid="input-auto-ai-name"
                  />
                </div>

                <div>
                  <Label>Describe your campaign</Label>
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g., Create a 4-step cold outreach sequence for CTOs at enterprise companies in the healthcare industry. We're launching a HIPAA-compliant data analytics platform. Tone should be professional yet approachable."
                    rows={6}
                    data-testid="input-auto-ai-prompt"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Tip: Include target audience, product/service, industry, desired tone, and any specific requirements
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">AI will generate:</p>
                      <ul className="text-blue-700 dark:text-blue-300 space-y-1">
                        <li>• Initial outreach email (sent immediately)</li>
                        <li>• Follow-up email (2-3 days later)</li>
                        <li>• Value-add email (4-5 days later)</li>
                        <li>• Break-up email (final touchpoint)</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      if (name.trim() && aiPrompt.trim()) {
                        aiGenerateMutation.mutate({
                          name,
                          prompt: aiPrompt,
                          method: 'auto-ai'
                        });
                      }
                    }}
                    disabled={!name.trim() || !aiPrompt.trim() || aiGenerateMutation.isPending}
                    data-testid="button-generate-auto-ai"
                  >
                    {aiGenerateMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating Sequence...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Auto Create Sequence
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleBackToMethods}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function EnhancedSequenceCard({ sequence }: { sequence: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  
  // Calculate metrics
  const emailCount = sequence.steps?.length || 0;
  const totalProspects = sequence.totalProspects || 0;
  const sentCount = sequence.sentCount || 0;
  const openedCount = sequence.openedCount || 0;
  const repliedCount = sequence.repliedCount || 0;
  const openRate = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;
  const replyRate = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0;
  
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/sequences/${sequence.id}`, undefined);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "Sequence deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete sequence", variant: "destructive" });
    },
  });
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 border-green-200';
      case 'paused': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'completed': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <>
      <Card className="group hover:shadow-xl transition-all duration-200 cursor-pointer relative overflow-hidden" onClick={() => setLocation(`/sequences/${sequence.id}`)} data-testid={`card-sequence-${sequence.id}`}>
        {sequence.status === 'active' && (
          <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-green-500 to-emerald-500"></div>
        )}
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold truncate">{sequence.name}</CardTitle>
            {sequence.description && (
              <CardDescription className="mt-1 line-clamp-2">{sequence.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${getStatusColor(sequence.status)}`} data-testid={`badge-status-${sequence.id}`}>
              {sequence.status}
            </Badge>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setShowAutomationModal(true);
              }}
              data-testid={`button-automation-${sequence.id}`}
              title="Run Automation"
            >
              <Zap className="h-4 w-4 text-blue-500" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-delete-${sequence.id}`}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Sequence</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{sequence.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-gray-500">Emails</span>
            </div>
            <div className="text-2xl font-bold">{emailCount}</div>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-gray-500">Prospects</span>
            </div>
            <div className="text-2xl font-bold">{totalProspects}</div>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <MailOpen className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-500">Open Rate</span>
            </div>
            <div className="text-2xl font-bold">{openRate}%</div>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Reply className="w-4 h-4 text-orange-500" />
              <span className="text-xs text-gray-500">Reply Rate</span>
            </div>
            <div className="text-2xl font-bold">{replyRate}%</div>
          </div>
        </div>

        {/* Progress indicator for active sequences */}
        {sequence.status === 'active' && totalProspects > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-600">
              <span>{sentCount} sent</span>
              <span>{totalProspects - sentCount} remaining</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-green-500 h-full transition-all duration-500"
                style={{ width: `${totalProspects > 0 ? (sentCount / totalProspects) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs text-gray-500">
            {sequence.createdAt ? `Created ${new Date(sequence.createdAt).toLocaleDateString()}` : 'Recently created'}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              setLocation(`/sequences/${sequence.id}`);
            }}
          >
            View Details →
          </Button>
        </div>
      </CardContent>
      </Card>
      
      {showAutomationModal && (
        <AutomationModal
          sequenceId={sequence.id}
          sequenceName={sequence.name}
          open={showAutomationModal}
          onClose={() => setShowAutomationModal(false)}
        />
      )}
    </>
  );
}

function SequenceListItem({ sequence }: { sequence: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  
  const emailCount = sequence.steps?.length || 0;
  const totalProspects = sequence.totalProspects || 0;
  const sentCount = sequence.sentCount || 0;
  const openedCount = sequence.openedCount || 0;
  const repliedCount = sequence.repliedCount || 0;
  const openRate = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;
  const replyRate = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0;
  
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/sequences/${sequence.id}`, undefined);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "Sequence deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete sequence", variant: "destructive" });
    },
  });
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 border-green-200';
      case 'paused': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'completed': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <>
      <Card className="group hover:shadow-lg transition-all cursor-pointer" onClick={() => setLocation(`/sequences/${sequence.id}`)} data-testid={`list-item-${sequence.id}`}>
        <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Name & Description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-semibold truncate">{sequence.name}</h3>
              <Badge className={getStatusColor(sequence.status)}>
                {sequence.status}
              </Badge>
            </div>
            {sequence.description && (
              <p className="text-sm text-gray-500 truncate">{sequence.description}</p>
            )}
          </div>

          {/* Metrics */}
          <div className="hidden md:flex items-center gap-6 text-sm">
            <div className="text-center">
              <div className="font-semibold">{emailCount}</div>
              <div className="text-xs text-gray-500">Emails</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{totalProspects}</div>
              <div className="text-xs text-gray-500">Prospects</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{sentCount}</div>
              <div className="text-xs text-gray-500">Sent</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{openRate}%</div>
              <div className="text-xs text-gray-500">Opens</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{replyRate}%</div>
              <div className="text-xs text-gray-500">Replies</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setLocation(`/sequences/${sequence.id}`);
              }}
            >
              Open →
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                setShowAutomationModal(true);
              }}
              data-testid={`button-automation-list-${sequence.id}`}
              title="Run Automation"
            >
              <Zap className="h-4 w-4 text-blue-500" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-delete-list-${sequence.id}`}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Sequence</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{sequence.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
      </Card>
      
      {showAutomationModal && (
        <AutomationModal
          sequenceId={sequence.id}
          sequenceName={sequence.name}
          open={showAutomationModal}
          onClose={() => setShowAutomationModal(false)}
        />
      )}
    </>
  );
}

function ProductionSequenceBuilder({ sequenceId }: { sequenceId: string }) {
  const [activeTab, setActiveTab] = useState('sequence');
  const [sequenceName, setSequenceName] = useState('');
  const [sequenceDescription, setSequenceDescription] = useState('');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sequence, isLoading: sequenceLoading } = useQuery({
    queryKey: ['/api/sequences', sequenceId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}`, undefined);
      return await res.json();
    },
  });

  const { data: prospectsData, isLoading: prospectsLoading } = useQuery({
    queryKey: ['/api/sequences', sequenceId, 'prospects'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/prospects`, undefined);
      return await res.json();
    },
    enabled: activeTab === 'prospects' || activeTab === 'ai-followup', // Only load when needed
  });

  const { data: repliesData } = useQuery({
    queryKey: ['/api/sequences', sequenceId, 'replies'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/replies`, undefined);
      return await res.json();
    },
    refetchInterval: activeTab === 'replies' ? 30000 : false, // Only poll when on Replies tab
    enabled: activeTab === 'replies', // Only load when Replies tab is active
  });

  const updateSequenceMutation = useMutation({
    mutationFn: async (data: { name?: string; description?: string }) => {
      return await apiRequest("PATCH", `/api/sequences/${sequenceId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      toast({ title: "Sequence updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update sequence", variant: "destructive" });
    }
  });

  // Initialize name and description from loaded sequence
  useEffect(() => {
    if (sequence) {
      setSequenceName(sequence.name || '');
      setSequenceDescription(sequence.description || '');
    }
  }, [sequence?.id]);

  if (sequenceLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="h-12 bg-gray-200 rounded w-full mb-4"></div>
        </div>
      </div>
    );
  }

  const handleSaveSequence = () => {
    updateSequenceMutation.mutate({
      name: sequenceName,
      description: sequenceDescription
    });
  };

  const tabs = [
    { id: 'sequence', label: 'Sequence', icon: Mail },
    { id: 'prospects', label: 'Prospects', icon: Users },
    { id: 'replies', label: 'Replies', icon: MessageSquare },
    { id: 'ai-followup', label: 'AI Follow-up', icon: Zap },
    { id: 'tracking', label: 'Email Tracking', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const handleClose = () => {
    setLocation('/sequences');
  };

  return (
    <div className="min-h-screen bg-background">
      <Dialog open={true} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-6xl h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
            <DialogTitle className="text-xl font-semibold">Sequence Builder</DialogTitle>
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-4 top-4"
              onClick={handleClose}
              data-testid="button-close-builder"
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <div className="border-b px-6 flex-shrink-0">
              <TabsList className="w-full justify-start h-auto p-0 bg-transparent">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="flex items-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                      data-testid={`tab-${tab.id}`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <TabsContent value="sequence" className="m-0 p-6">
                <SequenceTab 
                  sequenceId={sequenceId} 
                  steps={sequence?.steps || []}
                  name={sequenceName}
                  setName={setSequenceName}
                  description={sequenceDescription}
                  setDescription={setSequenceDescription}
                />
              </TabsContent>

              <TabsContent value="prospects" className="m-0 p-6">
                <ProspectsTab 
                  sequenceId={sequenceId} 
                  prospects={prospectsData?.prospects || []} 
                  isLoading={prospectsLoading}
                />
              </TabsContent>

              <TabsContent value="replies" className="m-0 p-6">
                <RepliesTab sequenceId={sequenceId} replies={repliesData?.replies || []} />
              </TabsContent>

              <TabsContent value="ai-followup" className="m-0 p-6">
                <AIFollowupTab sequenceId={sequenceId} />
              </TabsContent>

              <TabsContent value="tracking" className="m-0 p-6">
                <TrackingTab sequenceId={sequenceId} />
              </TabsContent>

              <TabsContent value="settings" className="m-0 p-6">
                <SettingsTab sequenceId={sequenceId} sequence={sequence} />
              </TabsContent>
            </div>

            <div className="border-t px-6 py-4 flex items-center justify-between bg-muted/30 flex-shrink-0">
              <span className="text-sm text-muted-foreground">
                {sequence?.steps?.length || 0} steps in sequence • {prospectsData?.prospects?.length || 0} prospects enrolled
              </span>
              <div className="flex gap-2">
                <Link href="/sequences">
                  <Button variant="outline" data-testid="button-cancel">
                    Cancel
                  </Button>
                </Link>
                <Button 
                  onClick={handleSaveSequence}
                  disabled={updateSequenceMutation.isPending}
                  data-testid="button-save-sequence"
                >
                  {updateSequenceMutation.isPending ? "Saving..." : "Save Sequence"}
                </Button>
                <ActivateSequenceButton 
                  sequenceId={sequenceId} 
                  currentStatus={sequence?.status} 
                  hasSteps={(sequence?.steps?.length || 0) > 0}
                  hasProspects={(prospectsData?.prospects?.length || 0) > 0}
                />
              </div>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SequenceTab({ 
  sequenceId, 
  steps, 
  name, 
  setName, 
  description, 
  setDescription 
}: { 
  sequenceId: string; 
  steps: any[];
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (desc: string) => void;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStep, setEditingStep] = useState<any>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editDelayDays, setEditDelayDays] = useState("0");
  const [showAIPersonalization, setShowAIPersonalization] = useState(false);
  const [showAITemplate, setShowAITemplate] = useState(false);
  const [subject, setSubject] = useState("");
  const [manualSubject, setManualSubject] = useState("");
  const [body, setBody] = useState("");
  const [delayDays, setDelayDays] = useState("0");
  const [usePreviousSubject, setUsePreviousSubject] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const addStepMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/sequences/${sequenceId}/steps`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      setShowAddModal(false);
      setSubject("");
      setManualSubject("");
      setBody("");
      setDelayDays("0");
      setUsePreviousSubject(false);
      toast({ title: "Success", description: "Email step added successfully" });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const res = await apiRequest("DELETE", `/api/sequences/${sequenceId}/steps/${stepId}`, undefined);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      toast({ title: "Step deleted successfully" });
    },
  });

  const updateStepMutation = useMutation({
    mutationFn: async ({ stepId, data }: { stepId: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/sequences/${sequenceId}/steps/${stepId}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      setShowEditModal(false);
      setEditingStep(null);
      toast({ title: "Step updated successfully" });
    },
  });

  const openEditModal = (step: any) => {
    setEditingStep(step);
    setEditSubject(step.subject);
    setEditBody(step.body);
    setEditDelayDays(String(step.delayDays || 0));
    setShowEditModal(true);
  };

  const handleUseAIEmail = (generatedEmail: { subject: string; body: string }) => {
    setSubject(generatedEmail.subject);
    setBody(generatedEmail.body);
    setShowAIPersonalization(false);
  };

  return (
    <div className="space-y-6">
      {/* Sequence Name and Description */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sequence-name">Sequence Name</Label>
          <Input
            id="sequence-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New Sequence"
            data-testid="input-sequence-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sequence-description">Description (Optional)</Label>
          <Input
            id="sequence-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Created from scratch"
            data-testid="input-sequence-description"
          />
        </div>
      </div>

      {/* Email Steps Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Email Steps</h3>
            <p className="text-sm text-muted-foreground">Create unlimited steps for your sequence</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowAIPersonalization(true)}
              data-testid="button-ai-personalization-header"
            >
              <WandIcon className="w-4 h-4 mr-2" />
              AI Personalization
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowAITemplate(true)}
              data-testid="button-ai-template-header"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              AI Template
            </Button>
            {steps.length > 0 && (
              <Button 
                size="sm"
                onClick={() => setShowAddModal(true)}
                data-testid="button-add-step-header"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Step
              </Button>
            )}
          </div>
        </div>

        <div className="border-2 border-dashed rounded-lg p-12">
          {steps.length === 0 ? (
            <div className="text-center">
              <Mail className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No email steps yet</h3>
              <p className="text-muted-foreground mb-6">
                Create unlimited steps for your sequence - add as many as you need!
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => setShowAddModal(true)} data-testid="button-add-first-step">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Step
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setShowAIPersonalization(true)}
                  data-testid="button-ai-personalization-empty"
                >
                  <WandIcon className="w-4 h-4 mr-2" />
                  AI Personalization
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setShowAITemplate(true)}
                  data-testid="button-ai-template-empty"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  AI Template
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {steps.map((step: any, index: number) => (
                <Card key={step.id} className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge>Step {index + 1}</Badge>
                          {step.delayDays > 0 && (
                            <Badge variant="outline">
                              <Clock className="w-3 h-3 mr-1" />
                              Wait {step.delayDays} day{step.delayDays > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        <h4 className="font-semibold text-lg">{step.subject}</h4>
                        <p className="text-muted-foreground text-sm mt-2 line-clamp-2">{step.body}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(step)}
                          data-testid={`button-edit-step-${step.id}`}
                        >
                          <Edit2 className="w-4 h-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteStepMutation.mutate(step.id)}
                          data-testid={`button-delete-step-${step.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Email Step</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="use-previous-subject"
                  checked={usePreviousSubject}
                  onCheckedChange={(checked) => {
                    setUsePreviousSubject(checked === true);
                    if (checked && steps.length > 0) {
                      setManualSubject(subject);
                      const lastStep = steps[steps.length - 1];
                      setSubject(`Re: ${lastStep.subject}`);
                    } else {
                      setSubject(manualSubject);
                    }
                  }}
                  disabled={steps.length === 0}
                  data-testid="checkbox-use-previous-subject"
                />
                <Label 
                  htmlFor="use-previous-subject"
                  className="text-sm font-normal cursor-pointer"
                >
                  Use previous step's subject line (for threading replies)
                  {steps.length === 0 && <span className="text-muted-foreground ml-1">(Add first step to enable)</span>}
                </Label>
              </div>
              
              <div>
                <Label>Subject Line</Label>
                <Input
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    if (!usePreviousSubject) {
                      setManualSubject(e.target.value);
                    }
                  }}
                  placeholder={usePreviousSubject && steps.length > 0 ? `Re: ${steps[steps.length - 1].subject}` : "Enter email subject..."}
                  disabled={usePreviousSubject}
                  data-testid="input-step-subject"
                />
                {usePreviousSubject && steps.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    ✓ Will use: "Re: {steps[steps.length - 1].subject}"
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label>Email Body</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Enter email content..."
                rows={10}
                data-testid="input-step-body"
              />
            </div>
            <div>
              <Label>Delay (days after previous step)</Label>
              <Input
                type="number"
                value={delayDays}
                onChange={(e) => setDelayDays(e.target.value)}
                min="0"
                data-testid="input-step-delay"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (body.trim() && subject.trim()) {
                    addStepMutation.mutate({
                      subject: subject,
                      body,
                      delayDays: parseInt(delayDays) || 0
                    });
                  }
                }}
                disabled={!body.trim() || !subject.trim() || addStepMutation.isPending}
                data-testid="button-save-step"
              >
                {addStepMutation.isPending ? "Adding..." : "Add Step"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Step Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Email Step</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subject Line</Label>
              <Input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Enter email subject..."
                data-testid="input-edit-step-subject"
              />
            </div>
            <div>
              <Label>Email Body</Label>
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Enter email content..."
                rows={10}
                data-testid="input-edit-step-body"
              />
            </div>
            <div>
              <Label>Delay (days after previous step)</Label>
              <Input
                type="number"
                value={editDelayDays}
                onChange={(e) => setEditDelayDays(e.target.value)}
                min="0"
                data-testid="input-edit-step-delay"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (editingStep && editBody.trim() && editSubject.trim()) {
                    updateStepMutation.mutate({
                      stepId: editingStep.id,
                      data: {
                        subject: editSubject,
                        body: editBody,
                        delayDays: parseInt(editDelayDays) || 0
                      }
                    });
                  }
                }}
                disabled={!editBody.trim() || !editSubject.trim() || updateStepMutation.isPending}
                data-testid="button-update-step"
              >
                {updateStepMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PersonalizationWizard 
        open={showAIPersonalization}
        onClose={() => setShowAIPersonalization(false)}
        onComplete={async (emailData) => {
          // Handle batch mode (array of emails)
          if (Array.isArray(emailData)) {
            try {
              // Save all personalized emails to database
              const saveResponse = await apiRequest("POST", "/api/personalization/save-batch", {
                emails: emailData,
                sequenceId
              });
              const saveResult = await saveResponse.json() as { savedCount: number; errorCount: number };
              
              setShowAIPersonalization(false);
              
              // Auto-enroll all prospects in the sequence
              const prospectIds = emailData
                .filter(e => e.prospectId)
                .map(e => e.prospectId.toString());
              
              if (prospectIds.length > 0 && sequenceId) {
                try {
                  await apiRequest("POST", `/api/sequences/${sequenceId}/prospects`, { 
                    prospectIds 
                  });
                  
                  queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId, 'prospects'] });
                  
                  toast({
                    title: "Batch Personalization Complete",
                    description: `${saveResult.savedCount} personalized emails saved and ${prospectIds.length} prospects enrolled in sequence`
                  });
                } catch (enrollError) {
                  console.error("Failed to auto-enroll prospects:", enrollError);
                  toast({
                    title: "Emails Saved",
                    description: `${saveResult.savedCount} personalized emails saved. Auto-enrollment failed - please enroll prospects manually.`,
                    variant: "default"
                  });
                }
              } else {
                toast({
                  title: "Personalized Emails Saved",
                  description: `${saveResult.savedCount} personalized emails have been saved for these prospects.`
                });
              }
            } catch (error) {
              console.error("Failed to save batch personalized emails:", error);
              toast({
                title: "Save Failed",
                description: "Could not save personalized emails. Please try again.",
                variant: "destructive"
              });
            }
            return;
          }
          
          // Handle single email mode (existing behavior)
          const email = emailData;
          if (email && email.subject && email.body) {
            setSubject(email.subject);
            setBody(email.body);
            setShowAIPersonalization(false);
            
            // Automatically save the step to the sequence
            addStepMutation.mutate({
              subject: email.subject,
              body: email.body,
              delayDays: parseInt(delayDays) || 0
            });

            // Auto-enroll the prospect in the sequence
            if (email.prospectId && sequenceId) {
              try {
                await apiRequest("POST", `/api/sequences/${sequenceId}/prospects`, { 
                  prospectIds: [email.prospectId.toString()] 
                });
                
                // Invalidate prospects cache to refresh the list
                queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId, 'prospects'] });
                
                const prospectName = email.prospect ? 
                  `${email.prospect.firstName || ''} ${email.prospect.lastName || ''}`.trim() || 'Prospect' : 
                  'Prospect';
                
                toast({
                  title: "Prospect Auto-Enrolled",
                  description: `${prospectName} has been enrolled in this sequence`
                });
              } catch (error) {
                console.error("Failed to auto-enroll prospect:", error);
                toast({
                  title: "Enrollment Failed",
                  description: "Could not auto-enroll prospect. You can manually enroll them from the Prospects tab.",
                  variant: "destructive"
                });
              }
            }
          }
        }}
      />

      <Dialog open={showAITemplate} onOpenChange={setShowAITemplate}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Template Library
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Choose from AI-optimized email templates designed for different industries and use cases
            </p>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {SEQUENCE_TEMPLATES.map((template) => {
              const IconComponent = template.icon;
              return (
                <Card 
                  key={template.id} 
                  className="cursor-pointer hover:border-primary hover:shadow-md transition-all"
                  onClick={async () => {
                    try {
                      // Create sequence from template
                      const res = await apiRequest("POST", "/api/sequences/from-template", { 
                        templateId: template.id 
                      });
                      const data = await res.json();
                      
                      setShowAITemplate(false);
                      queryClient.invalidateQueries({ queryKey: ['/api/sequences'] });
                      
                      toast({ 
                        title: "Sequence created from AI template successfully",
                        description: `"${template.name}" has been added to your sequences`
                      });
                      
                      // Navigate to the new sequence
                      window.location.href = `/sequences/${data.sequenceId}`;
                    } catch (error) {
                      console.error("Failed to create sequence from template:", error);
                      toast({
                        title: "Failed to create sequence",
                        description: "Please try again",
                        variant: "destructive"
                      });
                    }
                  }}
                  data-testid={`ai-template-${template.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <IconComponent className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <Badge variant="secondary" className="mt-1 text-xs">
                            {template.category}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <CardDescription className="mt-2">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        <span>{template.steps.length} emails</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {template.steps.reduce((sum, step) => sum + (step.delayDays || 0), 0)} days
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="text-primary font-medium">AI-Optimized</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm mb-1">AI-Powered Templates</h4>
                <p className="text-sm text-muted-foreground">
                  These templates are optimized using AI for maximum engagement. Each template includes 
                  personalization variables and proven copywriting patterns for your industry.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AIFollowupTab({ sequenceId }: { sequenceId: string }) {
  const [schedulerActive, setSchedulerActive] = useState(false);
  const [daysBetween, setDaysBetween] = useState("3");
  const [maxFollowups, setMaxFollowups] = useState("3");
  const [followupType, setFollowupType] = useState("gentle_reminder");
  const [triggerCondition, setTriggerCondition] = useState("no_response");
  const [selectedContent, setSelectedContent] = useState<string[]>([]);
  const [selectedProspects, setSelectedProspects] = useState<string[]>([]);
  const [prospectSearch, setProspectSearch] = useState("");
  const [contentSearch, setContentSearch] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const { toast } = useToast();

  const { data: contentLibrary } = useQuery({
    queryKey: ["/api/content-library"],
  });

  const { data: prospectsData } = useQuery({
    queryKey: ['/api/sequences', sequenceId, 'prospects'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/prospects`, undefined);
      return await res.json();
    },
  });

  const contentItems = (contentLibrary as any)?.items || [];
  const prospects = prospectsData?.prospects || [];

  const filteredContent = contentItems.filter((item: any) => {
    const searchLower = contentSearch.toLowerCase();
    return (item.title || '').toLowerCase().includes(searchLower) ||
           (item.description || '').toLowerCase().includes(searchLower);
  });

  const filteredProspects = prospects.filter((p: any) => {
    const searchLower = prospectSearch.toLowerCase();
    const prospectData = p.prospect || p;
    const fullName = prospectData.fullName || `${prospectData.firstName || ''} ${prospectData.lastName || ''}`.trim();
    const matchesSearch = 
      fullName.toLowerCase().includes(searchLower) ||
      (prospectData.companyName || '').toLowerCase().includes(searchLower) ||
      (prospectData.primaryEmail || '').toLowerCase().includes(searchLower);
    return matchesSearch;
  });

  const handleSelectAll = () => {
    const filteredIds = filteredProspects.map((p: any) => p.id);
    const allFilteredSelected = filteredProspects.length > 0 && 
      filteredProspects.every((p: any) => selectedProspects.includes(p.id));
    
    if (allFilteredSelected) {
      // Remove only the filtered prospects from selection, keep others
      setSelectedProspects(selectedProspects.filter(id => !filteredIds.includes(id)));
    } else {
      // Add filtered prospects to existing selection (union)
      const newSelection = new Set([...selectedProspects, ...filteredIds]);
      setSelectedProspects(Array.from(newSelection));
    }
  };

  const previewMutation = useMutation({
    mutationFn: async (prospectId: string) => {
      const res = await apiRequest("POST", "/api/sequences/followup-preview", {
        prospectId,
        emailHistory: "",
        followUpType: followupType,
        followUpNumber: 1
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setShowPreview(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Preview failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handlePreviewEmail = () => {
    if (selectedProspects.length === 0) {
      toast({
        title: "No prospects selected",
        description: "Please select at least one prospect to preview",
        variant: "destructive"
      });
      return;
    }

    // Get the first selected prospect's actual prospect ID
    const firstSelectedSequenceProspect = prospects.find((p: any) => p.id === selectedProspects[0]);
    if (firstSelectedSequenceProspect) {
      const prospectId = firstSelectedSequenceProspect.prospectId;
      previewMutation.mutate(prospectId);
    }
  };

  const handleScheduleFollowups = () => {
    toast({ 
      title: `Follow-ups scheduled for ${selectedProspects.length} prospects`,
      description: "AI will generate personalized follow-ups based on your settings"
    });
    setSelectedProspects([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">AI Follow-up Configuration</h2>
          <p className="text-sm text-muted-foreground mt-1">AI Follow-up Scheduler</p>
          <p className="text-sm text-muted-foreground">Automatically sends follow-ups based on conditions</p>
        </div>
        <Button 
          variant={schedulerActive ? "default" : "outline"}
          onClick={() => setSchedulerActive(!schedulerActive)}
          data-testid="button-start-scheduler"
        >
          <Play className="w-4 h-4 mr-2" />
          {schedulerActive ? "Stop Scheduler" : "Start Scheduler"}
        </Button>
      </div>

      {/* Basic Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Basic Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="days-between">Days Between Follow-ups</Label>
            <Input
              id="days-between"
              type="number"
              value={daysBetween}
              onChange={(e) => setDaysBetween(e.target.value)}
              data-testid="input-days-between"
            />
            <p className="text-sm text-muted-foreground">Wait this many days before sending the next follow-up</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-followups">Maximum Follow-ups</Label>
            <Input
              id="max-followups"
              type="number"
              value={maxFollowups}
              onChange={(e) => setMaxFollowups(e.target.value)}
              data-testid="input-max-followups"
            />
            <p className="text-sm text-muted-foreground">Maximum number of follow-up emails to send per prospect</p>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Advanced Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="followup-type">Follow-up Type</Label>
            <Select value={followupType} onValueChange={setFollowupType}>
              <SelectTrigger id="followup-type" data-testid="select-followup-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gentle_reminder">Gentle Reminder</SelectItem>
                <SelectItem value="value_proposition">Value Proposition</SelectItem>
                <SelectItem value="urgency">Urgency-Based</SelectItem>
                <SelectItem value="question">Question-Based</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Soft, non-pushy follow-up</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trigger-condition">Trigger Condition</Label>
            <Select value={triggerCondition} onValueChange={setTriggerCondition}>
              <SelectTrigger id="trigger-condition" data-testid="select-trigger-condition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_response">No Response</SelectItem>
                <SelectItem value="opened_no_reply">Opened but No Reply</SelectItem>
                <SelectItem value="clicked_no_reply">Clicked but No Reply</SelectItem>
                <SelectItem value="time_based">Time-Based</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Prospect has not replied</p>
          </div>

          <div className="space-y-2">
            <Label>Reference Content (Optional)</Label>
            {contentItems.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search content..."
                  value={contentSearch}
                  onChange={(e) => setContentSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-content"
                />
              </div>
            )}
            <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
              {contentItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No content available</p>
              ) : filteredContent.length === 0 ? (
                <div className="text-center py-4">
                  <Search className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No content matches your search</p>
                </div>
              ) : (
                filteredContent.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-2 py-2">
                    <input
                      type="checkbox"
                      id={`content-${item.id}`}
                      checked={selectedContent.includes(item.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedContent([...selectedContent, item.id]);
                        } else {
                          setSelectedContent(selectedContent.filter(id => id !== item.id));
                        }
                      }}
                      data-testid={`checkbox-content-${item.id}`}
                    />
                    <label htmlFor={`content-${item.id}`} className="flex-1 text-sm cursor-pointer">
                      {item.title}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Follow-up Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Follow-up Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">Total Follow-ups Sent</p>
            </div>
            <div>
              <p className="text-3xl font-bold">0.0</p>
              <p className="text-sm text-muted-foreground">Avg per Prospect</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Follow-ups for Prospects */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Schedule Follow-ups for Prospects</CardTitle>
          <CardDescription>{selectedProspects.length} selected</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search prospects by name, company, or email..."
              value={prospectSearch}
              onChange={(e) => setProspectSearch(e.target.value)}
              className="pl-10"
              data-testid="input-search-prospects"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="select-all"
              checked={filteredProspects.length > 0 && filteredProspects.every((p: any) => selectedProspects.includes(p.id))}
              onChange={handleSelectAll}
              data-testid="checkbox-select-all"
            />
            <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
              Select All {filteredProspects.length > 0 && filteredProspects.length !== prospects.length && `(${filteredProspects.length})`}
            </label>
          </div>

          <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
            {prospects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No prospects enrolled in this sequence
              </p>
            ) : filteredProspects.length === 0 ? (
              <div className="text-center py-8">
                <Search className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No prospects match your search</p>
              </div>
            ) : (
              filteredProspects.map((item: any) => {
                const prospectData = item.prospect || item;
                const displayName = prospectData.fullName || `${prospectData.firstName || ''} ${prospectData.lastName || ''}`.trim();
                
                return (
                  <div key={item.id} className="flex items-center gap-2 py-2">
                    <input
                      type="checkbox"
                      id={`prospect-${item.id}`}
                      checked={selectedProspects.includes(item.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProspects([...selectedProspects, item.id]);
                        } else {
                          setSelectedProspects(selectedProspects.filter(id => id !== item.id));
                        }
                      }}
                      data-testid={`checkbox-prospect-${item.id}`}
                    />
                    <label htmlFor={`prospect-${item.id}`} className="flex-1 text-sm cursor-pointer">
                      {displayName} - {prospectData.companyName || 'No company'}
                    </label>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handlePreviewEmail}
              disabled={selectedProspects.length === 0 || previewMutation.isPending}
              variant="outline"
              className="flex-1"
              data-testid="button-preview-email"
            >
              {previewMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating Preview...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Preview Email
                </>
              )}
            </Button>
            <Button 
              onClick={handleScheduleFollowups}
              disabled={selectedProspects.length === 0}
              className="flex-1"
              data-testid="button-schedule-followups"
            >
              Schedule for {selectedProspects.length} prospects
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI Follow-up Email Preview</DialogTitle>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Subject</Label>
                <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border">
                  {previewData.subject}
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold">Email Body</Label>
                <div className="mt-1 p-4 bg-gray-50 dark:bg-gray-800 rounded-md border whitespace-pre-wrap">
                  {previewData.body}
                </div>
              </div>
              {previewData.personalizationScore !== undefined && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-semibold">Personalization Score:</Label>
                  <Badge variant={previewData.personalizationScore >= 80 ? "default" : "secondary"}>
                    {previewData.personalizationScore}%
                  </Badge>
                </div>
              )}
              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={() => {
                    setShowPreview(false);
                    handleScheduleFollowups();
                  }}
                  className="flex-1"
                  data-testid="button-schedule-from-preview"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Schedule for {selectedProspects.length} prospects
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowPreview(false)}
                  data-testid="button-close-preview"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProspectsTab({ sequenceId, prospects, isLoading }: { sequenceId: string; prospects: any[]; isLoading: boolean }) {
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedForEnrollment, setSelectedForEnrollment] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load prospects with backend search
  const { data: allProspects } = useQuery({
    queryKey: ["/api/prospects", { search: debouncedSearchTerm, limit: 100 }],
    queryFn: () => api.getProspects({ search: debouncedSearchTerm, limit: 100 }),
    enabled: showEnrollModal, // Only fetch when modal is open
  });

  const prospectsList = (allProspects as any)?.prospects || [];

  const enrollMutation = useMutation({
    mutationFn: async (prospectIds: string[]) => {
      const res = await apiRequest("POST", `/api/sequences/${sequenceId}/prospects`, { prospectIds });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId, 'prospects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      setShowEnrollModal(false);
      setSelectedForEnrollment([]);
      toast({ title: "Prospects enrolled successfully", description: data.message || `${selectedForEnrollment.length} prospects added` });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Enrollment failed", 
        description: error.message,
        variant: "destructive"
      });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Enrolled Prospects</CardTitle>
              <CardDescription>{prospects.length} prospects in this sequence</CardDescription>
            </div>
            <Button onClick={() => setShowEnrollModal(true)} data-testid="button-enroll-prospects">
              <Plus className="w-4 h-4 mr-2" />
              Enroll Prospects
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            </div>
          ) : prospects.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No prospects enrolled</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">Add prospects to start your sequence</p>
              <Button onClick={() => setShowEnrollModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Enroll Prospects
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Name</th>
                    <th className="text-left py-3 px-4 font-semibold">Company</th>
                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 font-semibold">Current Step</th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.map((item: any) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-3 px-4">
                        {item.prospect?.fullName || `${item.prospect?.firstName || ""} ${item.prospect?.lastName || ""}`.trim()}
                      </td>
                      <td className="py-3 px-4">{item.prospect?.companyName}</td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary">{item.status}</Badge>
                      </td>
                      <td className="py-3 px-4">{item.currentStep || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showEnrollModal} onOpenChange={(open) => {
        setShowEnrollModal(open);
        if (!open) setSelectedForEnrollment([]);
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Enroll Prospects in Sequence</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Select prospects from your database to enroll in this sequence
            </p>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search prospects by name, company, or job title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-enroll-prospects"
              />
            </div>
            
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium">
                {selectedForEnrollment.length} of {prospectsList.length} selected
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  if (selectedForEnrollment.length === prospectsList.length) {
                    setSelectedForEnrollment([]);
                  } else {
                    setSelectedForEnrollment(prospectsList.map((p: any) => p.id));
                  }
                }}
              >
                {selectedForEnrollment.length === prospectsList.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto border rounded-lg p-4">
              {prospectsList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No prospects found. Import or search for prospects first.
                </div>
              ) : (
                prospectsList.map((prospect: any) => (
                  <div key={prospect.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                    <input 
                      type="checkbox" 
                      id={`enroll-${prospect.id}`} 
                      checked={selectedForEnrollment.includes(prospect.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedForEnrollment([...selectedForEnrollment, prospect.id]);
                        } else {
                          setSelectedForEnrollment(selectedForEnrollment.filter(id => id !== prospect.id));
                        }
                      }}
                      data-testid={`checkbox-enroll-${prospect.id}`}
                    />
                    <label htmlFor={`enroll-${prospect.id}`} className="flex-1 cursor-pointer text-sm">
                      {prospect.fullName || `${prospect.firstName} ${prospect.lastName}`} - {prospect.companyName || 'No company'}
                    </label>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowEnrollModal(false);
                  setSelectedForEnrollment([]);
                }}
                data-testid="button-cancel-enroll"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (selectedForEnrollment.length > 0) {
                    enrollMutation.mutate(selectedForEnrollment);
                  }
                }}
                disabled={selectedForEnrollment.length === 0 || enrollMutation.isPending}
                data-testid="button-confirm-enroll"
              >
                {enrollMutation.isPending ? 'Enrolling...' : `Enroll ${selectedForEnrollment.length} Prospect${selectedForEnrollment.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AIReplyComposer({ reply, sequenceId, open, onOpenChange }: { reply: any; sequenceId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const generateReplyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sequences/${sequenceId}/generate-reply`, {
        replyId: reply.id,
        prospectId: reply.prospectId,
        replyContent: reply.replyContent
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setGeneratedEmail(data.email || "");
      setIsGenerating(false);
      toast({
        title: "Reply generated",
        description: "Your AI-generated reply is ready for review.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate reply",
        variant: "destructive",
      });
    }
  });

  const sendReplyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sequences/send-reply`, {
        prospectId: reply.prospectId,
        sequenceId,
        subject: `Re: ${reply.subject || 'Your inquiry'}`,
        body: generatedEmail,
      });
      return await res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setGeneratedEmail("");
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId, 'replies'] });
      toast({
        title: "Reply Sent",
        description: "Your reply has been queued and will be sent within 10 seconds",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Send Failed",
        description: error.message || "Failed to send reply",
        variant: "destructive",
      });
    }
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    generateReplyMutation.mutate();
  };

  const handleSendReply = () => {
    if (generatedEmail.trim()) {
      sendReplyMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>AI Reply Composer</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 p-4">
          <div>
            <Label className="text-sm font-medium">Original Reply from {reply.prospect?.fullName}</Label>
            <div className="mt-2 p-3 bg-muted rounded-lg text-sm">
              {reply.replyContent}
            </div>
          </div>

          {!generatedEmail && !generateReplyMutation.isPending && (
            <Button 
              onClick={handleGenerate}
              className="w-full"
              data-testid="button-generate-ai-reply"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate AI Reply
            </Button>
          )}

          {generateReplyMutation.isPending && (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-sm text-muted-foreground">Generating personalized reply...</p>
            </div>
          )}

          {generatedEmail && (
            <div>
              <Label className="text-sm font-medium">Generated Reply</Label>
              <Textarea
                value={generatedEmail}
                onChange={(e) => setGeneratedEmail(e.target.value)}
                className="mt-2 min-h-[200px]"
                data-testid="textarea-generated-reply"
              />
            </div>
          )}
        </div>

        <div className="border-t px-4 py-4 flex justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-reply">
            Cancel
          </Button>
          {generatedEmail && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleGenerate} data-testid="button-regenerate-reply">
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
              <Button 
                onClick={handleSendReply}
                disabled={sendReplyMutation.isPending || !generatedEmail.trim()}
                data-testid="button-send-reply"
              >
                {sendReplyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Send className="w-4 h-4 mr-2" />
                Send Reply
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RepliesTab({ sequenceId, replies }: { sequenceId: string; replies: any[] }) {
  const queryClient = useQueryClient();
  const [selectedReply, setSelectedReply] = useState<any>(null);
  
  const { data: sequence } = useQuery({
    queryKey: ['/api/sequences', sequenceId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}`, undefined);
      return await res.json();
    },
  });

  const { data: prospectsData } = useQuery({
    queryKey: ['/api/sequences', sequenceId, 'prospects'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/prospects`, undefined);
      return await res.json();
    },
  });

  const totalReplies = replies?.length || 0;
  const totalProspects = prospectsData?.prospects?.length || 0;
  const uniqueProspectsReplied = new Set(replies?.map((r: any) => r.prospectId) || []).size;
  const responseRate = totalProspects > 0 ? Math.round((uniqueProspectsReplied / totalProspects) * 100) : 0;
  const latestReply = replies?.[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6" />
            Email Replies - {sequence?.name || 'Sequence'}
          </h2>
          <p className="text-muted-foreground mt-1">
            {uniqueProspectsReplied} prospects replied to this sequence
          </p>
        </div>
        <Button 
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId, 'replies'] })} 
          variant="outline" 
          size="sm"
          data-testid="button-refresh-replies"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-sm font-medium">Total Replies</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600 dark:text-green-500">{totalReplies}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-sm font-medium text-blue-600 dark:text-blue-500">Response Rate</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-500">{responseRate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-sm font-medium text-purple-600 dark:text-purple-500">Latest Reply</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-base font-medium text-purple-600 dark:text-purple-500">
              {latestReply ? new Date(latestReply.receivedAt).toLocaleString() : 'No replies yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {!replies || replies.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare className="w-20 h-20 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Replies Yet</h3>
          <p className="text-muted-foreground">
            When prospects reply to emails in this sequence, they'll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {replies.map((reply: any) => (
            <Card key={reply.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {reply.prospect?.fullName || 'Unknown Prospect'}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={reply.sentiment === 'positive' ? 'default' : 'secondary'}>
                      {reply.sentiment || 'neutral'}
                    </Badge>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => setSelectedReply(reply)}
                      data-testid={`button-generate-followup-${reply.id}`}
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      AI Follow-up
                    </Button>
                  </div>
                </div>
                <CardDescription>{new Date(reply.receivedAt).toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Reply Content:</p>
                    <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg">{reply.replyContent}</p>
                  </div>
                  {reply.prospect && (
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{reply.prospect.companyName || 'No company'}</span>
                      <span>{reply.prospect.jobTitle || 'No title'}</span>
                      <span>{reply.prospect.primaryEmail || 'No email'}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedReply && (
        <AIReplyComposer 
          reply={selectedReply}
          sequenceId={sequenceId}
          open={!!selectedReply}
          onOpenChange={(open) => {
            if (!open) setSelectedReply(null);
          }}
        />
      )}
    </div>
  );
}

function TrackingTab({ sequenceId }: { sequenceId: string }) {
  const { data: emails } = useQuery({
    queryKey: ['/api/sequences', sequenceId, 'emails'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/emails`, undefined);
      return await res.json();
    },
  });

  const emailsList = Array.isArray(emails) ? emails : [];
  
  const stats = {
    sent: emailsList.filter((e: any) => e.sentAt).length,
    delivered: emailsList.filter((e: any) => e.deliveredAt).length,
    opened: emailsList.filter((e: any) => e.openedAt).length,
    replied: emailsList.filter((e: any) => e.repliedAt).length,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Tracking & Analytics</CardTitle>
        <CardDescription>Monitor your sequence performance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Sent</p>
                <p className="text-3xl font-bold">{stats.sent}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Delivered</p>
                <p className="text-3xl font-bold">{stats.delivered}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Opened</p>
                <p className="text-3xl font-bold">{stats.opened}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Replied</p>
                <p className="text-3xl font-bold">{stats.replied}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold">Recent Emails</h3>
          {emailsList.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No emails sent yet</p>
          )}
          {emailsList.slice(0, 10).map((email: any) => (
            <div key={email.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <p className="font-medium">{email.subject}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  To: {email.prospect?.fullName} • {new Date(email.sentAt).toLocaleDateString()}
                </p>
              </div>
              <Badge variant={email.status === 'sent' ? 'default' : 'secondary'}>
                {email.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsTab({ sequenceId, sequence }: { sequenceId: string; sequence: any }) {
  const [name, setName] = useState(sequence?.name || "");
  const [description, setDescription] = useState(sequence?.description || "");
  const [status, setStatus] = useState(sequence?.status || "draft");
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/sequences/${sequenceId}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      toast({ title: "Sequence updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/sequences/${sequenceId}`, undefined);
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequence deleted successfully" });
      window.location.href = "/sequences";
    },
  });

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Sequence Settings</CardTitle>
        <CardDescription>Configure your sequence preferences</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label>Sequence Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Email Sequence"
          />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description of this sequence..."
            rows={3}
          />
        </div>

        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            onClick={() => updateMutation.mutate({ name, description, status })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm("Are you sure you want to delete this sequence? This action cannot be undone.")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Sequence
          </Button>
        </div>
      </CardContent>
    </Card>
    
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-600" />
          Automation
        </CardTitle>
        <CardDescription>Automatically import prospects and enroll them in this sequence</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm mb-1">Automated Prospect Enrollment</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Automatically find prospects using Apollo.io or use existing prospects from your database, 
                then enroll them in this sequence with optional AI-powered personalization.
              </p>
              <Button 
                onClick={() => setShowAutomationModal(true)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                data-testid="button-start-automation"
              >
                <Zap className="w-4 h-4 mr-2" />
                Start Automation
              </Button>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">Features:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Fetch prospects from Apollo.io with custom filters</li>
              <li>Use existing prospects from your database</li>
              <li>AI-powered email personalization</li>
              <li>Automatic sequence enrollment</li>
              <li>Real-time progress tracking</li>
            </ul>
          </div>
          
          <div className="pt-2">
            <Link href="/automation">
              <Button variant="outline" size="sm">
                <BarChart3 className="w-4 h-4 mr-2" />
                View Automation Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>

    {showAutomationModal && (
      <AutomationModal
        sequenceId={sequenceId}
        sequenceName={sequence?.name || ""}
        open={showAutomationModal}
        onClose={() => setShowAutomationModal(false)}
      />
    )}
  </>
  );
}

function AIEmailGenerator({ 
  sequenceId, 
  stepNumber, 
  onUseEmail, 
  onCancel 
}: { 
  sequenceId: string; 
  stepNumber: number; 
  onUseEmail: (email: { subject: string; body: string }) => void; 
  onCancel: () => void; 
}) {
  const [selectedProspectId, setSelectedProspectId] = useState("");
  const [emailType, setEmailType] = useState<'cold_outreach' | 'follow_up'>('cold_outreach');
  const [tone, setTone] = useState<'professional' | 'casual' | 'friendly'>('professional');
  const { toast } = useToast();

  const { data: allProspects } = useQuery({
    queryKey: ["/api/prospects"],
  });

  const prospectsList = (allProspects as any)?.prospects || [];

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProspectId) {
        throw new Error("Please select a prospect");
      }
      const res = await apiRequest("POST", "/api/sequences/ai-generate-email", {
        prospectId: selectedProspectId,
        emailType,
        sequenceStep: stepNumber,
        tone
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Email generated!", 
        description: `Personalization score: ${data.confidenceScore}%` 
      });
      onUseEmail({ subject: data.subject, body: data.body });
    },
    onError: (error: any) => {
      toast({ 
        title: "Generation failed", 
        description: error.message || "Failed to generate email",
        variant: "destructive" 
      });
    }
  });

  return (
    <div className="space-y-4 p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold">AI Email Generator</h3>
      </div>

      <div>
        <Label>Select a Prospect</Label>
        <Select value={selectedProspectId} onValueChange={setSelectedProspectId}>
          <SelectTrigger data-testid="select-prospect">
            <SelectValue placeholder="Choose a prospect to personalize for..." />
          </SelectTrigger>
          <SelectContent>
            {prospectsList.map((prospect: any) => (
              <SelectItem key={prospect.id} value={prospect.id}>
                {prospect.fullName || `${prospect.firstName || ""} ${prospect.lastName || ""}`.trim()} 
                {prospect.companyName ? ` - ${prospect.companyName}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Email Type</Label>
        <Select value={emailType} onValueChange={(v: any) => setEmailType(v)}>
          <SelectTrigger data-testid="select-email-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cold_outreach">Cold Outreach</SelectItem>
            <SelectItem value="follow_up">Follow-up</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Tone</Label>
        <Select value={tone} onValueChange={(v: any) => setTone(v)}>
          <SelectTrigger data-testid="select-tone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="casual">Casual</SelectItem>
            <SelectItem value="friendly">Friendly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={!selectedProspectId || generateMutation.isPending}
          className="flex-1"
          data-testid="button-generate-ai-email"
        >
          {generateMutation.isPending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Email
            </>
          )}
        </Button>
        <Button variant="outline" onClick={onCancel} data-testid="button-cancel-ai">
          Cancel
        </Button>
      </div>

      {generateMutation.isSuccess && generateMutation.data && (
        <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Confidence: {generateMutation.data.confidenceScore}% • 
            Personalization: {generateMutation.data.personalizationFactors?.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}

function ActivateSequenceButton({ 
  sequenceId, 
  currentStatus, 
  hasSteps, 
  hasProspects 
}: { 
  sequenceId: string; 
  currentStatus: string; 
  hasSteps: boolean;
  hasProspects: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/sequences/${sequenceId}`, {
        status: "active"
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/sequences'] });
      toast({ 
        title: "Sequence activated!", 
        description: "Your sequence is now active and emails will be sent to enrolled prospects." 
      });
    },
    onError: () => {
      toast({ 
        title: "Failed to activate sequence", 
        variant: "destructive" 
      });
    }
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/sequences/${sequenceId}`, {
        status: "paused"
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/sequences'] });
      toast({ 
        title: "Sequence paused", 
        description: "Email sending has been paused." 
      });
    },
    onError: () => {
      toast({ 
        title: "Failed to pause sequence", 
        variant: "destructive" 
      });
    }
  });

  if (currentStatus === "active") {
    return (
      <Button 
        variant="outline"
        onClick={() => pauseMutation.mutate()}
        disabled={pauseMutation.isPending}
        data-testid="button-pause-sequence"
      >
        <Pause className="w-4 h-4 mr-2" />
        {pauseMutation.isPending ? "Pausing..." : "Pause Sequence"}
      </Button>
    );
  }

  const isDisabled = !hasSteps || !hasProspects;
  const tooltipMessage = !hasSteps 
    ? "Add at least one email step to activate" 
    : !hasProspects 
    ? "Enroll prospects to activate" 
    : "";

  return (
    <div className="relative group">
      <Button 
        onClick={() => activateMutation.mutate()}
        disabled={isDisabled || activateMutation.isPending}
        className="bg-green-600 hover:bg-green-700 text-white"
        data-testid="button-activate-sequence"
      >
        <Play className="w-4 h-4 mr-2" />
        {activateMutation.isPending ? "Activating..." : "Activate Sequence"}
      </Button>
      {isDisabled && (
        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {tooltipMessage}
        </div>
      )}
    </div>
  );
}
