import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface SchedulerHealth {
  status: "healthy" | "delayed" | "down";
  lastHeartbeat: string | null;
  processedCount: number;
  failedCount: number;
  failureRate15m: number;
  alertActive: boolean;
}

interface SchedulerHealthResponse {
  success: boolean;
  emailQueue: SchedulerHealth | null;
  schedulers: Array<{
    schedulerType: string;
    status: "healthy" | "delayed" | "down";
    lastHeartbeat: Date | null;
    processedCount: number;
    failedCount: number;
    failureRate15m: number;
    alertActive: boolean;
  }>;
}

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "Never";
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

export function SchedulerStatusIndicator() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery<SchedulerHealthResponse>({
    queryKey: ["/api/scheduler/health"],
    refetchInterval: 30000,
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1" data-testid="scheduler-status-loading">
        <Clock className="h-3 w-3 animate-spin" />
        <span>Loading...</span>
      </Badge>
    );
  }

  if (error || !data?.emailQueue) {
    return (
      <Badge variant="destructive" className="gap-1" data-testid="scheduler-status-error">
        <XCircle className="h-3 w-3" />
        <span>Unknown</span>
      </Badge>
    );
  }

  const { emailQueue } = data;
  const statusConfig = {
    healthy: {
      variant: "default" as const,
      icon: CheckCircle2,
      label: "Healthy",
      color: "text-green-500",
      bgColor: "bg-green-500/10 border-green-500/30",
    },
    delayed: {
      variant: "secondary" as const,
      icon: Clock,
      label: "Delayed",
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10 border-yellow-500/30",
    },
    down: {
      variant: "destructive" as const,
      icon: AlertCircle,
      label: "Down",
      color: "text-red-500",
      bgColor: "bg-red-500/10 border-red-500/30",
    },
  };

  const config = statusConfig[emailQueue.status] || statusConfig.down;
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline"
            className={`gap-1 cursor-help ${config.bgColor}`}
            data-testid="scheduler-status-indicator"
          >
            <Icon className={`h-3 w-3 ${config.color}`} />
            <span className="text-xs">Scheduler: {config.label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-2 text-sm">
            <div className="font-semibold">Email Scheduler Status</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Status:</span>
              <span className={config.color}>{config.label}</span>
              
              <span className="text-muted-foreground">Last heartbeat:</span>
              <span>{formatTimeAgo(emailQueue.lastHeartbeat)}</span>
              
              <span className="text-muted-foreground">Processed:</span>
              <span>{emailQueue.processedCount.toLocaleString()}</span>
              
              <span className="text-muted-foreground">Failed:</span>
              <span>{emailQueue.failedCount.toLocaleString()}</span>
              
              <span className="text-muted-foreground">Failure rate (15m):</span>
              <span>{(emailQueue.failureRate15m * 100).toFixed(1)}%</span>
            </div>
            {emailQueue.alertActive && (
              <div className="text-yellow-500 flex items-center gap-1 mt-2">
                <AlertCircle className="h-3 w-3" />
                <span>Alert active - check admin dashboard</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SchedulerStatusBadge({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<SchedulerHealthResponse>({
    queryKey: ["/api/scheduler/health"],
    refetchInterval: 30000,
    enabled: !!user,
  });

  if (isLoading || !data?.emailQueue) {
    return null;
  }

  const { emailQueue } = data;

  if (emailQueue.status === "healthy" && compact) {
    return null;
  }

  const statusConfig = {
    healthy: {
      className: "bg-green-500",
      label: "Healthy",
    },
    delayed: {
      className: "bg-yellow-500",
      label: "Delayed",
    },
    down: {
      className: "bg-red-500 animate-pulse",
      label: "Down",
    },
  };

  const config = statusConfig[emailQueue.status] || statusConfig.down;

  if (compact) {
    return (
      <span 
        className={`inline-block h-2 w-2 rounded-full ${config.className}`}
        title={`Scheduler: ${config.label}`}
        data-testid="scheduler-status-dot"
      />
    );
  }

  return <SchedulerStatusIndicator />;
}
