import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChartBar,
  Users,
  Mail,
  CheckCircle,
  MoreVertical,
  Pause,
  Play,
  CloudUpload,
  Loader2,
  StopCircle,
  AlertTriangle,
  RotateCcw,
  Eye,
  TrendingUp,
  Clock,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Timer,
  Send,
  CalendarClock,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Breadcrumbs } from "@/components/breadcrumbs";

interface SequenceStep {
  id: string;
  stepOrder: number;
  stepType: string;
  subject: string;
  body: string;
  delayDays: number;
  delayHours: number;
}

interface AutomationRun {
  id: string;
  sequenceId: string;
  sequenceName?: string;
  prospectCount: number;
  aiPersonalizationEnabled: boolean;
  apolloFilters: any;
  status: "running" | "completed" | "paused" | "failed";
  isStopped?: boolean;
  startedAt: string;
  completedAt?: string;
  prospectsAdded: number;
  emailsSent: number;
  repliesReceived: number;
  errors?: string;
  errorLog?: Array<{ prospectId: string | null; error: string; timestamp: string }>;
  rateLimitConfig?: {
    dailyLimit: number;
    currentDailyCount: number;
    delayBetweenEmails: number;
  };
  prospectsEnrolled?: string[];
  sequenceSteps?: SequenceStep[];
}

