import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CoinsIcon, SparklesIcon, DatabaseIcon, InfoIcon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface CreditBalanceData {
  assigned: number;
  used: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
  costs: {
    email_generation: number;
    enrichment: number;
  };
}

export function CreditBalance() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery<CreditBalanceData>({
    queryKey: ["/api/credits/balance"],
    refetchInterval: 30000,
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-credit-balance-loading">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CoinsIcon className="w-4 h-4 text-amber-500" />
            Monthly Credits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-4 w-48" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return null;
  }

  const usedPercent = data.assigned > 0 ? Math.round((data.used / data.assigned) * 100) : 0;
  const remainingPercent = 100 - usedPercent;
  const isLow = data.remaining < data.assigned * 0.1;
  const isDepleted = data.remaining === 0;
  const isWarning = data.remaining < data.assigned * 0.25 && !isDepleted;

  const barColor = isDepleted
    ? "bg-red-500"
    : isLow
    ? "bg-orange-500"
    : isWarning
    ? "bg-yellow-500"
    : "bg-emerald-500";

  const periodEndDate = new Date(data.periodEnd);
  const daysUntilReset = Math.ceil(
    (periodEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Card
      data-testid="card-credit-balance"
      className={isDepleted ? "border-red-300 bg-red-50 dark:bg-red-950/20" : ""}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CoinsIcon className="w-4 h-4 text-amber-500" />
            Monthly Credits
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="w-4 h-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs space-y-1 text-xs">
                <p>Credits are consumed by AI actions:</p>
                <p className="flex items-center gap-1">
                  <SparklesIcon className="w-3 h-3 text-purple-500" />
                  AI email generation: {data.costs.email_generation} credits
                </p>
                <p className="flex items-center gap-1">
                  <DatabaseIcon className="w-3 h-3 text-blue-500" />
                  Prospect enrichment: {data.costs.enrichment} credit
                </p>
                <p className="text-muted-foreground mt-1">
                  Resets on the 1st of every month.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p
              className="text-2xl font-bold tabular-nums"
              data-testid="text-credits-remaining"
            >
              {data.remaining.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              of {data.assigned.toLocaleString()} remaining
            </p>
          </div>
          {isDepleted ? (
            <Badge variant="destructive" data-testid="badge-credits-depleted">
              Depleted
            </Badge>
          ) : isLow ? (
            <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" data-testid="badge-credits-low">
              Low
            </Badge>
          ) : isWarning ? (
            <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" data-testid="badge-credits-warning">
              Running Low
            </Badge>
          ) : (
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" data-testid="badge-credits-ok">
              Available
            </Badge>
          )}
        </div>

        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${remainingPercent}%` }}
              data-testid="progress-credits"
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span data-testid="text-credits-used">{data.used.toLocaleString()} used</span>
            <span data-testid="text-credits-reset">
              Resets in {daysUntilReset} day{daysUntilReset !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <SparklesIcon className="w-3 h-3 text-purple-400" />
            <span>Email gen: {data.costs.email_generation} cr</span>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <DatabaseIcon className="w-3 h-3 text-blue-400" />
            <span>Enrichment: {data.costs.enrichment} cr</span>
          </div>
        </div>

        {isDepleted && (
          <p className="text-xs text-red-600 dark:text-red-400 font-medium" data-testid="text-credits-depleted-msg">
            AI features are blocked until your credits reset on the 1st.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
