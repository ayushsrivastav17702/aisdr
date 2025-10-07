import { useState } from "react";
import { useRoute } from "wouter";
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
  Clock, TrendingUp, Play, Pause, ArrowLeft, FileText
} from "lucide-react";

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
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      return await apiRequest("POST", "/api/sequences", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "Sequence created successfully" });
      setShowForm(false);
      setName("");
      setDescription("");
    },
    onError: () => {
      toast({ title: "Failed to create sequence", variant: "destructive" });
    },
  });

  if (showForm) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create New Sequence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Email Sequence"
              data-testid="input-sequence-name"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description of this sequence..."
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
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Button onClick={() => setShowForm(true)} data-testid="button-new-sequence">
      <Plus className="w-4 h-4 mr-2" />
      New Sequence
    </Button>
  );
}

function ProductionSequenceBuilder({ sequenceId }: { sequenceId: string }) {
  const [activeTab, setActiveTab] = useState('steps');
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

  if (sequenceLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'steps', label: 'Email Steps', icon: Mail },
    { id: 'prospects', label: 'Prospects', icon: Users, count: prospectsData?.total || 0 },
    { id: 'replies', label: 'Replies', icon: MessageSquare, count: repliesData?.total || 0 },
    { id: 'tracking', label: 'Tracking', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const stats = {
    sent: repliesData?.total || 0,
    openRate: 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/sequences">
                  <Button variant="ghost" size="icon" data-testid="button-back-to-list">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </Link>
                <div>
                  <CardTitle className="text-3xl font-bold">{sequence?.name || 'Sequence Builder'}</CardTitle>
                  <CardDescription className="text-base mt-2">
                    {sequence?.description || 'Manage your outreach sequence'}
                  </CardDescription>
                </div>
              </div>
              <Badge variant={sequence?.status === 'active' ? 'default' : 'secondary'} className="text-sm px-3 py-1">
                {sequence?.status || 'Draft'}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Prospects</p>
                  <p className="text-3xl font-bold">{prospectsData?.total || 0}</p>
                </div>
                <Users className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Steps</p>
                  <p className="text-3xl font-bold">{sequence?.steps?.length || 0}</p>
                </div>
                <Mail className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Emails Sent</p>
                  <p className="text-3xl font-bold">{stats.sent}</p>
                </div>
                <Send className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Replies</p>
                  <p className="text-3xl font-bold">{repliesData?.total || 0}</p>
                </div>
                <MessageSquare className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <Card>
            <div className="overflow-x-auto">
              <TabsList className="w-full justify-start h-auto p-1 bg-transparent">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="flex items-center gap-2 px-6 py-3 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm"
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                      {tab.count !== undefined && tab.count > 0 && (
                        <Badge variant="secondary" className="ml-1 text-xs">
                          {tab.count}
                        </Badge>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>
          </Card>

          <TabsContent value="steps">
            <SequenceStepsTab sequenceId={sequenceId} steps={sequence?.steps || []} />
          </TabsContent>

          <TabsContent value="prospects">
            <ProspectsTab 
              sequenceId={sequenceId} 
              prospects={prospectsData?.prospects || []} 
              isLoading={prospectsLoading}
            />
          </TabsContent>

          <TabsContent value="replies">
            <RepliesTab sequenceId={sequenceId} replies={repliesData?.replies || []} />
          </TabsContent>

          <TabsContent value="tracking">
            <TrackingTab sequenceId={sequenceId} />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab sequenceId={sequenceId} sequence={sequence} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SequenceStepsTab({ sequenceId, steps }: { sequenceId: string; steps: any[] }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
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
    setShowAIGenerator(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Email Sequence Steps</CardTitle>
              <CardDescription>Create and manage your email sequence flow</CardDescription>
            </div>
            <Button onClick={() => setShowAddModal(true)} data-testid="button-add-step">
              <Plus className="w-4 h-4 mr-2" />
              Add Step
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No email steps yet</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">Add your first email step to start the sequence</p>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Step
              </Button>
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
                        <p className="text-gray-600 dark:text-gray-400 text-sm mt-2 line-clamp-2">{step.body}</p>
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
        </CardContent>
      </Card>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Add Email Step</DialogTitle>
              {!showAIGenerator && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAIGenerator(true)}
                  data-testid="button-use-ai"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Use AI
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="space-y-4">
            {showAIGenerator ? (
              <AIEmailGenerator 
                sequenceId={sequenceId}
                stepNumber={steps.length + 1}
                onUseEmail={handleUseAIEmail}
                onCancel={() => setShowAIGenerator(false)}
              />
            ) : (
              <>
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
              </>
            )}
            {!showAIGenerator && (
              <>
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
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Email Replies</CardTitle>
            <CardDescription>{replies?.length || 0} replies received</CardDescription>
          </div>
          <Button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId, 'replies'] })} 
            variant="outline" 
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!replies || replies.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No replies yet</h3>
            <p className="text-gray-600 dark:text-gray-400">Replies will appear here when prospects respond</p>
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
      </CardContent>
    </Card>
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
