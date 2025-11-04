import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartBar,
  Users,
  Mail,
  CheckCircle,
  MoreVertical,
  Pause,
  Play,
  CloudArrowUp,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";

interface AutomationRun {
  id: string;
  sequenceId: string;
  sequenceName?: string;
  prospectCount: number;
  aiPersonalizationEnabled: boolean;
  apolloFilters: any;
  status: "running" | "completed" | "paused" | "failed";
  startedAt: string;
  completedAt?: string;
  prospectsAdded: number;
  emailsSent: number;
  repliesReceived: number;
  errors?: string;
}

export default function AutomationDashboard() {
  const {
    data: automationsData,
    isLoading,
    refetch,
  } = useQuery<{ automations: AutomationRun[]; total: number }>({
    queryKey: ["/api/automation/list"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const automations = automationsData?.automations || [];

  // Calculate statistics
  const stats = {
    total: automations.length,
    running: automations.filter((a) => a.status === "running").length,
    completed: automations.filter((a) => a.status === "completed").length,
    totalProspects: automations.reduce((sum, a) => sum + a.prospectsAdded, 0),
    totalEmails: automations.reduce((sum, a) => sum + a.emailsSent, 0),
    totalReplies: automations.reduce((sum, a) => sum + a.repliesReceived, 0),
  };

  const getStatusBadge = (status: AutomationRun["status"]) => {
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
      <Badge variant={variants[status]} data-testid={`badge-status-${status}`}>
        {status === "running" && (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        )}
        {labels[status]}
      </Badge>
    );
  };

  const getSuccessRate = (automation: AutomationRun) => {
    if (automation.emailsSent === 0) return 0;
    return Math.round(
      (automation.repliesReceived / automation.emailsSent) * 100
    );
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
        <div>
          <h1 className="text-3xl font-bold">Automation Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Monitor and manage your sequence automation runs
          </p>
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
              <CloudArrowUp className="w-16 h-16 text-muted-foreground mb-4" />
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
                  <TableHead>Emails Sent</TableHead>
                  <TableHead>Replies</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {automations.map((automation) => (
                  <TableRow key={automation.id} data-testid={`row-automation-${automation.id}`}>
                    <TableCell>{getStatusBadge(automation.status)}</TableCell>
                    <TableCell className="font-medium">
                      {automation.sequenceName || "Unknown Sequence"}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="text-sm">
                          {automation.prospectsAdded} / {automation.prospectCount}{" "}
                          prospects
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.min(
                                (automation.prospectsAdded /
                                  automation.prospectCount) *
                                  100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell data-testid={`text-emails-${automation.id}`}>{automation.emailsSent}</TableCell>
                    <TableCell data-testid={`text-replies-${automation.id}`}>{automation.repliesReceived}</TableCell>
                    <TableCell>
                      <Badge variant="outline" data-testid={`badge-rate-${automation.id}`}>
                        {getSuccessRate(automation)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(automation.startedAt).toLocaleString()}
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
                          {automation.status === "running" && (
                            <DropdownMenuItem>
                              <Pause className="w-4 h-4 mr-2" />
                              Pause
                            </DropdownMenuItem>
                          )}
                          {automation.status === "paused" && (
                            <DropdownMenuItem>
                              <Play className="w-4 h-4 mr-2" />
                              Resume
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <Link href={`/sequences/${automation.sequenceId}`}>
                              View Sequence
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
