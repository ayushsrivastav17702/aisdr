import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft,
  Building2, 
  Users, 
  Activity, 
  Settings,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Mail,
  Target,
  Database,
  Zap,
  UserPlus,
  Edit,
  Key,
  BarChart3,
  Clock,
  TrendingUp,
  AlertCircle
} from "lucide-react";

interface TenantDetails {
  organization: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    companySize: string | null;
    status: string;
    createdAt: string;
  };
  settings: {
    plan: string;
    tenantStatus: string;
    healthScore: number;
    maxUsers: number;
    maxProspects: number;
    maxSequences: number;
    maxMailboxes: number;
  } | null;
  featureFlags: Record<string, boolean> | null;
  configuration: {
    maxDailyEmails: number;
    maxHourlyEmails: number;
    storageQuotaMb: number;
    apiRateLimitPerMinute: number;
  } | null;
  usageStats: {
    currentUsers: number;
    maxUsers: number;
    currentProspects: number;
    maxProspects: number;
    currentSequences: number;
    maxSequences: number;
    currentMailboxes: number;
    maxMailboxes: number;
    emailsSentToday: number;
    emailsSentTotal: number;
    storageUsedMb: number;
    storageQuotaMb: number;
  };
  healthMetrics: {
    healthScore: number;
    lastActivityAt: string | null;
    daysSinceLastActivity: number;
    activeUsersLast7Days: number;
    emailDeliverabilityRate: number;
    sequenceCompletionRate: number;
    alerts: Array<{ type: string; message: string; severity: string }>;
  };
  managers: Array<{
    id: string;
    userId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    managerRole: string | null;
    lastLogin: string | null;
    status: string;
  }>;
  campaignStats: {
    activeSequences: number;
    pausedSequences: number;
    completedSequences: number;
    totalSequences: number;
  };
}

interface ActivityEvent {
  id: string;
  eventType: string;
  eventData: Record<string, any>;
  actorType: string;
  actorId: string | null;
  actorEmail: string | null;
  createdAt: string;
}

interface ActivityResponse {
  activities: ActivityEvent[];
  total: number;
}

async function superAdminFetch(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      sessionStorage.removeItem("super_admin");
      window.location.href = "/super-admin/login";
      throw new Error("Session expired");
    }
    const error = await response.json();
    throw new Error(error.error || "Request failed");
  }
  
  return response.json();
}

function getStatusBadge(status: string) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default",
    trial: "secondary",
    suspended: "destructive",
    churned: "outline",
  };
  return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
}

function getPlanBadge(plan: string) {
  const colors: Record<string, string> = {
    trial: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    starter: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    growth: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    enterprise: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  };
  return <Badge className={colors[plan] || ""}>{plan}</Badge>;
}

function getHealthIndicator(score: number) {
  if (score >= 80) return { color: "text-green-500", icon: CheckCircle, label: "Healthy" };
  if (score >= 50) return { color: "text-yellow-500", icon: AlertTriangle, label: "Warning" };
  return { color: "text-red-500", icon: XCircle, label: "Critical" };
}

function getEventTypeColor(eventType: string): string {
  const colors: Record<string, string> = {
    'TENANT_CREATED': 'bg-green-100 text-green-600',
    'TENANT_STATUS_UPDATED': 'bg-yellow-100 text-yellow-600',
    'TENANT_SUSPENDED': 'bg-red-100 text-red-600',
    'TENANT_ACTIVATED': 'bg-green-100 text-green-600',
    'MANAGER_CREATED': 'bg-blue-100 text-blue-600',
    'MANAGER_UPDATED': 'bg-blue-100 text-blue-600',
    'CONFIG_UPDATED': 'bg-purple-100 text-purple-600',
    'FEATURES_UPDATED': 'bg-purple-100 text-purple-600',
    'USER_CREATED': 'bg-blue-100 text-blue-600',
    'LOGIN': 'bg-gray-100 text-gray-600',
    'IMPERSONATION_STARTED': 'bg-orange-100 text-orange-600',
    'IMPERSONATION_ENDED': 'bg-orange-100 text-orange-600',
  };
  return colors[eventType] || 'bg-gray-100 text-gray-600';
}

