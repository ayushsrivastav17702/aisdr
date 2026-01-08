import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus, Mail, Eye, MessageSquare, Download, BarChart3, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { format, parseISO } from "date-fns";

interface TrendPoint {
  date: string;
  sent: number;
  opened: number;
  replied: number;
  openRate: number;
  replyRate: number;
}

interface Summary {
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  openRate: number;
  replyRate: number;
  sentChange: number;
  openRateChange: number;
  replyRateChange: number;
}

interface TopSequence {
  id: string | null;
  name: string;
  sent: number;
  opened: number;
  replied: number;
  openRate: number;
  replyRate: number;
}

interface AnalyticsData {
  period: string;
  startDate: string;
  endDate: string;
  trends: TrendPoint[];
  summary: Summary;
  topSequences: TopSequence[];
}

interface TeamBenchmark {
  period: string;
  you: {
    totalSent: number;
    openRate: number;
    replyRate: number;
  };
  teamAverage: {
    totalSent: number;
    openRate: number;
    replyRate: number;
  };
  comparison: {
    sentVsTeam: number;
    openRateVsTeam: number;
    replyRateVsTeam: number;
  };
  teamSize: number;
}

function ChangeIndicator({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value > 0) {
    return (
      <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
        <TrendingUp className="h-3 w-3" />
        +{value}{suffix}
      </span>
    );
  } else if (value < 0) {
    return (
      <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs">
        <TrendingDown className="h-3 w-3" />
        {value}{suffix}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      <Minus className="h-3 w-3" />
      No change
    </span>
  );
}

function MetricCard({ 
  title, 
  value, 
  change, 
  icon: Icon,
  suffix = ""
}: { 
  title: string; 
  value: number | string; 
  change: number;
  icon: any;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      <div className="p-2 bg-primary/10 rounded-full">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}{suffix}</p>
        <ChangeIndicator value={change} suffix={title.includes("Rate") ? " pts" : "%"} />
      </div>
    </div>
  );
}

