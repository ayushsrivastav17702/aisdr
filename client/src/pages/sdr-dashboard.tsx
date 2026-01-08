import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import { 
  MailIcon, 
  MessageSquareIcon, 
  TrendingUpIcon, 
  AlertCircleIcon,
  PlayIcon,
  PauseIcon,
  AlertTriangleIcon,
  SparklesIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ArrowRightIcon,
  ClockIcon,
  ZapIcon,
  TargetIcon,
  BarChart3Icon,
  RefreshCwIcon
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { WorkflowProgressTracker } from "@/components/workflow-progress-tracker";
import { PersonalAnalytics } from "@/components/personal-analytics";

interface EmailActivityStats {
  emailsSentToday: number;
  emailsSentThisWeek: number;
  repliesReceivedToday: number;
  repliesReceivedThisWeek: number;
  openRate7Days: number;
  openRate30Days: number;
  replyRate7Days: number;
  replyRate30Days: number;
}

interface QuotaSnapshot {
  emailsUsed: number;
  emailsLimit: number;
  activeEnrollments: number;
  enrollmentLimit: number;
  activeCampaigns: number;
  campaignLimit: number;
  resetTime: string;
  hardStopReasons: string[];
}

interface CampaignHealth {
  running: number;
  paused: number;
  blocked: number;
  draft: number;
  blockedSequences: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
}

interface PersonalizationUsage {
  totalEmails: number;
  personalizedEmails: number;
  personalizationRate: number;
  missingTokenFailures: number;
}

interface SDRDashboardData {
  emailActivity: EmailActivityStats;
  quotaSnapshot: QuotaSnapshot;
  campaignHealth: CampaignHealth;
  personalizationUsage: PersonalizationUsage;
  workflowStage: {
    currentStage: string;
    blockingReasons: any[];
  } | null;
}

function QuotaBar({ used, limit, label, icon: Icon }: { 
  used: number; 
  limit: number; 
  label: string; 
  icon: any 
}) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{label}</span>
        </div>
        <span className={`font-mono ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-yellow-600' : 'text-muted-foreground'}`}>
          {used} / {limit}
        </span>
      </div>
      <Progress 
        value={percentage} 
        className={`h-2 ${isAtLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-yellow-500' : ''}`}
      />
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  testId 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: any; 
  trend?: { value: number; label: string };
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="text-2xl font-bold mt-1">{value}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
        {trend && (
          <div className="flex items-center gap-1 mt-3 text-xs">
            <TrendingUpIcon className={`w-3 h-3 ${trend.value >= 0 ? 'text-green-500' : 'text-red-500'}`} />
            <span className={trend.value >= 0 ? 'text-green-500' : 'text-red-500'}>
              {trend.value >= 0 ? '+' : ''}{trend.value}%
            </span>
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SDRDashboard() {
  const { data, isLoading, error, refetch } = useQuery<SDRDashboardData>({
    queryKey: ["/api/sdr/dashboard"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertTitle>Error loading dashboard</AlertTitle>
          <AlertDescription>
            Failed to load your dashboard data. Please try again.
            <Button variant="outline" size="sm" className="ml-4" onClick={() => refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { emailActivity, quotaSnapshot, campaignHealth, personalizationUsage, workflowStage } = data!;

  const hasHardStops = quotaSnapshot.hardStopReasons.length > 0;
  const emailUsagePercent = quotaSnapshot.emailsLimit > 0 
    ? Math.round((quotaSnapshot.emailsUsed / quotaSnapshot.emailsLimit) * 100) 
    : 0;
  const resetTimeFormatted = formatDistanceToNow(new Date(quotaSnapshot.resetTime), { addSuffix: true });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">My Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Track your performance and quota usage
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-dashboard">
          <RefreshCwIcon className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {hasHardStops && (
        <Alert variant="destructive" data-testid="alert-hard-stops">
          <AlertTriangleIcon className="h-4 w-4" />
          <AlertTitle>Campaigns Paused</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {quotaSnapshot.hardStopReasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Emails Sent Today"
          value={emailActivity.emailsSentToday}
          subtitle={`${emailActivity.emailsSentThisWeek} this week`}
          icon={MailIcon}
          testId="card-emails-sent"
        />
        <StatCard
          title="Replies Received"
          value={emailActivity.repliesReceivedToday}
          subtitle={`${emailActivity.repliesReceivedThisWeek} this week`}
          icon={MessageSquareIcon}
          testId="card-replies-received"
        />
        <StatCard
          title="Open Rate (7d)"
          value={`${emailActivity.openRate7Days}%`}
          subtitle={`${emailActivity.openRate30Days}% over 30 days`}
          icon={TargetIcon}
          testId="card-open-rate"
        />
        <StatCard
          title="Reply Rate (7d)"
          value={`${emailActivity.replyRate7Days}%`}
          subtitle={`${emailActivity.replyRate30Days}% over 30 days`}
          icon={TrendingUpIcon}
          testId="card-reply-rate"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-quota-snapshot">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ZapIcon className="w-5 h-5" />
                  Quota Usage
                </CardTitle>
                <CardDescription>
                  Resets {resetTimeFormatted}
                </CardDescription>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant={emailUsagePercent >= 80 ? "destructive" : "secondary"}>
                      {emailUsagePercent}% used
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Daily email usage</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuotaBar 
              used={quotaSnapshot.emailsUsed} 
              limit={quotaSnapshot.emailsLimit} 
              label="Daily Emails" 
              icon={MailIcon}
            />
            <QuotaBar 
              used={quotaSnapshot.activeEnrollments} 
              limit={quotaSnapshot.enrollmentLimit} 
              label="Active Enrollments" 
              icon={PlayIcon}
            />
            <QuotaBar 
              used={quotaSnapshot.activeCampaigns} 
              limit={quotaSnapshot.campaignLimit} 
              label="Active Campaigns" 
              icon={BarChart3Icon}
            />
          </CardContent>
        </Card>

        <Card data-testid="card-campaign-health">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3Icon className="w-5 h-5" />
              Campaign Health
            </CardTitle>
            <CardDescription>Status of your sequences</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10">
                <PlayIcon className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold text-green-500">{campaignHealth.running}</p>
                  <p className="text-xs text-muted-foreground">Running</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10">
                <PauseIcon className="w-5 h-5 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold text-yellow-500">{campaignHealth.paused}</p>
                  <p className="text-xs text-muted-foreground">Paused</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10">
                <AlertTriangleIcon className="w-5 h-5 text-red-500" />
                <div>
                  <p className="text-2xl font-bold text-red-500">{campaignHealth.blocked}</p>
                  <p className="text-xs text-muted-foreground">Blocked</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <ClockIcon className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{campaignHealth.draft}</p>
                  <p className="text-xs text-muted-foreground">Draft</p>
                </div>
              </div>
            </div>

            {campaignHealth.blockedSequences.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium text-destructive mb-2">Blocked Campaigns</p>
                <div className="space-y-2">
                  {campaignHealth.blockedSequences.map((seq) => (
                    <Link key={seq.id} href={`/sequences?id=${seq.id}`}>
                      <div className="flex items-center justify-between p-2 rounded bg-destructive/10 hover:bg-destructive/20 cursor-pointer transition-colors">
                        <div className="flex items-center gap-2">
                          <XCircleIcon className="w-4 h-4 text-destructive" />
                          <span className="text-sm font-medium">{seq.name}</span>
                        </div>
                        <ArrowRightIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t">
              <Link href="/sequences">
                <Button variant="outline" className="w-full" data-testid="button-view-campaigns">
                  View All Campaigns
                  <ArrowRightIcon className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-personalization">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SparklesIcon className="w-5 h-5" />
              AI Personalization
            </CardTitle>
            <CardDescription>Email personalization usage (30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-3xl font-bold">{personalizationUsage.personalizationRate}%</p>
                <p className="text-sm text-muted-foreground">Personalization Rate</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold">{personalizationUsage.personalizedEmails}</p>
                <p className="text-xs text-muted-foreground">of {personalizationUsage.totalEmails} emails</p>
              </div>
            </div>
            <Progress value={personalizationUsage.personalizationRate} className="h-3" />
            
            {personalizationUsage.missingTokenFailures > 0 && (
              <Alert className="mt-4" variant="destructive">
                <AlertCircleIcon className="h-4 w-4" />
                <AlertDescription>
                  {personalizationUsage.missingTokenFailures} emails failed due to missing tokens
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <WorkflowProgressTracker />
      </div>

      <PersonalAnalytics />
    </div>
  );
}
