import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, Edit2, Trash2, Mail, Clock, TrendingUp, Eye, Target, Reply, X,
  AlertTriangle, WandIcon, Sparkles, RefreshCw
} from "lucide-react";
import { PersonalizationWizard } from "@/components/PersonalizationWizard";
import type { FunnelData, SummaryData, StepAnalytics, NegativeSignal } from "../types";
import { SEQUENCE_TEMPLATES } from "../templates";

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
      // FIX-3: Pass sequenceId so the server can load previous steps as context
      const res = await apiRequest("POST", "/api/sequences/ai-generate-email", {
        prospectId: selectedProspectId,
        emailType,
        sequenceStep: stepNumber,
        sequenceId,   // enables previous-step context + Re: subject threading on server
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

export function SequenceTab({
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
  const [editMailboxId, setEditMailboxId] = useState<string>("");
  const [showAIPersonalization, setShowAIPersonalization] = useState(false);
  const [showAITemplate, setShowAITemplate] = useState(false);
  const [subject, setSubject] = useState("");
  const [manualSubject, setManualSubject] = useState("");
  const [body, setBody] = useState("");
  const [delayDays, setDelayDays] = useState("0");
  const [mailboxId, setMailboxId] = useState<string>("");
  const [usePreviousSubject, setUsePreviousSubject] = useState(false);
  const [activeMetric, setActiveMetric] = useState<'opened' | 'clicked' | 'replied' | 'booked'>('opened');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: mailboxes = [] } = useQuery<any[]>({
    queryKey: ["/api/mailboxes"],
  });

  // Analytics queries
  const { data: funnelData } = useQuery<FunnelData>({
    queryKey: ['/api/sequences', sequenceId, 'funnel'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/funnel`, undefined);
      return await res.json();
    },
    refetchInterval: 30000,
  });

  const { data: summaryData } = useQuery<SummaryData>({
    queryKey: ['/api/sequences', sequenceId, 'summary'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/summary`, undefined);
      return await res.json();
    },
    refetchInterval: 30000,
  });

  const { data: stepAnalyticsData, isLoading: stepAnalyticsLoading, error: stepAnalyticsError } = useQuery<{ stepAnalytics: StepAnalytics[] }>({
    queryKey: ['/api/sequences', sequenceId, 'steps', 'analytics'],
    queryFn: async () => {
      console.log(`[StepAnalyticsQuery] Fetching for sequenceId=${sequenceId}`);
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/steps/analytics`, undefined);
      const data = await res.json();
      console.log(`[StepAnalyticsData] sequenceId=${sequenceId}`, data);
      return data;
    },
    enabled: !!sequenceId,
    staleTime: 0,
    refetchInterval: 30000,
  });

  // Debug log for step analytics state
  console.log(`[StepAnalyticsState] loading=${stepAnalyticsLoading}, error=${stepAnalyticsError?.message || 'none'}, data=`, stepAnalyticsData);

  const { data: negativeSignalsData } = useQuery<{ negativeSignals: NegativeSignal[] }>({
    queryKey: ['/api/sequences', sequenceId, 'steps', 'negative-signals'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/steps/negative-signals`, undefined);
      return await res.json();
    },
    refetchInterval: 30000,
  });

  const getStepAnalytics = (stepId: string) => {
    return stepAnalyticsData?.stepAnalytics?.find(s => s.stepId === stepId);
  };

  const getStepNegativeSignals = (stepId: string) => {
    return negativeSignalsData?.negativeSignals?.find(s => s.stepId === stepId);
  };

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
      setMailboxId("");
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
    setEditMailboxId(step.mailboxId || "");
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

      {/* Funnel Analytics Bar */}
      {steps.length > 0 && funnelData && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-2 overflow-x-auto" data-testid="funnel-analytics">
              <div className="flex items-center gap-1 min-w-0">
                <div className="flex items-center gap-4">
                  <div className="text-center px-3 py-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg min-w-[100px]">
                    <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{funnelData.contacted.percent}%</div>
                    <div className="text-xs text-blue-600 dark:text-blue-400">Contacted ({funnelData.contacted.count})</div>
                  </div>
                  <span className="text-gray-400">→</span>
                  <div className="text-center px-3 py-2 bg-green-100 dark:bg-green-900/50 rounded-lg min-w-[100px]">
                    <div className="text-lg font-bold text-green-700 dark:text-green-300">{funnelData.opened.percent}%</div>
                    <div className="text-xs text-green-600 dark:text-green-400">Opened ({funnelData.opened.count})</div>
                  </div>
                  <span className="text-gray-400">→</span>
                  <div className="text-center px-3 py-2 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg min-w-[100px]">
                    <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{funnelData.interaction.percent}%</div>
                    <div className="text-xs text-yellow-600 dark:text-yellow-400">Interaction ({funnelData.interaction.count})</div>
                  </div>
                  <span className="text-gray-400">→</span>
                  <div className="text-center px-3 py-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg min-w-[100px]">
                    <div className="text-lg font-bold text-purple-700 dark:text-purple-300">{funnelData.answered.percent}%</div>
                    <div className="text-xs text-purple-600 dark:text-purple-400">Answered ({funnelData.answered.count})</div>
                  </div>
                  <span className="text-gray-400">→</span>
                  <div className="text-center px-3 py-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg min-w-[100px]">
                    <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{funnelData.interested.percent}%</div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-400">Interested ({funnelData.interested.count})</div>
                  </div>
                  <span className="text-gray-400">→</span>
                  <div className="text-center px-3 py-2 bg-red-100 dark:bg-red-900/50 rounded-lg min-w-[100px]">
                    <div className="text-lg font-bold text-red-700 dark:text-red-300">{funnelData.interrupted.percent}%</div>
                    <div className="text-xs text-red-600 dark:text-red-400">Interrupted ({funnelData.interrupted.count})</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {steps.length > 0 && summaryData && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="summary-cards">
          <Card className="bg-white dark:bg-gray-800">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{summaryData.totalLeads}</div>
              <div className="text-xs text-muted-foreground">Leads in sequence</div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{summaryData.launchedLeads}</div>
              <div className="text-xs text-muted-foreground">Leads launched</div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{summaryData.reachedLeads}</div>
              <div className="text-xs text-muted-foreground">Leads reached</div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{summaryData.deliveredPercent}%</div>
              <div className="text-xs text-muted-foreground">Delivered</div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summaryData.messagesSent}</div>
              <div className="text-xs text-muted-foreground">Messages sent</div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summaryData.messagesFailed}</div>
              <div className="text-xs text-muted-foreground">Messages failed</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Metric Toggle Buttons */}
      {steps.length > 0 && (
        <div className="flex gap-2" data-testid="metric-toggle">
          <Button
            variant={activeMetric === 'opened' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveMetric('opened')}
          >
            <Eye className="w-3 h-3 mr-1" /> Opened
          </Button>
          <Button
            variant={activeMetric === 'clicked' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveMetric('clicked')}
          >
            <Target className="w-3 h-3 mr-1" /> Clicked
          </Button>
          <Button
            variant={activeMetric === 'replied' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveMetric('replied')}
          >
            <Reply className="w-3 h-3 mr-1" /> Replied
          </Button>
          <Button
            variant={activeMetric === 'booked' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveMetric('booked')}
          >
            <TrendingUp className="w-3 h-3 mr-1" /> Booked
          </Button>
        </div>
      )}

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
              {steps.map((step: any, index: number) => {
                const stepAnalytics = getStepAnalytics(step.id);
                const negativeSignals = getStepNegativeSignals(step.id);
                console.log(`[Step ${index + 1}] stepId=${step.id}, stepAnalytics=`, stepAnalytics);

                return (
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
                            <Badge variant="outline" className="text-muted-foreground">
                              <Mail className="w-3 h-3 mr-1" />
                              Email
                            </Badge>
                            {stepAnalytics && stepAnalytics.sent > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {stepAnalytics.sent} sent
                              </Badge>
                            )}
                          </div>
                          <h4 className="font-semibold text-lg">{step.subject}</h4>
                          <p className="text-muted-foreground text-sm mt-2 line-clamp-2">{step.body}</p>

                          {/* Step-level Analytics */}
                          {stepAnalytics && stepAnalytics.sent > 0 && (
                            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg" data-testid={`step-analytics-${step.id}`}>
                              <div className="grid grid-cols-4 gap-4 text-center">
                                <div className={`${activeMetric === 'opened' ? 'ring-2 ring-blue-500 rounded-lg p-1' : ''}`}>
                                  <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                                    {stepAnalytics.opened.percent}% ({stepAnalytics.opened.count})
                                  </div>
                                  <div className="text-xs text-muted-foreground">Opened</div>
                                </div>
                                <div className={`${activeMetric === 'clicked' ? 'ring-2 ring-blue-500 rounded-lg p-1' : ''}`}>
                                  <div className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                                    {stepAnalytics.clicked.percent}% ({stepAnalytics.clicked.count})
                                  </div>
                                  <div className="text-xs text-muted-foreground">Clicked</div>
                                </div>
                                <div className={`${activeMetric === 'replied' ? 'ring-2 ring-blue-500 rounded-lg p-1' : ''}`}>
                                  <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                                    {stepAnalytics.replied.percent}% ({stepAnalytics.replied.count})
                                  </div>
                                  <div className="text-xs text-muted-foreground">Replied</div>
                                </div>
                                <div className={`${activeMetric === 'booked' ? 'ring-2 ring-blue-500 rounded-lg p-1' : ''}`}>
                                  <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                    {stepAnalytics.booked.percent}% ({stepAnalytics.booked.count})
                                  </div>
                                  <div className="text-xs text-muted-foreground">Booked</div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Negative Signals */}
                          {negativeSignals && (negativeSignals.notSent > 0 || negativeSignals.bounced > 0 || negativeSignals.unsubscribed > 0 || negativeSignals.notInterested > 0) && (
                            <div className="mt-3 flex flex-wrap gap-3 text-xs" data-testid={`step-negative-signals-${step.id}`}>
                              {negativeSignals.notSent > 0 && (
                                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                  <X className="w-3 h-3" /> Not sent: {negativeSignals.notSent}
                                </span>
                              )}
                              {negativeSignals.bounced > 0 && (
                                <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                                  <AlertTriangle className="w-3 h-3" /> Bounced: {negativeSignals.bounced}
                                </span>
                              )}
                              {negativeSignals.unsubscribed > 0 && (
                                <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                                  <X className="w-3 h-3" /> Unsubscribed: {negativeSignals.unsubscribed}
                                </span>
                              )}
                              {negativeSignals.notInterested > 0 && (
                                <span className="flex items-center gap-1 text-gray-500 dark:text-gray-500">
                                  <X className="w-3 h-3" /> Not interested: {negativeSignals.notInterested}
                                </span>
                              )}
                            </div>
                          )}
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
                );
              })}
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
            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <Label>Send from Mailbox</Label>
                <Select value={mailboxId} onValueChange={setMailboxId}>
                  <SelectTrigger data-testid="select-step-mailbox">
                    <SelectValue placeholder="Select mailbox..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mailboxes.filter((m: any) => m.status !== 'error').map((m: any) => (
                      <SelectItem key={m.id} value={m.id} disabled={m.status === 'broken'}>
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${m.status === 'active' ? 'bg-green-500' : m.status === 'warming' ? 'bg-blue-500' : 'bg-yellow-500'}`} />
                          {m.name} &lt;{m.email}&gt;
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Optional - uses default if not set</p>
              </div>
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
                      delayDays: parseInt(delayDays) || 0,
                      mailboxId: mailboxId || undefined
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
            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <Label>Send from Mailbox</Label>
                <Select value={editMailboxId} onValueChange={setEditMailboxId}>
                  <SelectTrigger data-testid="select-edit-step-mailbox">
                    <SelectValue placeholder="Select mailbox..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mailboxes.filter((m: any) => m.status !== 'error').map((m: any) => (
                      <SelectItem key={m.id} value={m.id} disabled={m.status === 'broken'}>
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${m.status === 'active' ? 'bg-green-500' : m.status === 'warming' ? 'bg-blue-500' : 'bg-yellow-500'}`} />
                          {m.name} &lt;{m.email}&gt;
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Optional - uses default if not set</p>
              </div>
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
                        delayDays: parseInt(editDelayDays) || 0,
                        mailboxId: editMailboxId || null
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

                  // Calculate estimated send time based on first step's delayDays
                  const firstStepDelay = steps.length > 0 ? (steps[0].delayDays || 0) : 0;
                  const estimatedSendTime = new Date();
                  estimatedSendTime.setDate(estimatedSendTime.getDate() + firstStepDelay);

                  const formatSendTime = () => {
                    if (firstStepDelay === 0) {
                      return "Emails will be sent immediately when sequence is activated.";
                    }
                    return `Emails will be sent on ${estimatedSendTime.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })} when sequence is activated.`;
                  };

                  toast({
                    title: "Batch Personalization Complete",
                    description: `${saveResult.savedCount} personalized emails saved and ${prospectIds.length} prospects enrolled. ${formatSendTime()}`
                  });
                } catch (enrollError) {
                  console.error("Failed to auto-enroll prospects:", enrollError);
                  const firstStepDelay = steps.length > 0 ? (steps[0].delayDays || 0) : 0;
                  const sendNote = firstStepDelay === 0
                    ? "Emails will be sent immediately when sequence is activated."
                    : `Emails scheduled for ${firstStepDelay} day(s) after activation.`;
                  toast({
                    title: "Emails Saved",
                    description: `${saveResult.savedCount} personalized emails saved. Auto-enrollment failed - please enroll prospects manually. ${sendNote}`,
                    variant: "default"
                  });
                }
              } else {
                const firstStepDelay = steps.length > 0 ? (steps[0].delayDays || 0) : 0;
                const sendNote = firstStepDelay === 0
                  ? "Emails will be sent immediately when sequence is activated."
                  : `Emails scheduled for ${firstStepDelay} day(s) after activation.`;
                toast({
                  title: "Personalized Emails Saved",
                  description: `${saveResult.savedCount} personalized emails have been saved for these prospects. ${sendNote}`
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

                // Calculate when email will be sent
                const stepDelayDays = parseInt(delayDays) || 0;
                const sendNote = stepDelayDays === 0
                  ? "Email will be sent immediately when sequence is activated."
                  : `Email scheduled for ${stepDelayDays} day(s) after activation.`;

                toast({
                  title: "Prospect Auto-Enrolled",
                  description: `${prospectName} has been enrolled in this sequence. ${sendNote}`
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