export function PersonalAnalytics() {
  const [period, setPeriod] = useState("30d");
  
  const { data, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ["/api/sdr/analytics", period],
    queryFn: async () => {
      const res = await fetch(`/api/sdr/analytics?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    }
  });
  
  const { data: benchmarkData, isLoading: benchmarkLoading } = useQuery<TeamBenchmark>({
    queryKey: ["/api/sdr/team-benchmark", period],
    queryFn: async () => {
      const res = await fetch(`/api/sdr/team-benchmark?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch benchmark");
      return res.json();
    }
  });

  const exportData = () => {
    if (!data) return;
    
    const csvContent = [
      ["Date", "Emails Sent", "Opened", "Replied", "Open Rate (%)", "Reply Rate (%)"],
      ...data.trends.map(t => [t.date, t.sent, t.opened, t.replied, t.openRate, t.replyRate])
    ].map(row => row.join(",")).join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-analytics-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Personal Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-8 w-32" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-64" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Personal Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No analytics data available yet. Start sending emails to see your performance trends.</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.trends.map(t => ({
    ...t,
    dateLabel: format(parseISO(t.date), "MMM d")
  }));

  return (
    <Card data-testid="card-personal-analytics">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Personal Analytics
            </CardTitle>
            <CardDescription>
              Your email performance over time
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => { setPeriod(v); }}>
              <SelectTrigger className="w-32" data-testid="select-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportData} data-testid="button-export">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Emails Sent"
            value={data.summary.totalSent}
            change={data.summary.sentChange}
            icon={Mail}
          />
          <MetricCard
            title="Open Rate"
            value={data.summary.openRate}
            change={data.summary.openRateChange}
            icon={Eye}
            suffix="%"
          />
          <MetricCard
            title="Reply Rate"
            value={data.summary.replyRate}
            change={data.summary.replyRateChange}
            icon={MessageSquare}
            suffix="%"
          />
        </div>

        <div className="h-64" data-testid="chart-trends">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="dateLabel" 
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <YAxis 
                yAxisId="left"
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
                domain={[0, 100]}
                unit="%"
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--card))", 
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px"
                }}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="sent" 
                name="Emails Sent"
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={false}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="openRate" 
                name="Open Rate %"
                stroke="#22c55e" 
                strokeWidth={2}
                dot={false}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="replyRate" 
                name="Reply Rate %"
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {data.topSequences.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3">Top Performing Sequences</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sequence</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Open Rate</TableHead>
                  <TableHead className="text-right">Reply Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topSequences.map((seq, idx) => (
                  <TableRow key={seq.id || idx} data-testid={`row-sequence-${idx}`}>
                    <TableCell className="font-medium">{seq.name}</TableCell>
                    <TableCell className="text-right">{seq.sent}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={seq.openRate >= 50 ? "default" : seq.openRate >= 25 ? "secondary" : "outline"}>
                        {seq.openRate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={seq.replyRate >= 10 ? "default" : seq.replyRate >= 5 ? "secondary" : "outline"}>
                        {seq.replyRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        
        {/* Team Comparison Section - TC-SDR-AN-03 */}
        <div className="border-t pt-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h4 className="font-semibold">Team Comparison</h4>
            <Badge variant="secondary" className="text-xs">Anonymized</Badge>
          </div>
          
          {benchmarkLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : benchmarkData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border rounded-lg p-4" data-testid="benchmark-sent">
                  <p className="text-sm text-muted-foreground mb-1">Emails Sent</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{benchmarkData.you.totalSent}</span>
                    <span className="text-sm text-muted-foreground">vs team avg {benchmarkData.teamAverage.totalSent}</span>
                  </div>
                  <div className={cn(
                    "text-sm mt-1",
                    benchmarkData.comparison.sentVsTeam > 0 ? "text-green-600" : benchmarkData.comparison.sentVsTeam < 0 ? "text-red-600" : "text-muted-foreground"
                  )}>
                    {benchmarkData.comparison.sentVsTeam > 0 ? "+" : ""}{benchmarkData.comparison.sentVsTeam}% vs team
                  </div>
                </div>
                
                <div className="border rounded-lg p-4" data-testid="benchmark-open-rate">
                  <p className="text-sm text-muted-foreground mb-1">Open Rate</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{benchmarkData.you.openRate}%</span>
                    <span className="text-sm text-muted-foreground">vs team avg {benchmarkData.teamAverage.openRate}%</span>
                  </div>
                  <div className={cn(
                    "text-sm mt-1",
                    benchmarkData.comparison.openRateVsTeam > 0 ? "text-green-600" : benchmarkData.comparison.openRateVsTeam < 0 ? "text-red-600" : "text-muted-foreground"
                  )}>
                    {benchmarkData.comparison.openRateVsTeam > 0 ? "+" : ""}{benchmarkData.comparison.openRateVsTeam} pts vs team
                  </div>
                </div>
                
                <div className="border rounded-lg p-4" data-testid="benchmark-reply-rate">
                  <p className="text-sm text-muted-foreground mb-1">Reply Rate</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{benchmarkData.you.replyRate}%</span>
                    <span className="text-sm text-muted-foreground">vs team avg {benchmarkData.teamAverage.replyRate}%</span>
                  </div>
                  <div className={cn(
                    "text-sm mt-1",
                    benchmarkData.comparison.replyRateVsTeam > 0 ? "text-green-600" : benchmarkData.comparison.replyRateVsTeam < 0 ? "text-red-600" : "text-muted-foreground"
                  )}>
                    {benchmarkData.comparison.replyRateVsTeam > 0 ? "+" : ""}{benchmarkData.comparison.replyRateVsTeam} pts vs team
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Compared against {benchmarkData.teamSize} other team member{benchmarkData.teamSize !== 1 ? 's' : ''} • Individual names are not displayed
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No team data available</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
