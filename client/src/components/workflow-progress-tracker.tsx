import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, CheckCircle2, Circle, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface WorkflowStage {
  key: string;
  name: string;
  description: string;
  status: "completed" | "current" | "pending" | "blocked";
  completedAt: string | null;
  index: number;
}

interface BlockingReason {
  code: string;
  message: string;
  module: string;
  severity: "error" | "warning";
  metadata?: Record<string, unknown>;
}

interface WorkflowProgressData {
  currentStage: string;
  currentStageIndex: number;
  totalStages: number;
  progressPercent: number;
  completedCount: number;
  stages: WorkflowStage[];
  blockingReasons: BlockingReason[];
  createdAt: string | null;
  updatedAt: string | null;
}

const stageFixActions: Record<string, { label: string; href: string }> = {
  readiness: { label: "Configure Mailbox", href: "/settings/mailbox" },
  upload: { label: "Upload Prospects", href: "/prospects" },
  enrichment: { label: "Start Enrichment", href: "/prospects" },
  sequence: { label: "Create Sequence", href: "/sequences/new" },
  enrollment: { label: "Enroll Prospects", href: "/sequences" },
  activation: { label: "Activate Sequence", href: "/sequences" },
  sending: { label: "View Campaigns", href: "/campaigns" },
  replies: { label: "View Inbox", href: "/inbox" },
  analytics: { label: "View Analytics", href: "/analytics" },
};

export function WorkflowProgressTracker() {
  const { data, isLoading, refetch } = useQuery<WorkflowProgressData>({
    queryKey: ["/api/sdr/workflow-progress"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading Workflow Progress...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workflow Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No workflow data available. Start by completing your profile setup.</p>
        </CardContent>
      </Card>
    );
  }

  const getStageIcon = (status: WorkflowStage["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "current":
        return <Circle className="h-5 w-5 text-blue-500 fill-blue-500" />;
      case "blocked":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const hasBlockers = data.blockingReasons.some(r => r.severity === "error");

  return (
    <Card data-testid="card-workflow-progress">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            SDR Workflow Progress
            <Badge variant={hasBlockers ? "destructive" : "secondary"} data-testid="badge-workflow-progress">
              {data.completedCount}/{data.totalStages} Complete
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} data-testid="button-refresh-workflow">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2">
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all duration-500",
                hasBlockers ? "bg-red-500" : "bg-green-500"
              )}
              style={{ width: `${data.progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {data.progressPercent}% complete
            {data.updatedAt && (
              <span> · Updated {formatDistanceToNow(new Date(data.updatedAt), { addSuffix: true })}</span>
            )}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="relative">
            <div className="flex items-center justify-between mb-6 overflow-x-auto pb-2">
              {data.stages.map((stage, idx) => (
                <div key={stage.key} className="flex items-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className={cn(
                          "flex flex-col items-center cursor-pointer",
                          "min-w-[60px] px-1"
                        )}
                        data-testid={`stage-${stage.key}`}
                      >
                        <div className={cn(
                          "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all",
                          stage.status === "completed" && "border-green-500 bg-green-50 dark:bg-green-950",
                          stage.status === "current" && "border-blue-500 bg-blue-50 dark:bg-blue-950",
                          stage.status === "blocked" && "border-red-500 bg-red-50 dark:bg-red-950",
                          stage.status === "pending" && "border-muted-foreground/30"
                        )}>
                          {getStageIcon(stage.status)}
                        </div>
                        <span className={cn(
                          "text-xs mt-1 text-center font-medium",
                          stage.status === "current" && "text-blue-600 dark:text-blue-400",
                          stage.status === "blocked" && "text-red-600 dark:text-red-400",
                          stage.status === "completed" && "text-green-600 dark:text-green-400",
                          stage.status === "pending" && "text-muted-foreground"
                        )}>
                          {stage.name}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[200px]">
                      <div className="text-sm">
                        <p className="font-medium">{stage.name}</p>
                        <p className="text-muted-foreground">{stage.description}</p>
                        {stage.completedAt && (
                          <p className="text-xs mt-1">
                            Completed {formatDistanceToNow(new Date(stage.completedAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  {idx < data.stages.length - 1 && (
                    <ArrowRight className={cn(
                      "h-4 w-4 mx-1 flex-shrink-0",
                      data.stages[idx + 1].status !== "pending" ? "text-green-500" : "text-muted-foreground/30"
                    )} />
                  )}
                </div>
              ))}
            </div>

            {data.blockingReasons.length > 0 && (
              <div className="mt-4 space-y-2" data-testid="workflow-blockers">
                <p className="text-sm font-medium flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Blocking Issues
                </p>
                {data.blockingReasons.map((reason, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      "flex items-start gap-2 p-2 rounded text-sm",
                      reason.severity === "error" ? "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800" : "bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800"
                    )}
                    data-testid={`blocker-${idx}`}
                  >
                    {reason.severity === "error" ? (
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{reason.message}</p>
                      <p className="text-xs text-muted-foreground">Module: {reason.module} · Code: {reason.code}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {data.currentStage && stageFixActions[data.currentStage] && (
              <div className="mt-4 flex justify-end">
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => window.location.href = stageFixActions[data.currentStage].href}
                  data-testid="button-workflow-action"
                >
                  {stageFixActions[data.currentStage].label}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