export default function AutomationDashboard() {
  const { toast } = useToast();
  const [selectedAutomation, setSelectedAutomation] = useState<AutomationRun | null>(null);
  const [showErrorsDialog, setShowErrorsDialog] = useState(false);
  const [showRateLimitDialog, setShowRateLimitDialog] = useState(false);
  const [showTimelineDialog, setShowTimelineDialog] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRowExpansion = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const viewTimeline = (automation: AutomationRun) => {
    setSelectedAutomation(automation);
    setShowTimelineDialog(true);
  };

  const formatDelay = (days: number, hours: number) => {
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    return parts.length > 0 ? parts.join(" ") : "Immediate";
  };

  const calculateScheduledTime = (startedAt: string, stepIndex: number, steps: SequenceStep[]) => {
    // Each step's delay defines when it should be sent AFTER the previous step
    // Step 0: Immediate (its own delay is ignored for the first step)
    // Step 1: After step[1].delayDays from step 0
    // Step 2: After step[1].delayDays + step[2].delayDays from start
    let totalMinutes = 0;
    for (let i = 1; i <= stepIndex; i++) {
      totalMinutes += (steps[i].delayDays * 24 * 60) + (steps[i].delayHours * 60);
    }
    const date = new Date(startedAt);
    date.setMinutes(date.getMinutes() + totalMinutes);
    return date;
  };

  const {
    data: automationsData,
    isLoading,
  } = useQuery<{ automations: AutomationRun[]; total: number }>({
    queryKey: ["/api/automation/list"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const automations = automationsData?.automations || [];

  // Mutations for automation control
  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/automation/${id}/pause`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Automation Paused", description: "Automation has been paused successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/list"] });
    },
    onError: () => {
      toast({ title: "❌ Failed", description: "Could not pause automation", variant: "destructive" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/automation/${id}/resume`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Automation Resumed", description: "Automation has been resumed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/list"] });
    },
    onError: () => {
      toast({ title: "❌ Failed", description: "Could not resume automation", variant: "destructive" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/automation/${id}/stop`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Automation Stopped", description: "Automation has been stopped permanently" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/list"] });
    },
    onError: () => {
      toast({ title: "❌ Failed", description: "Could not stop automation", variant: "destructive" });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/automation/${id}/retry`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Retrying Failed Prospects", description: "Retrying failed enrollments in background" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/list"] });
    },
    onError: () => {
      toast({ title: "❌ Failed", description: "Could not retry prospects", variant: "destructive" });
    },
  });

  // Calculate statistics
  const stats = {
    total: automations.length,
    running: automations.filter((a) => a.status === "running").length,
    completed: automations.filter((a) => a.status === "completed").length,
    totalProspects: automations.reduce((sum, a) => sum + a.prospectsAdded, 0),
    totalEmails: automations.reduce((sum, a) => sum + a.emailsSent, 0),
    totalReplies: automations.reduce((sum, a) => sum + a.repliesReceived, 0),
  };

  const getStatusBadge = (automation: AutomationRun) => {
    if (automation.isStopped) {
      return (
        <Badge variant="secondary" data-testid={`badge-status-stopped`}>
          <StopCircle className="w-3 h-3 mr-1" />
          Stopped
        </Badge>
      );
    }

    const variants = {
      running: "default",
      completed: "default",
      paused: "secondary",
      failed: "destructive",
    } as const;

    const labels = {
      running: "Running",
      completed: "Completed",
      paused: "Paused",
      failed: "Failed",
    };

    return (
      <Badge variant={variants[automation.status]} data-testid={`badge-status-${automation.status}`}>
        {automation.status === "running" && (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        )}
        {labels[automation.status]}
      </Badge>
    );
  };

  const getSuccessRate = (automation: AutomationRun) => {
    if (automation.emailsSent === 0) return 0;
    return Math.round(
      (automation.repliesReceived / automation.emailsSent) * 100
    );
  };

  const viewErrors = (automation: AutomationRun) => {
    setSelectedAutomation(automation);
    setShowErrorsDialog(true);
  };

  const viewRateLimit = (automation: AutomationRun) => {
    setSelectedAutomation(automation);
    setShowRateLimitDialog(true);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-8 max-w-7xl">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-7xl" data-testid="page-automation-dashboard">
      <Breadcrumbs />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Automation Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Monitor and manage your sequence automation runs
            </p>
          </div>
        </div>
        <Button asChild data-testid="button-back-sequences">
          <Link href="/sequences">← Back to Sequences</Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Automations
            </CardTitle>
            <ChartBar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.running} currently running
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Prospects
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-prospects">{stats.totalProspects}</div>
            <p className="text-xs text-muted-foreground">Added via automation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-emails">{stats.totalEmails}</div>
            <p className="text-xs text-muted-foreground">Across all automations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Replies Received
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-replies">{stats.totalReplies}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalEmails > 0
                ? Math.round((stats.totalReplies / stats.totalEmails) * 100)
                : 0}
              % reply rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Automation Table */}
      <Card>
        <CardHeader>
          <CardTitle>Automation Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {automations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CloudUpload className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No automations configured
              </h3>
              <p className="text-muted-foreground mb-6">
                Start your first automation from the Sequences page
              </p>
              <Button asChild data-testid="button-create-first">
                <Link href="/sequences">Go to Sequences</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Sequence</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Emails</TableHead>
                  <TableHead>Replies</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {automations.map((automation) => {
                  const hasErrors = automation.errorLog && automation.errorLog.length > 0;
                  const progress = Math.min(
                    (automation.prospectsAdded / automation.prospectCount) * 100,
                    100
                  );

                  return (
                    <TableRow key={automation.id} data-testid={`row-automation-${automation.id}`}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {getStatusBadge(automation)}
                          {hasErrors && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {automation.errorLog!.length} errors
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {automation.sequenceName || "Unknown Sequence"}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 min-w-[180px]">
                          <div className="text-sm">
                            {automation.prospectsAdded} / {automation.prospectCount} prospects
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-emails-${automation.id}`}>
                        {automation.emailsSent}
                      </TableCell>
                      <TableCell data-testid={`text-replies-${automation.id}`}>
                        {automation.repliesReceived}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" data-testid={`badge-rate-${automation.id}`}>
                          <TrendingUp className="w-3 h-3 mr-1" />
                          {getSuccessRate(automation)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(automation.startedAt).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(automation.startedAt).toLocaleTimeString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-actions-${automation.id}`}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {automation.status === "running" && !automation.isStopped && (
                              <>
                                <DropdownMenuItem onClick={() => pauseMutation.mutate(automation.id)}>
                                  <Pause className="w-4 h-4 mr-2" />
                                  Pause
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => stopMutation.mutate(automation.id)}>
                                  <StopCircle className="w-4 h-4 mr-2" />
                                  Stop
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            {automation.status === "paused" && !automation.isStopped && (
                              <>
                                <DropdownMenuItem onClick={() => resumeMutation.mutate(automation.id)}>
                                  <Play className="w-4 h-4 mr-2" />
                                  Resume
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => stopMutation.mutate(automation.id)}>
                                  <StopCircle className="w-4 h-4 mr-2" />
                                  Stop
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            {hasErrors && (
                              <DropdownMenuItem onClick={() => viewErrors(automation)}>
                                <AlertTriangle className="w-4 h-4 mr-2" />
                                View Errors ({automation.errorLog!.length})
                              </DropdownMenuItem>
                            )}
                            {hasErrors && (
                              <DropdownMenuItem onClick={() => retryMutation.mutate(automation.id)}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Retry Failed
                              </DropdownMenuItem>
                            )}
                            {(hasErrors || automation.status === "running") && <DropdownMenuSeparator />}
                            <DropdownMenuItem onClick={() => viewTimeline(automation)}>
                              <CalendarClock className="w-4 h-4 mr-2" />
                              View Timeline
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => viewRateLimit(automation)}>
                              <Clock className="w-4 h-4 mr-2" />
                              Rate Limits
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/sequences/${automation.sequenceId}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Sequence
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Error Dialog */}
      <Dialog open={showErrorsDialog} onOpenChange={setShowErrorsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Automation Errors</DialogTitle>
            <DialogDescription>
              Errors encountered during automation "{selectedAutomation?.sequenceName}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedAutomation?.errorLog?.map((error, index) => (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <p className="text-sm font-medium">{error.error}</p>
                      {error.prospectId && (
                        <p className="text-xs text-muted-foreground">
                          Prospect ID: {error.prospectId}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(error.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!selectedAutomation?.errorLog || selectedAutomation.errorLog.length === 0) && (
              <p className="text-center text-muted-foreground py-8">No errors found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rate Limit Dialog */}
      <Dialog open={showRateLimitDialog} onOpenChange={setShowRateLimitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rate Limit Status</DialogTitle>
            <DialogDescription>
              Daily sending limits for "{selectedAutomation?.sequenceName}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Daily Limit</span>
                      <span className="text-sm">
                        {selectedAutomation?.rateLimitConfig?.currentDailyCount || 0} / {selectedAutomation?.rateLimitConfig?.dailyLimit || 500}
                      </span>
                    </div>
                    <Progress 
                      value={(selectedAutomation?.rateLimitConfig?.currentDailyCount || 0) / (selectedAutomation?.rateLimitConfig?.dailyLimit || 500) * 100} 
                      className="h-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Remaining Today</p>
                      <p className="text-2xl font-bold">
                        {(selectedAutomation?.rateLimitConfig?.dailyLimit || 500) - (selectedAutomation?.rateLimitConfig?.currentDailyCount || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Delay Between Emails</p>
                      <p className="text-2xl font-bold">
                        {Math.round((selectedAutomation?.rateLimitConfig?.delayBetweenEmails || 30000) / 1000)}s
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">
              Rate limits reset daily at midnight UTC. This helps maintain sender reputation and avoid spam filters.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Timeline Dialog */}
      <Dialog open={showTimelineDialog} onOpenChange={setShowTimelineDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5" />
              Automation Timeline
            </DialogTitle>
            <DialogDescription>
              Email sequence timeline for "{selectedAutomation?.sequenceName}"
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Automation Info */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Started</p>
                    <p className="text-sm font-medium">
                      {selectedAutomation?.startedAt 
                        ? new Date(selectedAutomation.startedAt).toLocaleString()
                        : "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="mt-1">
                      {selectedAutomation && (
                        selectedAutomation.status === "paused" ? (
                          <Badge variant="secondary">
                            <Pause className="w-3 h-3 mr-1" />
                            Paused
                          </Badge>
                        ) : selectedAutomation.status === "running" ? (
                          <Badge variant="default">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Running
                          </Badge>
                        ) : (
                          <Badge variant="outline">{selectedAutomation.status}</Badge>
                        )
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">AI Personalization</p>
                    <div className="mt-1">
                      {selectedAutomation?.aiPersonalizationEnabled ? (
                        <Badge variant="default" className="bg-blue-500">
                          <Sparkles className="w-3 h-3 mr-1" />
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Delay Between Emails</p>
                    <p className="text-sm font-medium">
                      {Math.round((selectedAutomation?.rateLimitConfig?.delayBetweenEmails || 30000) / 1000)}s
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sequence Steps Timeline */}
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Timer className="w-4 h-4" />
                Email Steps Timeline
              </h3>
              
              {selectedAutomation?.sequenceSteps && selectedAutomation.sequenceSteps.length > 0 ? (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-8 bottom-8 w-0.5 bg-border" />
                  
                  <div className="space-y-4">
                    {selectedAutomation.sequenceSteps.map((step, index) => {
                      const scheduledTime = selectedAutomation.startedAt 
                        ? calculateScheduledTime(selectedAutomation.startedAt, index, selectedAutomation.sequenceSteps!)
                        : null;
                      const isFirstStep = index === 0;
                      const isPastSchedule = scheduledTime ? new Date() > scheduledTime : false;
                      
                      return (
                        <div key={step.id} className="relative pl-10">
                          {/* Timeline dot */}
                          <div className={`absolute left-2 top-3 w-4 h-4 rounded-full border-2 ${
                            isPastSchedule 
                              ? 'bg-green-500 border-green-500' 
                              : 'bg-background border-primary'
                          }`}>
                            {isPastSchedule && (
                              <CheckCircle className="w-3 h-3 text-white absolute -top-0.5 -left-0.5" />
                            )}
                          </div>
                          
                          <Card className={isPastSchedule ? 'border-green-200 bg-green-50/50 dark:bg-green-950/20' : ''}>
                            <CardContent className="pt-4 pb-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="text-xs">
                                      Step {step.stepOrder}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs capitalize">
                                      {step.stepType}
                                    </Badge>
                                    {!isFirstStep && (
                                      <Badge variant="outline" className="text-xs">
                                        <Timer className="w-3 h-3 mr-1" />
                                        {formatDelay(step.delayDays, step.delayHours)} after previous
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="font-medium text-sm truncate" title={step.subject}>
                                    {step.subject || "(No subject)"}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {step.body?.replace(/<[^>]*>/g, '').substring(0, 100) || "(No body)"}...
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs text-muted-foreground">Scheduled</p>
                                  <p className="text-sm font-medium">
                                    {scheduledTime?.toLocaleDateString()}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {scheduledTime?.toLocaleTimeString()}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <Card className="bg-muted/50">
                  <CardContent className="py-8 text-center">
                    <Mail className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">
                      No email steps found in this sequence.
                    </p>
                    <Button variant="link" asChild className="mt-2">
                      <Link href={`/sequences/${selectedAutomation?.sequenceId}`}>
                        Add steps to sequence →
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Pause/Resume Controls */}
            {selectedAutomation && !selectedAutomation.isStopped && (
              <div className="flex justify-end gap-2 pt-4 border-t">
                {selectedAutomation.status === "running" ? (
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      pauseMutation.mutate(selectedAutomation.id);
                      setShowTimelineDialog(false);
                    }}
                    data-testid="button-pause-from-timeline"
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Pause Automation
                  </Button>
                ) : selectedAutomation.status === "paused" ? (
                  <Button 
                    onClick={() => {
                      resumeMutation.mutate(selectedAutomation.id);
                      setShowTimelineDialog(false);
                    }}
                    data-testid="button-resume-from-timeline"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Resume Automation
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
