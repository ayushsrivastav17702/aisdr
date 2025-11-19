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
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
}

export default function AutomationDashboard() {
  const { toast } = useToast();
  const [selectedAutomation, setSelectedAutomation] = useState<AutomationRun | null>(null);
  const [showErrorsDialog, setShowErrorsDialog] = useState(false);
  const [showRateLimitDialog, setShowRateLimitDialog] = useState(false);

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
    </div>
  );
}
