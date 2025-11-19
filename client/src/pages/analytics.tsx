import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Users, Mail, Sparkles, Target, Activity, ArrowLeft } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface AnalyticsOverview {
  totalProspects: number;
  totalSequences: number;
  totalEmailsSent: number;
  totalReplies: number;
  totalAICreditsUsed: number;
  activeSequences: number;
  averageReplyRate: number;
}

interface TimeSeriesData {
  date: string;
  prospects: number;
  emails: number;
  replies: number;
}

interface SequencePerformance {
  id: string;
  name: string;
  totalProspects: number;
  activeProspects: number;
  completedProspects: number;
  emailsSent: number;
  replies: number;
  replyRate: number;
}

interface ActivityLog {
  id: string;
  action: string;
  module: string;
  timestamp: Date;
  details: any;
}

interface UsageMetrics {
  prospects30Days: number;
  emails30Days: number;
  aiCredits30Days: number;
}

export default function AnalyticsPage() {
  const { data: overview, isLoading: overviewLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview"],
  });

  const { data: timeSeries, isLoading: timeSeriesLoading } = useQuery<TimeSeriesData[]>({
    queryKey: ["/api/analytics/time-series"],
  });

  const { data: sequencePerformance, isLoading: performanceLoading } = useQuery<SequencePerformance[]>({
    queryKey: ["/api/analytics/sequence-performance"],
  });

  const { data: activityLogs, isLoading: logsLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/analytics/activity-logs"],
  });

  const { data: usageMetrics, isLoading: usageLoading } = useQuery<UsageMetrics>({
    queryKey: ["/api/analytics/usage-metrics"],
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="text-analytics-title">
                Analytics Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Track your outreach performance and activity
              </p>
            </div>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-total-prospects">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Prospects
              </CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-prospects-count">
                  {overview?.totalProspects.toLocaleString() || 0}
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                All time
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-emails-sent">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Emails Sent
              </CardTitle>
              <Mail className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-emails-count">
                  {overview?.totalEmailsSent.toLocaleString() || 0}
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Total sent
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-reply-rate">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Reply Rate
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-reply-rate">
                  {overview?.averageReplyRate.toFixed(1) || 0}%
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {overview?.totalReplies || 0} total replies
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-ai-credits">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                AI Credits Used
              </CardTitle>
              <Sparkles className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-ai-credits">
                  {overview?.totalAICreditsUsed.toLocaleString() || 0}
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Personalization calls
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different analytics views */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="performance" data-testid="tab-performance">
              <Target className="h-4 w-4 mr-2" />
              Sequence Performance
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Activity className="h-4 w-4 mr-2" />
              Activity Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Time Series Chart */}
            <Card data-testid="card-activity-chart">
              <CardHeader>
                <CardTitle>Activity Over Time (Last 30 Days)</CardTitle>
                <CardDescription>
                  Track prospects added, emails sent, and replies received
                </CardDescription>
              </CardHeader>
              <CardContent>
                {timeSeriesLoading ? (
                  <Skeleton className="h-80 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="prospects" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        name="Prospects Added"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="emails" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        name="Emails Sent"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="replies" 
                        stroke="#8b5cf6" 
                        strokeWidth={2}
                        name="Replies Received"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Usage Metrics for Last 30 Days */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card data-testid="card-usage-prospects">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Prospects (30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {usageLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {usageMetrics?.prospects30Days.toLocaleString() || 0}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-usage-emails">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Emails (30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {usageLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {usageMetrics?.emails30Days.toLocaleString() || 0}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-usage-ai">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    AI Calls (30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {usageLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {usageMetrics?.aiCredits30Days.toLocaleString() || 0}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="performance">
            <Card data-testid="card-sequence-performance">
              <CardHeader>
                <CardTitle>Sequence Performance</CardTitle>
                <CardDescription>
                  Performance metrics for all your email sequences
                </CardDescription>
              </CardHeader>
              <CardContent>
                {performanceLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sequence Name</TableHead>
                        <TableHead className="text-right">Total Prospects</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                        <TableHead className="text-right">Completed</TableHead>
                        <TableHead className="text-right">Emails Sent</TableHead>
                        <TableHead className="text-right">Replies</TableHead>
                        <TableHead className="text-right">Reply Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sequencePerformance && sequencePerformance.length > 0 ? (
                        sequencePerformance.map((seq) => (
                          <TableRow key={seq.id} data-testid={`row-sequence-${seq.id}`}>
                            <TableCell className="font-medium">{seq.name}</TableCell>
                            <TableCell className="text-right">{seq.totalProspects}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20">
                                {seq.activeProspects}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20">
                                {seq.completedProspects}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{seq.emailsSent}</TableCell>
                            <TableCell className="text-right">{seq.replies}</TableCell>
                            <TableCell className="text-right">
                              <Badge 
                                variant={seq.replyRate > 10 ? "default" : "secondary"}
                                className={seq.replyRate > 10 ? "bg-green-600" : ""}
                              >
                                {seq.replyRate.toFixed(1)}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-gray-500 dark:text-gray-400 py-8">
                            No sequence data available yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card data-testid="card-activity-log">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  View your recent actions and system events
                </CardDescription>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activityLogs && activityLogs.length > 0 ? (
                      activityLogs.slice(0, 20).map((log) => (
                        <div
                          key={log.id}
                          className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                          data-testid={`log-${log.id}`}
                        >
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {log.action}
                              </p>
                              <Badge variant="outline" className="text-xs">
                                {log.module}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                        No activity logs available yet
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