function getEventTypeIcon(eventType: string) {
  switch (eventType) {
    case 'TENANT_CREATED':
      return <Building2 className="h-4 w-4" />;
    case 'TENANT_SUSPENDED':
    case 'TENANT_ACTIVATED':
    case 'TENANT_STATUS_UPDATED':
      return <Shield className="h-4 w-4" />;
    case 'MANAGER_CREATED':
    case 'USER_CREATED':
      return <UserPlus className="h-4 w-4" />;
    case 'CONFIG_UPDATED':
    case 'FEATURES_UPDATED':
      return <Settings className="h-4 w-4" />;
    case 'LOGIN':
      return <Activity className="h-4 w-4" />;
    case 'IMPERSONATION_STARTED':
    case 'IMPERSONATION_ENDED':
      return <Users className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

function formatEventType(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function SuperAdminTenantDetail() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const tenantId = params.id as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("overview");
  const [addManagerDialogOpen, setAddManagerDialogOpen] = useState(false);
  const [newManagerData, setNewManagerData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    managerRole: "secondary" as "primary" | "secondary" | "readonly",
  });
  const [limitFormData, setLimitFormData] = useState<{
    maxUsers?: number;
    maxProspects?: number;
    maxSequences?: number;
    maxMailboxes?: number;
    maxDailyEmails?: number;
    maxHourlyEmails?: number;
    storageQuotaMb?: number;
    apiRateLimitPerMinute?: number;
  }>({});

  const { data: tenantDetails, isLoading, error } = useQuery<TenantDetails>({
    queryKey: ["/api/super-admin/tenants", tenantId, "details"],
    queryFn: () => superAdminFetch(`/api/super-admin/tenants/${tenantId}/details`),
  });

  const updateConfigMutation = useMutation({
    mutationFn: (config: Record<string, any>) =>
      superAdminFetch(`/api/super-admin/tenants/${tenantId}/configuration`, {
        method: "PATCH",
        body: JSON.stringify(config),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants", tenantId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      toast({ title: "Configuration updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateFeaturesMutation = useMutation({
    mutationFn: (features: Record<string, boolean>) =>
      superAdminFetch(`/api/super-admin/tenants/${tenantId}/features`, {
        method: "PATCH",
        body: JSON.stringify(features),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants", tenantId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      toast({ title: "Feature flags updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addManagerMutation = useMutation({
    mutationFn: (data: typeof newManagerData) =>
      superAdminFetch(`/api/super-admin/tenants/${tenantId}/managers`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants", tenantId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      setAddManagerDialogOpen(false);
      setNewManagerData({ email: "", firstName: "", lastName: "", managerRole: "secondary" });
      toast({ 
        title: "Manager created successfully",
        description: `Temporary password: ${result.tempPassword}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Fetch activity timeline
  const { data: activityData, isLoading: activityLoading } = useQuery<ActivityResponse>({
    queryKey: ["/api/super-admin/tenants", tenantId, "activity"],
    queryFn: () => superAdminFetch(`/api/super-admin/tenants/${tenantId}/activity?limit=20`),
    enabled: activeTab === "activity",
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-slate-400" />
          <p className="mt-2 text-slate-500">Loading tenant details...</p>
        </div>
      </div>
    );
  }

  if (error || !tenantDetails) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-red-500" />
              <h2 className="mt-4 text-xl font-semibold">Tenant Not Found</h2>
              <p className="mt-2 text-slate-500">
                {error?.message || "The requested tenant could not be found."}
              </p>
              <Button className="mt-4" onClick={() => setLocation("/super-admin")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const health = getHealthIndicator(tenantDetails.healthMetrics.healthScore);
  const HealthIcon = health.icon;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => setLocation("/super-admin")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-slate-600" />
              <div>
                <h1 className="text-2xl font-bold">{tenantDetails.organization.name}</h1>
                <p className="text-slate-500">{tenantDetails.organization.slug}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(tenantDetails.settings?.tenantStatus || "pending")}
            {getPlanBadge(tenantDetails.settings?.plan || "trial")}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="usage" data-testid="tab-usage">
              <Activity className="h-4 w-4 mr-2" />
              Usage & Limits
            </TabsTrigger>
            <TabsTrigger value="features" data-testid="tab-features">
              <Zap className="h-4 w-4 mr-2" />
              Features
            </TabsTrigger>
            <TabsTrigger value="managers" data-testid="tab-managers">
              <Users className="h-4 w-4 mr-2" />
              Managers
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Clock className="h-4 w-4 mr-2" />
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Health Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <HealthIcon className={`h-8 w-8 ${health.color}`} />
                    <div>
                      <p className="text-3xl font-bold">{tenantDetails.healthMetrics.healthScore}%</p>
                      <p className={`text-sm ${health.color}`}>{health.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Last Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Clock className="h-8 w-8 text-slate-400" />
                    <div>
                      <p className="text-xl font-semibold">
                        {tenantDetails.healthMetrics.daysSinceLastActivity} days ago
                      </p>
                      <p className="text-sm text-slate-500">
                        {tenantDetails.healthMetrics.lastActivityAt
                          ? new Date(tenantDetails.healthMetrics.lastActivityAt).toLocaleDateString()
                          : "Never"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Active Users (7d)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="text-3xl font-bold">{tenantDetails.healthMetrics.activeUsersLast7Days}</p>
                      <p className="text-sm text-slate-500">
                        of {tenantDetails.usageStats.currentUsers} total
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {tenantDetails.healthMetrics.alerts.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {tenantDetails.healthMetrics.alerts.map((alert, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg flex items-center gap-3 ${
                          alert.severity === "critical"
                            ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                            : alert.severity === "high"
                            ? "bg-orange-50 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400"
                            : "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                        }`}
                      >
                        <AlertTriangle className="h-4 w-4" />
                        <span>{alert.message}</span>
                        <Badge variant="outline" className="ml-auto">
                          {alert.severity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Campaign Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{tenantDetails.campaignStats.activeSequences}</p>
                      <p className="text-sm text-slate-500">Active</p>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-yellow-600">{tenantDetails.campaignStats.pausedSequences}</p>
                      <p className="text-sm text-slate-500">Paused</p>
                    </div>
                    <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">{tenantDetails.campaignStats.completedSequences}</p>
                      <p className="text-sm text-slate-500">Completed</p>
                    </div>
                    <div className="text-center p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      <p className="text-2xl font-bold">{tenantDetails.campaignStats.totalSequences}</p>
                      <p className="text-sm text-slate-500">Total</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Performance Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Email Deliverability</span>
                        <span className="text-sm font-medium">{tenantDetails.healthMetrics.emailDeliverabilityRate}%</span>
                      </div>
                      <Progress value={tenantDetails.healthMetrics.emailDeliverabilityRate} />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Sequence Completion</span>
                        <span className="text-sm font-medium">{tenantDetails.healthMetrics.sequenceCompletionRate}%</span>
                      </div>
                      <Progress value={tenantDetails.healthMetrics.sequenceCompletionRate} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="usage">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Resource Usage</CardTitle>
                  <CardDescription>Current usage vs limits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Users
                      </span>
                      <span className="font-medium">
                        {tenantDetails.usageStats.currentUsers} / {tenantDetails.usageStats.maxUsers}
                      </span>
                    </div>
                    <Progress 
                      value={(tenantDetails.usageStats.currentUsers / tenantDetails.usageStats.maxUsers) * 100} 
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Prospects
                      </span>
                      <span className="font-medium">
                        {tenantDetails.usageStats.currentProspects.toLocaleString()} / {tenantDetails.usageStats.maxProspects.toLocaleString()}
                      </span>
                    </div>
                    <Progress 
                      value={(tenantDetails.usageStats.currentProspects / tenantDetails.usageStats.maxProspects) * 100} 
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Sequences
                      </span>
                      <span className="font-medium">
                        {tenantDetails.usageStats.currentSequences} / {tenantDetails.usageStats.maxSequences}
                      </span>
                    </div>
                    <Progress 
                      value={(tenantDetails.usageStats.currentSequences / tenantDetails.usageStats.maxSequences) * 100} 
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        Storage
                      </span>
                      <span className="font-medium">
                        {tenantDetails.usageStats.storageUsedMb} MB / {tenantDetails.usageStats.storageQuotaMb} MB
                      </span>
                    </div>
                    <Progress 
                      value={(tenantDetails.usageStats.storageUsedMb / tenantDetails.usageStats.storageQuotaMb) * 100} 
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Email Statistics</CardTitle>
                  <CardDescription>Email sending metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      <p className="text-sm text-slate-500">Sent Today</p>
                      <p className="text-2xl font-bold">{tenantDetails.usageStats.emailsSentToday}</p>
                    </div>
                    <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      <p className="text-sm text-slate-500">Total Sent</p>
                      <p className="text-2xl font-bold">{tenantDetails.usageStats.emailsSentTotal.toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      <p className="text-sm text-slate-500">Mailboxes</p>
                      <p className="text-2xl font-bold">
                        {tenantDetails.usageStats.currentMailboxes} / {tenantDetails.usageStats.maxMailboxes}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      <p className="text-sm text-slate-500">Daily Limit</p>
                      <p className="text-2xl font-bold">{tenantDetails.configuration?.maxDailyEmails || 100}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Edit Limits
                  </CardTitle>
                  <CardDescription>Adjust resource limits for this tenant</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <Label>Max Users</Label>
                      <Input
                        type="number"
                        value={limitFormData.maxUsers ?? tenantDetails.usageStats.maxUsers}
                        onChange={(e) => setLimitFormData(prev => ({ ...prev, maxUsers: parseInt(e.target.value) || 0 }))}
                        data-testid="input-max-users"
                      />
                    </div>
                    <div>
                      <Label>Max Prospects</Label>
                      <Input
                        type="number"
                        value={limitFormData.maxProspects ?? tenantDetails.usageStats.maxProspects}
                        onChange={(e) => setLimitFormData(prev => ({ ...prev, maxProspects: parseInt(e.target.value) || 0 }))}
                        data-testid="input-max-prospects"
                      />
                    </div>
                    <div>
                      <Label>Max Sequences</Label>
                      <Input
                        type="number"
                        value={limitFormData.maxSequences ?? tenantDetails.usageStats.maxSequences}
                        onChange={(e) => setLimitFormData(prev => ({ ...prev, maxSequences: parseInt(e.target.value) || 0 }))}
                        data-testid="input-max-sequences"
                      />
                    </div>
                    <div>
                      <Label>Max Mailboxes</Label>
                      <Input
                        type="number"
                        value={limitFormData.maxMailboxes ?? tenantDetails.usageStats.maxMailboxes}
                        onChange={(e) => setLimitFormData(prev => ({ ...prev, maxMailboxes: parseInt(e.target.value) || 0 }))}
                        data-testid="input-max-mailboxes"
                      />
                    </div>
                    <div>
                      <Label>Daily Email Limit</Label>
                      <Input
                        type="number"
                        value={limitFormData.maxDailyEmails ?? tenantDetails.configuration?.maxDailyEmails ?? 100}
                        onChange={(e) => setLimitFormData(prev => ({ ...prev, maxDailyEmails: parseInt(e.target.value) || 0 }))}
                        data-testid="input-max-daily-emails"
                      />
                    </div>
                    <div>
                      <Label>Hourly Email Limit</Label>
                      <Input
                        type="number"
                        value={limitFormData.maxHourlyEmails ?? tenantDetails.configuration?.maxHourlyEmails ?? 20}
                        onChange={(e) => setLimitFormData(prev => ({ ...prev, maxHourlyEmails: parseInt(e.target.value) || 0 }))}
                        data-testid="input-max-hourly-emails"
                      />
                    </div>
                    <div>
                      <Label>Storage Quota (MB)</Label>
                      <Input
                        type="number"
                        value={limitFormData.storageQuotaMb ?? tenantDetails.usageStats.storageQuotaMb}
                        onChange={(e) => setLimitFormData(prev => ({ ...prev, storageQuotaMb: parseInt(e.target.value) || 0 }))}
                        data-testid="input-storage-quota"
                      />
                    </div>
                    <div>
                      <Label>API Rate Limit/min</Label>
                      <Input
                        type="number"
                        value={limitFormData.apiRateLimitPerMinute ?? tenantDetails.configuration?.apiRateLimitPerMinute ?? 60}
                        onChange={(e) => setLimitFormData(prev => ({ ...prev, apiRateLimitPerMinute: parseInt(e.target.value) || 0 }))}
                        data-testid="input-api-rate-limit"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      if (Object.keys(limitFormData).length > 0) {
                        updateConfigMutation.mutate(limitFormData);
                        setLimitFormData({});
                      } else {
                        toast({ title: "No changes to save", variant: "default" });
                      }
                    }}
                    disabled={updateConfigMutation.isPending || Object.keys(limitFormData).length === 0}
                    data-testid="button-save-limits"
                  >
                    {updateConfigMutation.isPending ? "Saving..." : "Save Limits"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="features">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Feature Flags
                </CardTitle>
                <CardDescription>Enable or disable features for this tenant</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { key: "aiProspecting", label: "AI-Powered Search", description: "Natural language prospect search" },
                    { key: "emailSequences", label: "Email Sequencing", description: "Multi-step email campaigns" },
                    { key: "aiEmailGeneration", label: "AI Email Generation", description: "AI-powered email content" },
                    { key: "aiSentimentAnalysis", label: "Sentiment Analysis", description: "Reply sentiment detection" },
                    { key: "advancedAnalytics", label: "Advanced Analytics", description: "Detailed reporting & insights" },
                    { key: "customReports", label: "Custom Reports", description: "Create custom report templates" },
                    { key: "apiAccess", label: "API Access", description: "Programmatic API access" },
                    { key: "webhookAccess", label: "Webhooks", description: "Real-time event notifications" },
                    { key: "multiMailbox", label: "Multi-Mailbox", description: "Multiple sending mailboxes" },
                    { key: "bulkOperations", label: "Bulk Operations", description: "Bulk prospect operations" },
                    { key: "exportCapabilities", label: "Data Export", description: "Export data to CSV/JSON" },
                    { key: "customBranding", label: "Custom Branding", description: "White-label options" },
                    { key: "customDomain", label: "Custom Domain", description: "Use your own domain" },
                    { key: "whiteLabel", label: "White Label", description: "Full white-label mode" },
                    { key: "crmIntegration", label: "CRM Integration", description: "Connect to CRM systems" },
                  ].map((feature) => (
                    <div
                      key={feature.key}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{feature.label}</p>
                        <p className="text-sm text-slate-500">{feature.description}</p>
                      </div>
                      <Switch
                        checked={tenantDetails.featureFlags?.[feature.key] ?? false}
                        onCheckedChange={(checked) =>
                          updateFeaturesMutation.mutate({ [feature.key]: checked })
                        }
                        data-testid={`switch-feature-${feature.key}`}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="managers">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Manager Accounts
                  </CardTitle>
                  <CardDescription>Tenant administrators with access to this organization</CardDescription>
                </div>
                <Button onClick={() => setAddManagerDialogOpen(true)} data-testid="button-add-manager">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Manager
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantDetails.managers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                          No managers found for this tenant
                        </TableCell>
                      </TableRow>
                    ) : (
                      tenantDetails.managers.map((manager) => (
                        <TableRow key={manager.id} data-testid={`row-manager-${manager.id}`}>
                          <TableCell>
                            {manager.firstName || manager.lastName
                              ? `${manager.firstName || ""} ${manager.lastName || ""}`.trim()
                              : "—"}
                          </TableCell>
                          <TableCell>{manager.email}</TableCell>
                          <TableCell>
                            <Badge variant={manager.managerRole === "primary" ? "default" : "secondary"}>
                              {manager.managerRole || "primary"}
                            </Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(manager.status)}</TableCell>
                          <TableCell>
                            {manager.lastLogin
                              ? new Date(manager.lastLogin).toLocaleDateString()
                              : "Never"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" data-testid={`button-edit-manager-${manager.id}`}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" data-testid={`button-reset-password-${manager.id}`}>
                                <Key className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Activity Timeline
                </CardTitle>
                <CardDescription>Recent events and activities for this tenant</CardDescription>
              </CardHeader>
              <CardContent>
                {activityLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto text-slate-400" />
                    <p className="mt-2 text-slate-500">Loading activity...</p>
                  </div>
                ) : !activityData?.activities || activityData.activities.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Clock className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                    <p>No activity recorded yet</p>
                    <p className="text-sm">Events will appear here as actions occur on this tenant.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activityData.activities.map((event) => (
                      <div 
                        key={event.id} 
                        className="flex items-start gap-4 p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                        data-testid={`activity-event-${event.id}`}
                      >
                        <div className={`p-2 rounded-full ${getEventTypeColor(event.eventType)}`}>
                          {getEventTypeIcon(event.eventType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{formatEventType(event.eventType)}</span>
                            <Badge variant="outline" className="text-xs">
                              {event.actorType}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-500 mt-1">
                            {event.actorEmail || 'System'}
                          </p>
                          {event.eventData && Object.keys(event.eventData).length > 0 && (
                            <div className="mt-2 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 rounded p-2">
                              {JSON.stringify(event.eventData, null, 2).slice(0, 200)}
                              {JSON.stringify(event.eventData).length > 200 && '...'}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 whitespace-nowrap">
                          {new Date(event.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                    {activityData.total > activityData.activities.length && (
                      <p className="text-center text-sm text-slate-500 pt-4">
                        Showing {activityData.activities.length} of {activityData.total} events
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={addManagerDialogOpen} onOpenChange={setAddManagerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manager</DialogTitle>
            <DialogDescription>
              Create a new manager account for {tenantDetails.organization.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={newManagerData.email}
                onChange={(e) => setNewManagerData({ ...newManagerData, email: e.target.value })}
                placeholder="manager@company.com"
                data-testid="input-new-manager-email"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <Input
                  value={newManagerData.firstName}
                  onChange={(e) => setNewManagerData({ ...newManagerData, firstName: e.target.value })}
                  placeholder="John"
                  data-testid="input-new-manager-first-name"
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  value={newManagerData.lastName}
                  onChange={(e) => setNewManagerData({ ...newManagerData, lastName: e.target.value })}
                  placeholder="Doe"
                  data-testid="input-new-manager-last-name"
                />
              </div>
            </div>
            <div>
              <Label>Manager Role</Label>
              <Select
                value={newManagerData.managerRole}
                onValueChange={(value: "primary" | "secondary" | "readonly") =>
                  setNewManagerData({ ...newManagerData, managerRole: value })
                }
              >
                <SelectTrigger data-testid="select-new-manager-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary (Full Access)</SelectItem>
                  <SelectItem value="secondary">Secondary (Limited Admin)</SelectItem>
                  <SelectItem value="readonly">Read-Only (View Only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddManagerDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addManagerMutation.mutate(newManagerData)}
              disabled={!newManagerData.email || addManagerMutation.isPending}
              data-testid="button-confirm-add-manager"
            >
              {addManagerMutation.isPending ? "Creating..." : "Create Manager"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
