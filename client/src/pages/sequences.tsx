import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { 
  Users, MessageSquare, Zap, BarChart3, Settings, Plus, RefreshCw, 
  Sparkles, X, Trash2, Mail, Send, Eye, Target,
  Clock, TrendingUp, Play, Pause, ArrowLeft, FileText, WandIcon
} from "lucide-react";
import { PersonalizationWizard } from "@/components/PersonalizationWizard";

export default function SequencesPage() {
  const [match, params] = useRoute("/sequences/:id");
  const sequenceId = params?.id;

  if (match && sequenceId) {
    return <ProductionSequenceBuilder sequenceId={sequenceId} />;
  }

  return <SequencesList />;
}

function SequencesList() {
  const { data: sequences, isLoading } = useQuery({
    queryKey: ["/api/sequences"],
  });

  const sequencesList = Array.isArray(sequences) ? sequences : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto p-6">
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

        {isLoading ? (
          <div className="text-center py-16">Loading sequences...</div>
        ) : sequencesList.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No sequences yet</h3>
              <p className="text-gray-500 mb-6">Create your first email sequence to get started</p>
              <CreateSequenceButton />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sequencesList.map((sequence: any) => (
              <Link key={sequence.id} href={`/sequences/${sequence.id}`}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow" data-testid={`card-sequence-${sequence.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{sequence.name}</CardTitle>
                      <Badge variant={sequence.status === "active" ? "default" : "secondary"}>
                        {sequence.status}
                      </Badge>
                    </div>
                    <CardDescription>{sequence.description || "No description"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Prospects:</span>
                        <span className="font-medium">{sequence.totalProspects || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
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

  const handleMethodSelect = (method: 'scratch' | 'template' | 'ai' | 'auto-ai') => {
    setCreationMethod(method);
  };

  const handleBackToMethods = () => {
    setCreationMethod(null);
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
            <div className="text-center py-8">
              <Button variant="ghost" onClick={handleBackToMethods} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Methods
              </Button>
              <p className="text-muted-foreground mt-4">Template Library coming soon...</p>
            </div>
          ) : creationMethod === 'ai' ? (
            <div className="text-center py-8">
              <Button variant="ghost" onClick={handleBackToMethods} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Methods
              </Button>
              <p className="text-muted-foreground mt-4">AI Generation coming soon...</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <Button variant="ghost" onClick={handleBackToMethods} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Methods
              </Button>
              <p className="text-muted-foreground mt-4">Auto Create with AI coming soon...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
  });

  const { data: repliesData } = useQuery({
    queryKey: ['/api/sequences', sequenceId, 'replies'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/replies`, undefined);
      return await res.json();
    },
    refetchInterval: 30000,
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
        <DialogContent className="max-w-6xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
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

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <div className="border-b px-6">
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

            <div className="flex-1 overflow-y-auto">
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

            <div className="border-t px-6 py-4 flex items-center justify-between bg-muted/30">
              <span className="text-sm text-muted-foreground">
                {sequence?.steps?.length || 0} steps in sequence
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
  const [showAIPersonalization, setShowAIPersonalization] = useState(false);
  const [showAITemplate, setShowAITemplate] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [delayDays, setDelayDays] = useState("0");
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
      setBody("");
      setDelayDays("0");
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteStepMutation.mutate(step.id)}
                        data-testid={`button-delete-step-${step.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
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
            <div>
              <Label>Subject Line</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject..."
                data-testid="input-step-subject"
              />
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
                  if (subject.trim() && body.trim()) {
                    addStepMutation.mutate({
                      subject,
                      body,
                      delayDays: parseInt(delayDays) || 0
                    });
                  }
                }}
                disabled={!subject.trim() || !body.trim() || addStepMutation.isPending}
                data-testid="button-save-step"
              >
                {addStepMutation.isPending ? "Adding..." : "Add Step"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PersonalizationWizard 
        open={showAIPersonalization}
        onClose={() => setShowAIPersonalization(false)}
        onComplete={(email) => {
          if (email && email.subject && email.body) {
            setSubject(email.subject);
            setBody(email.body);
            setShowAIPersonalization(false);
            toast({ title: "AI-personalized email added to step!" });
          }
        }}
      />

      <Dialog open={showAITemplate} onOpenChange={setShowAITemplate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI Template Library</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <Sparkles className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">AI Template Library Coming Soon</h3>
            <p className="text-muted-foreground">
              Choose from pre-built email templates optimized for different industries and use cases.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AIFollowupTab({ sequenceId }: { sequenceId: string }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI Follow-up</CardTitle>
          <CardDescription>Automatically generate follow-up emails based on prospect responses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Zap className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">AI Follow-up Coming Soon</h3>
            <p className="text-muted-foreground">
              This feature will automatically craft intelligent follow-up emails based on prospect engagement and responses.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProspectsTab({ sequenceId, prospects, isLoading }: { sequenceId: string; prospects: any[]; isLoading: boolean }) {
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allProspects } = useQuery({
    queryKey: ["/api/prospects"],
  });

  const prospectsList = (allProspects as any)?.prospects || [];

  const enrollMutation = useMutation({
    mutationFn: async (prospectIds: string[]) => {
      const res = await apiRequest("POST", `/api/sequences/${sequenceId}/enroll`, { prospectIds });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId, 'prospects'] });
      setShowEnrollModal(false);
      toast({ title: "Prospects enrolled successfully" });
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

      <Dialog open={showEnrollModal} onOpenChange={setShowEnrollModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enroll Prospects in Sequence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Select prospects from your database to enroll in this sequence
            </p>
            <div className="max-h-96 overflow-y-auto border rounded-lg p-4">
              {prospectsList.slice(0, 10).map((prospect: any) => (
                <div key={prospect.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                  <input type="checkbox" id={prospect.id} />
                  <label htmlFor={prospect.id} className="flex-1 cursor-pointer">
                    {prospect.fullName} - {prospect.companyName}
                  </label>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEnrollModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowEnrollModal(false)}>
                Enroll Selected
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RepliesTab({ sequenceId, replies }: { sequenceId: string; replies: any[] }) {
  const queryClient = useQueryClient();
  
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
                  <Badge variant={reply.sentiment === 'positive' ? 'default' : 'secondary'}>
                    {reply.sentiment || 'neutral'}
                  </Badge>
                </div>
                <CardDescription>{new Date(reply.receivedAt).toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{reply.replyContent}</p>
              </CardContent>
            </Card>
          ))}
        </div>
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

  const stats = {
    sent: emails?.length || 0,
    delivered: emails?.filter((e: any) => e.status === 'sent').length || 0,
    opened: 0,
    replied: 0,
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
          {emails?.slice(0, 10).map((email: any) => (
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
