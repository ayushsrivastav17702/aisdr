import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Users, Mail, Sparkles, Target, Activity, ArrowLeft, Download, Calendar, MousePointer, Eye, MessageCircle, AlertTriangle, Shield, CalendarDays } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

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

interface EmailPerformanceMetrics {
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  totalBounced: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  meetingRate: number;
}

interface DomainHealth {
  domain: string;
  totalSent: number;
  bounceRate: number;
  spamRate: number;
  replyRate: number;
  score: number;
  status: "healthy" | "warning" | "critical";
}

interface TopContent {
  bestSubjects: { subject: string; openRate: number; sent: number }[];
  worstSubjects: { subject: string; openRate: number; sent: number }[];
}

interface DailySummary {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  positiveReplies: number;
  meetingRequests: number;
  unsubscribes: number;
}

interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  dailySummaries: DailySummary[];
  totals: EmailPerformanceMetrics;
  trend: {
    sentChange: number;
    openRateChange: number;
    replyRateChange: number;
  };
}

export default function AnalyticsPage() {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState("30");

  const { data: overview, isLoading: overviewLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview", { dateRange }],
  });

  const { data: timeSeries, isLoading: timeSeriesLoading } = useQuery<TimeSeriesData[]>({
    queryKey: ["/api/analytics/time-series", { dateRange }],
  });

  const { data: sequencePerformance, isLoading: performanceLoading } = useQuery<SequencePerformance[]>({
    queryKey: ["/api/analytics/sequence-performance", { dateRange }],
  });

  const { data: activityLogs, isLoading: logsLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/analytics/activity-logs"],
  });

  const { data: usageMetrics, isLoading: usageLoading } = useQuery<UsageMetrics>({
    queryKey: ["/api/analytics/usage-metrics"],
  });

  // Email Performance Queries
  const { data: emailPerformance, isLoading: emailPerformanceLoading } = useQuery<EmailPerformanceMetrics>({
    queryKey: ["/api/email-analytics/performance", { days: dateRange }],
  });

  const { data: domainHealth, isLoading: domainHealthLoading } = useQuery<DomainHealth[]>({
    queryKey: ["/api/email-analytics/domain-health"],
  });

  const { data: topContent, isLoading: topContentLoading } = useQuery<TopContent>({
    queryKey: ["/api/email-analytics/top-content"],
  });

  const { data: weeklySummary, isLoading: weeklySummaryLoading } = useQuery<WeeklySummary>({
    queryKey: ["/api/email-analytics/weekly-summary"],
  });

  const handleExportCSV = () => {
    if (!overview) return;

    const csvData = [
      ['Metric', 'Value'],
      ['Total Prospects', overview.totalProspects],
      ['Total Sequences', overview.totalSequences],
      ['Total Emails Sent', overview.totalEmailsSent],
      ['Total Replies', overview.totalReplies],
      ['Active Sequences', overview.activeSequences],
      ['Average Reply Rate', `${overview.averageReplyRate.toFixed(2)}%`],
      ['AI Credits Used', overview.totalAICreditsUsed],
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `analytics_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export successful",
      description: "Analytics data has been exported to CSV",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <Breadcrumbs />
        
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
          
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]" data-testid="select-date-range">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            
            <Button onClick={handleExportCSV} variant="outline" data-testid="button-export-csv">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
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
            <TabsTrigger value="email-performance" data-testid="tab-email-performance">
              <Mail className="h-4 w-4 mr-2" />
              Email Performance
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

          <TabsContent value="email-performance" className="space-y-4">
            {/* Email Performance Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card data-testid="card-open-rate">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Open Rate
                  </CardTitle>
                  <Eye className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  {emailPerformanceLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-open-rate">
                      {emailPerformance?.openRate || 0}%
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {emailPerformance?.totalOpened || 0} of {emailPerformance?.totalSent || 0}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-click-rate">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Click Rate
                  </CardTitle>
                  <MousePointer className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  {emailPerformanceLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-click-rate">
                      {emailPerformance?.clickRate || 0}%
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {emailPerformance?.totalClicked || 0} clicks
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-email-reply-rate">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Reply Rate
                  </CardTitle>
                  <MessageCircle className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  {emailPerformanceLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-email-reply-rate">
                      {emailPerformance?.replyRate || 0}%
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {emailPerformance?.totalReplied || 0} replies
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-bounce-rate">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Bounce Rate
                  </CardTitle>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  {emailPerformanceLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className={`text-2xl font-bold ${(emailPerformance?.bounceRate || 0) > 5 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`} data-testid="text-bounce-rate">
                      {emailPerformance?.bounceRate || 0}%
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {emailPerformance?.totalBounced || 0} bounced
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-meeting-rate">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Meeting Rate
                  </CardTitle>
                  <CalendarDays className="h-4 w-4 text-amber-600" />
                </CardHeader>
                <CardContent>
                  {emailPerformanceLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-meeting-rate">
                      {emailPerformance?.meetingRate || 0}%
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Meetings booked
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Weekly Summary Chart */}
            <Card data-testid="card-weekly-summary">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Weekly Performance</CardTitle>
                    <CardDescription>
                      {weeklySummary ? `${weeklySummary.weekStart} to ${weeklySummary.weekEnd}` : 'Loading...'}
                    </CardDescription>
                  </div>
                  {weeklySummary?.trend && (
                    <div className="flex gap-4 text-sm">
                      <div className={`flex items-center gap-1 ${weeklySummary.trend.sentChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <TrendingUp className="h-4 w-4" />
                        <span>{weeklySummary.trend.sentChange >= 0 ? '+' : ''}{weeklySummary.trend.sentChange}% sent</span>
                      </div>
                      <div className={`flex items-center gap-1 ${weeklySummary.trend.openRateChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <span>{weeklySummary.trend.openRateChange >= 0 ? '+' : ''}{weeklySummary.trend.openRateChange}% opens</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {weeklySummaryLoading ? (
                  <Skeleton className="h-80 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={weeklySummary?.dailySummaries || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { weekday: 'short' })}
                      />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <Legend />
                      <Bar dataKey="sent" name="Sent" fill="#3b82f6" />
                      <Bar dataKey="opened" name="Opened" fill="#10b981" />
                      <Bar dataKey="replied" name="Replied" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Domain Health */}
              <Card data-testid="card-domain-health">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Domain Health
                  </CardTitle>
                  <CardDescription>
                    Deliverability score for your sending domains
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {domainHealthLoading ? (
                    <div className="space-y-4">
                      {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {domainHealth && domainHealth.length > 0 ? (
                        domainHealth.map((domain) => (
                          <div key={domain.domain} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700" data-testid={`domain-health-${domain.domain}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-900 dark:text-white">{domain.domain}</span>
                              <Badge 
                                variant={domain.status === 'healthy' ? 'default' : domain.status === 'warning' ? 'outline' : 'destructive'}
                                className={domain.status === 'healthy' ? 'bg-green-600' : ''}
                              >
                                {domain.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <Progress value={domain.score} className="h-2 flex-1" />
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{domain.score}/100</span>
                            </div>
                            <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                              <span>{domain.totalSent} sent</span>
                              <span>Bounce: {domain.bounceRate}%</span>
                              <span>Reply: {domain.replyRate}%</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                          No domain health data available yet
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Performing Content */}
              <Card data-testid="card-top-content">
                <CardHeader>
                  <CardTitle>Subject Line Performance</CardTitle>
                  <CardDescription>
                    Best and worst performing subject lines
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {topContentLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Best Performing */}
                      <div>
                        <h4 className="text-sm font-medium text-green-600 dark:text-green-400 mb-2 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Best Performing
                        </h4>
                        <div className="space-y-2">
                          {topContent?.bestSubjects && topContent.bestSubjects.length > 0 ? (
                            topContent.bestSubjects.slice(0, 3).map((subject, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 rounded bg-green-50 dark:bg-green-900/20" data-testid={`best-subject-${idx}`}>
                                <span className="text-sm text-gray-900 dark:text-white truncate max-w-[60%]">{subject.subject}</span>
                                <div className="flex items-center gap-2 text-xs">
                                  <Badge variant="outline" className="bg-white dark:bg-gray-800">{subject.sent} sent</Badge>
                                  <Badge className="bg-green-600">{subject.openRate}% open</Badge>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-gray-500">No data yet (min 5 sends)</div>
                          )}
                        </div>
                      </div>

                      {/* Worst Performing */}
                      <div>
                        <h4 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Needs Improvement
                        </h4>
                        <div className="space-y-2">
                          {topContent?.worstSubjects && topContent.worstSubjects.length > 0 ? (
                            topContent.worstSubjects.slice(0, 3).map((subject, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 rounded bg-red-50 dark:bg-red-900/20" data-testid={`worst-subject-${idx}`}>
                                <span className="text-sm text-gray-900 dark:text-white truncate max-w-[60%]">{subject.subject}</span>
                                <div className="flex items-center gap-2 text-xs">
                                  <Badge variant="outline" className="bg-white dark:bg-gray-800">{subject.sent} sent</Badge>
                                  <Badge variant="destructive">{subject.openRate}% open</Badge>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-gray-500">No data yet (min 5 sends)</div>
                          )}
                        </div>
                      </div>
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
