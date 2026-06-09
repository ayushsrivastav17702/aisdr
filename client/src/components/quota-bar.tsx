import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { MailIcon, AlertTriangleIcon, ClockIcon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { formatDistanceToNow } from "date-fns";

interface QuotaBarData {
  emailsUsed: number;
  emailsLimit: number;
  enrollmentsUsed: number;
  enrollmentsLimit: number;
  resetTime: string;
  isPaused: boolean;
  hardStopReasons: string[];
  workflowStage: string;
}

export function QuotaBar() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<QuotaBarData>({
    queryKey: ["/api/sdr/quota-bar"],
    refetchInterval: 30000,
    enabled: !!user,
  });

  if (isLoading || !data) {
    return null;
  }

  const emailPercentage = data.emailsLimit > 0 
    ? Math.min((data.emailsUsed / data.emailsLimit) * 100, 100) 
    : 0;
  const isNearLimit = emailPercentage >= 80;
  const isAtLimit = emailPercentage >= 100;
  const hasHardStops = data.hardStopReasons.length > 0;

  const resetTimeFormatted = formatDistanceToNow(new Date(data.resetTime), { addSuffix: true });

  return (
    <div className="px-4 py-2 border-b bg-card" data-testid="quota-bar">
      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 flex-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 min-w-[200px]">
                  <MailIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1">
                    <Progress 
                      value={emailPercentage} 
                      className={`h-2 ${isAtLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-yellow-500' : ''}`}
                    />
                  </div>
                  <span className={`text-xs font-mono whitespace-nowrap ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                    {data.emailsUsed}/{data.emailsLimit}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-2">
                  <p className="font-medium">Daily Email Quota</p>
                  <p className="text-sm">
                    {data.emailsUsed} of {data.emailsLimit} emails sent today
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" />
                    Resets {resetTimeFormatted}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {hasHardStops && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="destructive" className="flex items-center gap-1 cursor-help">
                    <AlertTriangleIcon className="w-3 h-3" />
                    Paused
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-2">
                    <p className="font-medium">Campaign Paused</p>
                    <ul className="text-sm list-disc list-inside">
                      {data.hardStopReasons.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Stage:</span>
          <Badge variant="outline" className="text-xs">
            {data.workflowStage.charAt(0).toUpperCase() + data.workflowStage.slice(1)}
          </Badge>
        </div>
      </div>
    </div>
  );
}
