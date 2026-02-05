import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Mail,
  RefreshCw,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Bot,
} from "lucide-react";
import { CopilotPanel, CopilotButton } from "@/components/CopilotPanel";
import { format } from "date-fns";

interface HealthOverview {
  success: boolean;
  deliveryRate: number;
  failureRate: number;
  totalSent: number;
  totalFailed: number;
  queueDepth: number;
  stuckCount: number;
  retryCount: number;
  schedulerStatus: "healthy" | "delayed" | "down";
  lastHeartbeat?: string;
  trends: {
    deliveryTrend: "up" | "down" | "stable";
    failureTrend: "up" | "down" | "stable";
  };
}

interface FailedEmail {
  id: string;
  recipient: string;
  subject: string;
  errorCode: string;
  failureReason: string;
  failedAt: string;
  retryCount: number;
}

interface StuckEmail {
  id: string;
  recipient: string;
  status: string;
  stuckSince: string;
  stuckDuration: string;
}

interface RetryItem {
  id: string;
  recipient: string;
  retryCount: number;
  nextRetryAt: string;
  lastError: string;
}

interface ActiveAlert {
  type: string;
  message: string;
  severity: "warning" | "critical";
  threshold: number;
  currentValue: number;
  triggeredAt: string;
}

export default function HealthDashboard() {
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const overviewQuery = useQuery<{ success: boolean } & HealthOverview>({
    queryKey: ["/api/health/overview"],
  });

  const failedQuery = useQuery<{ success: boolean; emails: FailedEmail[] }>({
    queryKey: ["/api/health/failed-emails"],
    enabled: activeTab === "failed",
  });

  const stuckQuery = useQuery<{ success: boolean; emails: StuckEmail[] }>({
    queryKey: ["/api/health/stuck-emails"],
    enabled: activeTab === "stuck",
  });

  const retryQuery = useQuery<{ success: boolean; queue: RetryItem[] }>({
    queryKey: ["/api/health/retry-queue"],
    enabled: activeTab === "retry",
  });

  const alertsQuery = useQuery<{ success: boolean; alerts: ActiveAlert[] }>({
    queryKey: ["/api/alerts/active"],
  });

  const overview = overviewQuery.data;
  const alerts = alertsQuery.data?.alerts || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-600 dark:text-green-400";
      case "delayed":
        return "text-yellow-600 dark:text-yellow-400";
      case "down":
        return "text-red-600 dark:text-red-400";
      default:
        return "text-gray-600";
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-4 w-4" />;
      case "down":
        return <TrendingDown className="h-4 w-4" />;
      default:
        return <Minus className="h-4 w-4" />;
    }
  };

  const copilotContext = {
    page: (activeTab === "failed" ? "failed-emails" : 
           activeTab === "stuck" ? "stuck-queue" : 
           activeTab === "retry" ? "retry-queue" : "health") as "health" | "failed-emails" | "stuck-queue" | "retry-queue",
    email_ids: activeTab === "failed" 
      ? failedQuery.data?.emails?.slice(0, 10).map(e => e.id) 
      : activeTab === "stuck"
        ? stuckQuery.data?.emails?.slice(0, 10).map(e => e.id)
        : undefined,
    queue_ids: activeTab === "retry" 
      ? retryQuery.data?.queue?.slice(0, 10).map(q => q.id)
      : undefined,
    metrics: overview
      ? {
          deliveryRate: overview.deliveryRate,
          failureRate: overview.failureRate,
          queueDepth: overview.queueDepth,
          stuckCount: overview.stuckCount,
        }
      : undefined,
  };

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold" data-testid="health-dashboard-title">
              Health Dashboard
            </h1>
            <p className="text-muted-foreground">
              Monitor email delivery health and system status
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                overviewQuery.refetch();
                alertsQuery.refetch();
              }}
              disabled={overviewQuery.isFetching}
              data-testid="refresh-health-button"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${overviewQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setCopilotOpen(true)}
              data-testid="open-copilot-button"
            >
              <Bot className="h-4 w-4 mr-2" />
              Ask Copilot
            </Button>
          </div>
        </div>

        {alerts.length > 0 && (
          <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                Active Alerts ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {alerts.map((alert, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded-lg"
                    data-testid={`alert-${alert.type}`}
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={alert.severity === "critical" ? "destructive" : "secondary"}
                      >
                        {alert.severity}
                      </Badge>
                      <span className="font-medium">{alert.message}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(alert.triggeredAt), "HH:mm:ss")}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="metric-delivery-rate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {overviewQuery.isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">
                    {overview?.deliveryRate?.toFixed(1) || 0}%
                  </span>
                  <span
                    className={`flex items-center text-sm ${
                      overview?.trends?.deliveryTrend === "up"
                        ? "text-green-500"
                        : overview?.trends?.deliveryTrend === "down"
                          ? "text-red-500"
                          : "text-gray-500"
                    }`}
                  >
                    {getTrendIcon(overview?.trends?.deliveryTrend || "stable")}
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {overview?.totalSent || 0} sent total
              </p>
            </CardContent>
          </Card>

          <Card data-testid="metric-failure-rate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failure Rate</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              {overviewQuery.isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-2xl font-bold ${
                      (overview?.failureRate || 0) > 10 ? "text-red-600" : ""
                    }`}
                  >
                    {overview?.failureRate?.toFixed(1) || 0}%
                  </span>
                  <span
                    className={`flex items-center text-sm ${
                      overview?.trends?.failureTrend === "down"
                        ? "text-green-500"
                        : overview?.trends?.failureTrend === "up"
                          ? "text-red-500"
                          : "text-gray-500"
                    }`}
                  >
                    {getTrendIcon(overview?.trends?.failureTrend || "stable")}
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {overview?.totalFailed || 0} failed total
              </p>
            </CardContent>
          </Card>

          <Card data-testid="metric-queue-status">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Queue Status</CardTitle>
              <Mail className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {overviewQuery.isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{overview?.queueDepth || 0}</div>
              )}
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {overview?.stuckCount || 0} stuck
                </span>
                <span className="text-xs text-muted-foreground">
                  {overview?.retryCount || 0} retrying
                </span>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="metric-scheduler-status">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduler</CardTitle>
              <Activity
                className={`h-4 w-4 ${getStatusColor(overview?.schedulerStatus || "down")}`}
              />
            </CardHeader>
            <CardContent>
              {overviewQuery.isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div
                  className={`text-2xl font-bold capitalize ${getStatusColor(
                    overview?.schedulerStatus || "down"
                  )}`}
                >
                  {overview?.schedulerStatus || "Unknown"}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {overview?.lastHeartbeat
                  ? `Last heartbeat: ${format(new Date(overview.lastHeartbeat), "HH:mm:ss")}`
                  : "No heartbeat recorded"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="health-tabs">
            <TabsTrigger value="overview" data-testid="tab-overview">
              Overview
            </TabsTrigger>
            <TabsTrigger value="failed" data-testid="tab-failed">
              Failed ({overview?.totalFailed || 0})
            </TabsTrigger>
            <TabsTrigger value="stuck" data-testid="tab-stuck">
              Stuck ({overview?.stuckCount || 0})
            </TabsTrigger>
            <TabsTrigger value="retry" data-testid="tab-retry">
              Retry Queue ({overview?.retryCount || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Health Summary</CardTitle>
                <CardDescription>
                  Current status of your email delivery infrastructure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-medium">Delivery Performance</h4>
                    <p className="text-sm text-muted-foreground">
                      Your email delivery rate is at{" "}
                      <span className="font-semibold">
                        {overview?.deliveryRate?.toFixed(1) || 0}%
                      </span>
                      .
                      {(overview?.deliveryRate || 0) >= 95
                        ? " This is excellent performance."
                        : (overview?.deliveryRate || 0) >= 85
                          ? " Consider investigating failed emails."
                          : " This needs immediate attention."}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Queue Health</h4>
                    <p className="text-sm text-muted-foreground">
                      {(overview?.stuckCount || 0) === 0 && (overview?.retryCount || 0) === 0
                        ? "All queues are processing normally."
                        : `${overview?.stuckCount || 0} stuck and ${overview?.retryCount || 0} retrying emails need attention.`}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Scheduler Status</h4>
                    <p className="text-sm text-muted-foreground">
                      {overview?.schedulerStatus === "healthy"
                        ? "Email scheduler is running normally."
                        : overview?.schedulerStatus === "delayed"
                          ? "Scheduler is experiencing delays."
                          : "Scheduler may be down. Check system logs."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="failed">
            <Card>
              <CardHeader>
                <CardTitle>Failed Emails</CardTitle>
                <CardDescription>Recent email delivery failures</CardDescription>
              </CardHeader>
              <CardContent>
                {failedQuery.isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : failedQuery.data?.emails?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No failed emails to display.
                  </p>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {failedQuery.data?.emails?.map((email) => (
                        <div
                          key={email.id}
                          className="p-4 border rounded-lg"
                          data-testid={`failed-email-${email.id}`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{email.recipient}</p>
                              <p className="text-sm text-muted-foreground truncate max-w-md">
                                {email.subject}
                              </p>
                            </div>
                            <Badge variant="destructive">{email.errorCode}</Badge>
                          </div>
                          <p className="text-sm mt-2 text-red-600 dark:text-red-400">
                            {email.failureReason}
                          </p>
                          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                            <span>
                              <Clock className="h-3 w-3 inline mr-1" />
                              {format(new Date(email.failedAt), "MMM dd, HH:mm")}
                            </span>
                            <span>Retries: {email.retryCount}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stuck">
            <Card>
              <CardHeader>
                <CardTitle>Stuck Emails</CardTitle>
                <CardDescription>Emails that have been processing too long</CardDescription>
              </CardHeader>
              <CardContent>
                {stuckQuery.isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : stuckQuery.data?.emails?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No stuck emails. Queue is healthy.
                  </p>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {stuckQuery.data?.emails?.map((email) => (
                        <div
                          key={email.id}
                          className="p-4 border rounded-lg"
                          data-testid={`stuck-email-${email.id}`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{email.recipient}</p>
                              <p className="text-sm text-muted-foreground">
                                Status: {email.status}
                              </p>
                            </div>
                            <Badge variant="secondary">{email.stuckDuration}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Stuck since: {format(new Date(email.stuckSince), "MMM dd, HH:mm:ss")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="retry">
            <Card>
              <CardHeader>
                <CardTitle>Retry Queue</CardTitle>
                <CardDescription>Emails scheduled for retry</CardDescription>
              </CardHeader>
              <CardContent>
                {retryQuery.isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : retryQuery.data?.queue?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No emails in retry queue.
                  </p>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {retryQuery.data?.queue?.map((item) => (
                        <div
                          key={item.id}
                          className="p-4 border rounded-lg"
                          data-testid={`retry-item-${item.id}`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{item.recipient}</p>
                              <p className="text-sm text-red-600 dark:text-red-400">
                                {item.lastError}
                              </p>
                            </div>
                            <Badge variant="outline">Retry #{item.retryCount}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            <Clock className="h-3 w-3 inline mr-1" />
                            Next retry: {format(new Date(item.nextRetryAt), "MMM dd, HH:mm:ss")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <CopilotButton onClick={() => setCopilotOpen(true)} isOpen={copilotOpen} />
      <CopilotPanel
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        context={copilotContext}
      />
    </Layout>
  );
}
