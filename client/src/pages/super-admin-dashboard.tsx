import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, 
  Building2, 
  Users, 
  Activity, 
  MoreHorizontal,
  Plus,
  Search,
  Eye,
  UserCog,
  Pause,
  Play,
  Trash2,
  TrendingUp,
  Mail,
  Target,
  LogOut,
  ChevronDown,
  RefreshCw,
  ClipboardList,
  AlertTriangle,
  Database,
  Server,
  Lock,
  CheckCircle,
  XCircle,
  AlertCircle,
  HardDrive,
  Globe,
  BarChart2,
  UserX,
  ShieldCheck,
  FileText,
  Heart,
  LineChart,
  Bell,
  MessageSquare,
  Rocket,
  Download,
  Filter,
  Calendar,
  Send,
  UserPlus
} from "lucide-react";

interface SuperAdmin {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isMasterAdmin: boolean;
}

interface TenantWithSettings {
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
    currentUserCount: number;
    currentProspectCount: number;
    totalEmailsSent: number;
    lastActivityAt: string | null;
    primaryContactEmail: string | null;
  } | null;
  managerCount: number;
  userCount: number;
}

interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  totalProspects: number;
  totalEmailsSent: number;
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
      window.location.href = "/login";
      throw new Error("Session expired");
    }
    const error = await response.json();
    throw new Error(error.error || "Request failed");
  }
  
  return response.json();
}

export default function SuperAdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [superAdmin, setSuperAdmin] = useState<SuperAdmin | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [provisionDialogOpen, setProvisionDialogOpen] = useState(false);
  const [impersonateDialogOpen, setImpersonateDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<TenantWithSettings | null>(null);

  useEffect(() => {
    const storedAdmin = sessionStorage.getItem("super_admin");
    if (storedAdmin) {
      setSuperAdmin(JSON.parse(storedAdmin));
    } else {
      setLocation("/login");
    }
  }, [setLocation]);

  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/super-admin/stats"],
    queryFn: () => superAdminFetch("/api/super-admin/stats"),
    enabled: !!superAdmin,
  });

  const { data: tenantsData, isLoading: tenantsLoading } = useQuery<{ tenants: TenantWithSettings[]; total: number }>({
    queryKey: ["/api/super-admin/tenants", searchQuery, statusFilter, planFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (planFilter !== "all") params.set("plan", planFilter);
      return superAdminFetch(`/api/super-admin/tenants?${params.toString()}`);
    },
    enabled: !!superAdmin,
  });

  const provisionMutation = useMutation({
    mutationFn: (data: any) => superAdminFetch("/api/super-admin/tenants", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/stats"] });
      setProvisionDialogOpen(false);
      toast({ title: "Tenant provisioned successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to provision tenant", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      superAdminFetch(`/api/super-admin/tenants/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/stats"] });
      toast({ title: "Tenant status updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
  });

  const deleteTenantMutation = useMutation({
    mutationFn: (id: string) =>
      superAdminFetch(`/api/super-admin/tenants/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/stats"] });
      setDeleteDialogOpen(false);
      setSelectedTenant(null);
      toast({ title: "Tenant deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete tenant", description: error.message, variant: "destructive" });
    },
  });

  const handleLogout = async () => {
    try {
      await superAdminFetch("/api/super-admin/logout", { method: "POST" });
    } catch (e) {
      // Ignore errors
    }
    sessionStorage.removeItem("super_admin");
    setLocation("/login");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      trial: "secondary",
      suspended: "destructive",
      churned: "outline",
      pending_approval: "secondary",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const getPlanBadge = (plan: string) => {
    const colors: Record<string, string> = {
      trial: "bg-gray-100 text-gray-800",
      starter: "bg-blue-100 text-blue-800",
      growth: "bg-green-100 text-green-800",
      enterprise: "bg-purple-100 text-purple-800",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[plan] || "bg-gray-100 text-gray-800"}`}>
        {plan}
      </span>
    );
  };

  const getHealthBadge = (score: number) => {
    let color = "bg-green-100 text-green-800";
    if (score < 50) color = "bg-red-100 text-red-800";
    else if (score < 75) color = "bg-yellow-100 text-yellow-800";
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${color}`}>
        {score}%
      </span>
    );
  };

  if (!superAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
              <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Super Admin Portal</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Platform Administration</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {superAdmin.firstName} {superAdmin.lastName} ({superAdmin.email})
              {superAdmin.isMasterAdmin && (
                <Badge variant="secondary" className="ml-2">Master Admin</Badge>
              )}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-super-admin-logout">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-overview">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Tenants</p>
                  <p className="text-3xl font-bold" data-testid="stat-total-tenants">{stats?.totalTenants || 0}</p>
                </div>
                <Building2 className="h-10 w-10 text-slate-300" />
              </div>
              <div className="mt-2 flex gap-2 text-xs">
                <span className="text-green-600">{stats?.activeTenants || 0} active</span>
                <span className="text-yellow-600">{stats?.trialTenants || 0} trial</span>
                <span className="text-red-600">{stats?.suspendedTenants || 0} suspended</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Users</p>
                  <p className="text-3xl font-bold" data-testid="stat-total-users">{stats?.totalUsers || 0}</p>
                </div>
                <Users className="h-10 w-10 text-slate-300" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Prospects</p>
                  <p className="text-3xl font-bold" data-testid="stat-total-prospects">{stats?.totalProspects?.toLocaleString() || 0}</p>
                </div>
                <Target className="h-10 w-10 text-slate-300" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Emails Sent</p>
                  <p className="text-3xl font-bold" data-testid="stat-emails-sent">{stats?.totalEmailsSent?.toLocaleString() || 0}</p>
                </div>
                <Mail className="h-10 w-10 text-slate-300" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Navigation Tabs */}
        <Tabs defaultValue="tenants" className="w-full">
          <TabsList className="flex flex-wrap w-full h-auto gap-1 justify-start">
            <TabsTrigger value="tenants" className="flex items-center gap-1 text-xs" data-testid="tab-tenants">
              <Building2 className="h-3 w-3" />
              Tenants
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-1 text-xs" data-testid="tab-users">
              <Users className="h-3 w-3" />
              Users
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1 text-xs" data-testid="tab-analytics">
              <BarChart2 className="h-3 w-3" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-1 text-xs" data-testid="tab-email">
              <Mail className="h-3 w-3" />
              Email
            </TabsTrigger>
            <TabsTrigger value="storage" className="flex items-center gap-1 text-xs" data-testid="tab-storage">
              <Database className="h-3 w-3" />
              Storage
            </TabsTrigger>
            <TabsTrigger value="resources" className="flex items-center gap-1 text-xs" data-testid="tab-resources">
              <Server className="h-3 w-3" />
              Resources
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-1 text-xs" data-testid="tab-security">
              <Lock className="h-3 w-3" />
              Security
            </TabsTrigger>
            <TabsTrigger value="isolation" className="flex items-center gap-1 text-xs" data-testid="tab-isolation">
              <ShieldCheck className="h-3 w-3" />
              Isolation
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-1 text-xs" data-testid="tab-audit">
              <FileText className="h-3 w-3" />
              Audit
            </TabsTrigger>
            <TabsTrigger value="health" className="flex items-center gap-1 text-xs" data-testid="tab-health">
              <Heart className="h-3 w-3" />
              Health
            </TabsTrigger>
            <TabsTrigger value="usage" className="flex items-center gap-1 text-xs" data-testid="tab-usage">
              <LineChart className="h-3 w-3" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-1 text-xs" data-testid="tab-alerts">
              <Bell className="h-3 w-3" />
              Alerts
            </TabsTrigger>
            <TabsTrigger value="comms" className="flex items-center gap-1 text-xs" data-testid="tab-comms">
              <MessageSquare className="h-3 w-3" />
              Comms
            </TabsTrigger>
            <TabsTrigger value="onboarding" className="flex items-center gap-1 text-xs" data-testid="tab-onboarding">
              <Rocket className="h-3 w-3" />
              Onboarding
            </TabsTrigger>
          </TabsList>

          {/* Tenant Management Tab */}
          <TabsContent value="tenants" className="mt-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Tenant Management
                </CardTitle>
                <CardDescription>
                  Manage all company accounts on the platform
                </CardDescription>
              </div>
              <Dialog open={provisionDialogOpen} onOpenChange={setProvisionDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-provision-tenant">
                    <Plus className="h-4 w-4 mr-2" />
                    Provision New Tenant
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Provision New Tenant</DialogTitle>
                    <DialogDescription>
                      Create a new company account and manager user
                    </DialogDescription>
                  </DialogHeader>
                  <ProvisionTenantForm 
                    onSubmit={(data) => provisionMutation.mutate(data)}
                    isLoading={provisionMutation.isPending}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search tenants..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-tenants"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-plan-filter">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] })}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Tenants Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenantsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Loading tenants...
                      </TableCell>
                    </TableRow>
                  ) : tenantsData?.tenants?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        No tenants found
                      </TableCell>
                    </TableRow>
                  ) : (
                    tenantsData?.tenants?.map((tenant) => (
                      <TableRow key={tenant.organization.id} data-testid={`row-tenant-${tenant.organization.id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{tenant.organization.name}</p>
                            <p className="text-sm text-slate-500">{tenant.organization.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(tenant.settings?.tenantStatus || "pending_approval")}</TableCell>
                        <TableCell>{getPlanBadge(tenant.settings?.plan || "trial")}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{tenant.userCount} users</p>
                            <p className="text-slate-500">{tenant.managerCount} managers</p>
                          </div>
                        </TableCell>
                        <TableCell>{getHealthBadge(tenant.settings?.healthScore || 100)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-500">
                            {tenant.settings?.lastActivityAt 
                              ? new Date(tenant.settings.lastActivityAt).toLocaleDateString()
                              : "Never"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-tenant-actions-${tenant.organization.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => setLocation(`/super-admin/tenants/${tenant.organization.id}`)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setSelectedTenant(tenant);
                                setImpersonateDialogOpen(true);
                              }}>
                                <UserCog className="h-4 w-4 mr-2" />
                                Impersonate Manager
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {tenant.settings?.tenantStatus === "suspended" ? (
                                <DropdownMenuItem 
                                  onClick={() => {
                                    setSelectedTenant(tenant);
                                    setActivateDialogOpen(true);
                                  }}
                                  data-testid={`button-activate-tenant-${tenant.organization.id}`}
                                >
                                  <Play className="h-4 w-4 mr-2" />
                                  Activate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem 
                                  className="text-orange-600"
                                  onClick={() => {
                                    setSelectedTenant(tenant);
                                    setSuspendReason("");
                                    setSuspendDialogOpen(true);
                                  }}
                                  data-testid={`button-suspend-tenant-${tenant.organization.id}`}
                                >
                                  <Pause className="h-4 w-4 mr-2" />
                                  Suspend
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => {
                                  setSelectedTenant(tenant);
                                  setDeleteDialogOpen(true);
                                }}
                                data-testid={`button-delete-tenant-${tenant.organization.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Tenant
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {tenantsData && tenantsData.total > 20 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Showing {tenantsData.tenants.length} of {tenantsData.total} tenants
                </p>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          {/* Global User Overview Tab */}
          <TabsContent value="users" className="mt-4">
            <GlobalUserOverview />
          </TabsContent>

          {/* Platform Analytics Tab */}
          <TabsContent value="analytics" className="mt-4">
            <PlatformAnalytics />
          </TabsContent>

          {/* Email Infrastructure Tab */}
          <TabsContent value="email" className="mt-4">
            <EmailInfrastructure />
          </TabsContent>

          {/* Storage Management Tab */}
          <TabsContent value="storage" className="mt-4">
            <StorageManagement />
          </TabsContent>

          {/* Resource Monitoring Tab */}
          <TabsContent value="resources" className="mt-4">
            <ResourceMonitoring />
          </TabsContent>

          {/* Security Dashboard Tab */}
          <TabsContent value="security" className="mt-4">
            <SecurityDashboard />
          </TabsContent>

          {/* Tenant Isolation Tab */}
          <TabsContent value="isolation" className="mt-4">
            <TenantIsolationTest />
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="audit" className="mt-4">
            <AuditLogs />
          </TabsContent>

          {/* Platform Health Tab */}
          <TabsContent value="health" className="mt-4">
            <PlatformHealth />
          </TabsContent>

          {/* Tenant Usage Analytics Tab */}
          <TabsContent value="usage" className="mt-4">
            <TenantUsageAnalytics />
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="mt-4">
            <AlertsPanel />
          </TabsContent>

          {/* Communications Tab */}
          <TabsContent value="comms" className="mt-4">
            <CommunicationsPanel />
          </TabsContent>

          {/* Onboarding Tab */}
          <TabsContent value="onboarding" className="mt-4">
            <OnboardingPanel />
          </TabsContent>
        </Tabs>
      </main>

      {/* Impersonate Dialog */}
      <Dialog open={impersonateDialogOpen} onOpenChange={setImpersonateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Impersonate Manager</DialogTitle>
            <DialogDescription>
              Access {selectedTenant?.organization.name}'s account as a manager. This action will be logged.
            </DialogDescription>
          </DialogHeader>
          <ImpersonateForm 
            tenant={selectedTenant}
            onClose={() => setImpersonateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Suspend Tenant Confirmation Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Suspend Tenant
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to suspend <strong>{selectedTenant?.organization.name}</strong>? 
              This will immediately block all users from accessing the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="suspendReason">Reason for suspension (optional)</Label>
              <Textarea
                id="suspendReason"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Enter reason for suspension..."
                data-testid="input-suspend-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)} data-testid="button-cancel-suspend">
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (selectedTenant) {
                  updateStatusMutation.mutate({
                    id: selectedTenant.organization.id,
                    status: "suspended",
                    reason: suspendReason || "Suspended by super admin"
                  });
                  setSuspendDialogOpen(false);
                }
              }}
              disabled={updateStatusMutation.isPending}
              data-testid="button-confirm-suspend"
            >
              {updateStatusMutation.isPending ? "Suspending..." : "Confirm Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate Tenant Confirmation Dialog */}
      <Dialog open={activateDialogOpen} onOpenChange={setActivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Play className="h-5 w-5" />
              Activate Tenant
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to activate <strong>{selectedTenant?.organization.name}</strong>? 
              This will restore access for all users immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateDialogOpen(false)} data-testid="button-cancel-activate">
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedTenant) {
                  updateStatusMutation.mutate({
                    id: selectedTenant.organization.id,
                    status: "active"
                  });
                  setActivateDialogOpen(false);
                }
              }}
              disabled={updateStatusMutation.isPending}
              data-testid="button-confirm-activate"
            >
              {updateStatusMutation.isPending ? "Activating..." : "Confirm Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Tenant Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Tenant
            </DialogTitle>
            <DialogDescription asChild>
              <div>
                <p className="text-red-600 font-semibold">Warning: This action cannot be undone.</p>
                <p className="mt-2">
                  Deleting <strong>{selectedTenant?.organization.name}</strong> will permanently remove:
                </p>
                <ul className="list-disc ml-4 mt-2 space-y-1">
                  <li>All user accounts and data</li>
                  <li>All prospects and sequences</li>
                  <li>All email history and analytics</li>
                  <li>All mailbox configurations</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (selectedTenant) {
                  deleteTenantMutation.mutate(selectedTenant.organization.id);
                }
              }}
              disabled={deleteTenantMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteTenantMutation.isPending ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProvisionTenantForm({ onSubmit, isLoading }: { onSubmit: (data: any) => void; isLoading: boolean }) {
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    industry: "",
    companySize: "",
    plan: "trial",
    managerEmail: "",
    managerFirstName: "",
    managerLastName: "",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === "name" && !formData.slug) {
      setFormData((prev) => ({ 
        ...prev, 
        [field]: value,
        slug: value.toLowerCase().replace(/[^a-z0-9]/g, "-") 
      }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Company Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            required
            data-testid="input-tenant-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug *</Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
            required
            data-testid="input-tenant-slug"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            value={formData.industry}
            onChange={(e) => setFormData((prev) => ({ ...prev, industry: e.target.value }))}
            data-testid="input-tenant-industry"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan">Plan</Label>
          <Select value={formData.plan} onValueChange={(value) => setFormData((prev) => ({ ...prev, plan: value }))}>
            <SelectTrigger data-testid="select-tenant-plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trial">Trial (14 days)</SelectItem>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-3">Manager Account</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="managerEmail">Manager Email *</Label>
            <Input
              id="managerEmail"
              type="email"
              value={formData.managerEmail}
              onChange={(e) => setFormData((prev) => ({ ...prev, managerEmail: e.target.value }))}
              required
              data-testid="input-manager-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="managerFirstName">First Name</Label>
            <Input
              id="managerFirstName"
              value={formData.managerFirstName}
              onChange={(e) => setFormData((prev) => ({ ...prev, managerFirstName: e.target.value }))}
              data-testid="input-manager-first-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="managerLastName">Last Name</Label>
            <Input
              id="managerLastName"
              value={formData.managerLastName}
              onChange={(e) => setFormData((prev) => ({ ...prev, managerLastName: e.target.value }))}
              data-testid="input-manager-last-name"
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isLoading} data-testid="button-submit-provision">
          {isLoading ? "Provisioning..." : "Provision Tenant"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ImpersonateForm({ tenant, onClose }: { tenant: TenantWithSettings | null; onClose: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [managers, setManagers] = useState<any[]>([]);
  const [selectedManager, setSelectedManager] = useState("");

  useEffect(() => {
    if (tenant) {
      superAdminFetch(`/api/super-admin/tenants/${tenant.organization.id}`)
        .then((data) => setManagers(data.managers || []))
        .catch(console.error);
    }
  }, [tenant]);

  const handleImpersonate = async () => {
    if (!selectedManager || !reason) {
      toast({ title: "Please select a manager and provide a reason", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const result = await superAdminFetch(`/api/super-admin/tenants/${tenant?.organization.id}/impersonate`, {
        method: "POST",
        body: JSON.stringify({ targetUserId: selectedManager, reason }),
      });

      sessionStorage.setItem("impersonation_log_id", result.impersonationLogId);
      
      toast({ title: "Impersonation started", description: "You are now viewing as the manager. Opening in new tab..." });
      
      window.open("/", "_blank");
      onClose();
    } catch (error: any) {
      toast({ title: "Failed to start impersonation", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Select Manager</Label>
        <Select value={selectedManager} onValueChange={setSelectedManager}>
          <SelectTrigger data-testid="select-impersonate-manager">
            <SelectValue placeholder="Choose a manager to impersonate" />
          </SelectTrigger>
          <SelectContent>
            {managers.map((manager) => (
              <SelectItem key={manager.id} value={manager.id}>
                {manager.firstName} {manager.lastName} ({manager.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">Reason for Impersonation *</Label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g., Customer support request, troubleshooting account issue"
          required
          data-testid="input-impersonate-reason"
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleImpersonate} disabled={isLoading} data-testid="button-start-impersonation">
          {isLoading ? "Starting..." : "Start Impersonation"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// Global User Overview Component
function GlobalUserOverview() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["/api/super-admin/users", searchQuery, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter !== "all") params.set("status", statusFilter);
      return superAdminFetch(`/api/super-admin/users?${params.toString()}`);
    },
  });

  const updateUserStatusMutation = useMutation({
    mutationFn: ({ userId, status, reason }: { userId: string; status: string; reason?: string }) =>
      superAdminFetch(`/api/super-admin/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/users"] });
      toast({ title: "User status updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update user status", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Global User Overview
        </CardTitle>
        <CardDescription>
          View and manage all users across all tenants
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-users"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-user-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/super-admin/users"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* User Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold" data-testid="stat-total-platform-users">{usersData?.total || 0}</div>
              <p className="text-xs text-slate-500">Total Users</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-green-600" data-testid="stat-active-users">{usersData?.activeCount || 0}</div>
              <p className="text-xs text-slate-500">Active Users</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-blue-600" data-testid="stat-power-users">{usersData?.powerUserCount || 0}</div>
              <p className="text-xs text-slate-500">Power Users</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-yellow-600" data-testid="stat-inactive-users">{usersData?.inactiveCount || 0}</div>
              <p className="text-xs text-slate-500">Inactive Users</p>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">Loading users...</TableCell>
                </TableRow>
              ) : usersData?.users?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">No users found</TableCell>
                </TableRow>
              ) : (
                usersData?.users?.map((user: any) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.firstName} {user.lastName}</p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{user.organizationName || "N/A"}</TableCell>
                    <TableCell><Badge variant="outline">{user.role}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={user.status === "active" ? "default" : user.status === "suspended" ? "destructive" : "secondary"}>
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-500">
                        {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString() : "Never"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-user-actions-${user.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => updateUserStatusMutation.mutate({ userId: user.id, status: "active" })}>
                            <Play className="h-4 w-4 mr-2" />
                            Activate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateUserStatusMutation.mutate({ userId: user.id, status: "suspended", reason: "Suspended by super admin" })}>
                            <Pause className="h-4 w-4 mr-2" />
                            Suspend
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// Platform Analytics Component
function PlatformAnalytics() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["/api/super-admin/analytics"],
    queryFn: () => superAdminFetch("/api/super-admin/analytics"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5" />
          Platform Analytics
        </CardTitle>
        <CardDescription>
          Platform-wide usage and engagement metrics
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading analytics...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Users className="h-8 w-8 text-blue-500" />
                  <div>
                    <div className="text-2xl font-bold" data-testid="analytics-total-users">{analytics?.totalUsers || 0}</div>
                    <p className="text-xs text-slate-500">Total Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-8 w-8 text-green-500" />
                  <div>
                    <div className="text-2xl font-bold" data-testid="analytics-active-users">{analytics?.activeUsers || 0}</div>
                    <p className="text-xs text-slate-500">Active This Month</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-8 w-8 text-purple-500" />
                  <div>
                    <div className="text-2xl font-bold" data-testid="analytics-avg-users">{analytics?.avgUsersPerTenant?.toFixed(1) || "0.0"}</div>
                    <p className="text-xs text-slate-500">Avg Users/Tenant</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <UserX className="h-8 w-8 text-red-500" />
                  <div>
                    <div className="text-2xl font-bold" data-testid="analytics-churn-rate">{analytics?.churnRate?.toFixed(1) || "0.0"}%</div>
                    <p className="text-xs text-slate-500">User Churn Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-full">
              <CardContent className="pt-4">
                <h4 className="font-medium mb-2">Email Engagement</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-xl font-bold text-blue-600" data-testid="analytics-emails-sent">{analytics?.emailsSentToday || 0}</div>
                    <p className="text-xs text-slate-500">Sent Today</p>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-green-600" data-testid="analytics-open-rate">{analytics?.openRate?.toFixed(1) || "0.0"}%</div>
                    <p className="text-xs text-slate-500">Open Rate</p>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-purple-600" data-testid="analytics-reply-rate">{analytics?.replyRate?.toFixed(1) || "0.0"}%</div>
                    <p className="text-xs text-slate-500">Reply Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Email Infrastructure Component
function EmailInfrastructure() {
  const { data: emailData, isLoading } = useQuery({
    queryKey: ["/api/super-admin/email-infrastructure"],
    queryFn: () => superAdminFetch("/api/super-admin/email-infrastructure"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Infrastructure
        </CardTitle>
        <CardDescription>
          Email domains, mailboxes, and deliverability metrics
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading email infrastructure...</div>
        ) : (
          <div className="space-y-6">
            {/* Mailbox Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold" data-testid="email-total-mailboxes">{emailData?.totalMailboxes || 0}</div>
                  <p className="text-xs text-slate-500">Total Mailboxes</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-green-600" data-testid="email-active-mailboxes">{emailData?.activeMailboxes || 0}</div>
                  <p className="text-xs text-slate-500">Active</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-yellow-600" data-testid="email-warmup-mailboxes">{emailData?.warmupMailboxes || 0}</div>
                  <p className="text-xs text-slate-500">In Warmup</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-red-600" data-testid="email-error-mailboxes">{emailData?.errorMailboxes || 0}</div>
                  <p className="text-xs text-slate-500">Error Status</p>
                </CardContent>
              </Card>
            </div>

            {/* Deliverability Metrics */}
            <div className="space-y-2">
              <h4 className="font-medium">Deliverability Metrics</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <div className="text-xl font-bold text-green-600" data-testid="email-delivery-rate">{emailData?.deliveryRate?.toFixed(1) || "0.0"}%</div>
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                    <p className="text-xs text-slate-500">Delivery Rate</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <div className="text-xl font-bold text-red-600" data-testid="email-bounce-rate">{emailData?.bounceRate?.toFixed(1) || "0.0"}%</div>
                      <XCircle className="h-5 w-5 text-red-500" />
                    </div>
                    <p className="text-xs text-slate-500">Bounce Rate</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <div className="text-xl font-bold text-yellow-600" data-testid="email-spam-rate">{emailData?.spamRate?.toFixed(1) || "0.0"}%</div>
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    </div>
                    <p className="text-xs text-slate-500">Spam Report Rate</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Mailbox List */}
            {emailData?.mailboxes?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Recent Mailboxes</h4>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Emails Sent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emailData.mailboxes.slice(0, 5).map((mailbox: any) => (
                        <TableRow key={mailbox.id} data-testid={`row-mailbox-${mailbox.id}`}>
                          <TableCell>{mailbox.email}</TableCell>
                          <TableCell>{mailbox.organizationName || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant={mailbox.status === "active" ? "default" : mailbox.status === "error" ? "destructive" : "secondary"}>
                              {mailbox.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{mailbox.emailsSent || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Storage Management Component
function StorageManagement() {
  const { data: storageData, isLoading } = useQuery({
    queryKey: ["/api/super-admin/storage"],
    queryFn: () => superAdminFetch("/api/super-admin/storage"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Storage Management
        </CardTitle>
        <CardDescription>
          Database and storage usage across the platform
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading storage data...</div>
        ) : (
          <div className="space-y-6">
            {/* Overall Storage Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-8 w-8 text-blue-500" />
                    <div>
                      <div className="text-2xl font-bold" data-testid="storage-total-prospects">{storageData?.totalProspects?.toLocaleString() || 0}</div>
                      <p className="text-xs text-slate-500">Total Prospects</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Mail className="h-8 w-8 text-green-500" />
                    <div>
                      <div className="text-2xl font-bold" data-testid="storage-total-sequences">{storageData?.totalSequences || 0}</div>
                      <p className="text-xs text-slate-500">Total Sequences</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Activity className="h-8 w-8 text-purple-500" />
                    <div>
                      <div className="text-2xl font-bold" data-testid="storage-total-emails">{storageData?.totalEmails?.toLocaleString() || 0}</div>
                      <p className="text-xs text-slate-500">Total Emails Sent</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tenant Usage Table */}
            {storageData?.tenantUsage?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Tenant Resource Usage</h4>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Users</TableHead>
                        <TableHead>Prospects</TableHead>
                        <TableHead>Sequences</TableHead>
                        <TableHead>Mailboxes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {storageData.tenantUsage.slice(0, 10).map((tenant: any) => (
                        <TableRow key={tenant.organizationId} data-testid={`row-storage-${tenant.organizationId}`}>
                          <TableCell className="font-medium">{tenant.organizationName}</TableCell>
                          <TableCell>
                            {tenant.currentUsers}/{tenant.maxUsers}
                            <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                              <div 
                                className="bg-blue-600 h-1.5 rounded-full" 
                                style={{ width: `${Math.min(100, (tenant.currentUsers / tenant.maxUsers) * 100)}%` }}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            {tenant.currentProspects}/{tenant.maxProspects}
                          </TableCell>
                          <TableCell>
                            {tenant.currentSequences}/{tenant.maxSequences}
                          </TableCell>
                          <TableCell>
                            {tenant.currentMailboxes}/{tenant.maxMailboxes}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Resource Monitoring Component
function ResourceMonitoring() {
  const { data: resourceData, isLoading } = useQuery({
    queryKey: ["/api/super-admin/resources"],
    queryFn: () => superAdminFetch("/api/super-admin/resources"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Resource Monitoring
        </CardTitle>
        <CardDescription>
          Server capacity and resource utilization
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading resource data...</div>
        ) : (
          <div className="space-y-6">
            {/* System Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold" data-testid="resource-active-sequences">{resourceData?.activeSequences || 0}</div>
                  <p className="text-xs text-slate-500">Active Sequences</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold" data-testid="resource-pending-emails">{resourceData?.pendingEmails || 0}</div>
                  <p className="text-xs text-slate-500">Pending Emails</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold" data-testid="resource-emails-today">{resourceData?.emailsSentToday || 0}</div>
                  <p className="text-xs text-slate-500">Emails Today</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold" data-testid="resource-api-calls">{resourceData?.apiCallsToday || 0}</div>
                  <p className="text-xs text-slate-500">API Calls Today</p>
                </CardContent>
              </Card>
            </div>

            {/* Capacity Limits */}
            <div className="space-y-2">
              <h4 className="font-medium">Platform Capacity</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm">Daily Email Capacity</span>
                      <span className="text-sm font-medium">{resourceData?.emailsSentToday || 0} / {resourceData?.dailyEmailLimit || 10000}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${Math.min(100, ((resourceData?.emailsSentToday || 0) / (resourceData?.dailyEmailLimit || 10000)) * 100)}%` }}
                        data-testid="progress-email-capacity"
                      />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm">Active Tenants</span>
                      <span className="text-sm font-medium">{resourceData?.activeTenants || 0}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {resourceData?.tenantGrowthRate > 0 ? "+" : ""}{resourceData?.tenantGrowthRate?.toFixed(1) || "0.0"}% this month
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Security Dashboard Component
function SecurityDashboard() {
  const { data: securityData, isLoading } = useQuery({
    queryKey: ["/api/super-admin/security"],
    queryFn: () => superAdminFetch("/api/super-admin/security"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Security Dashboard
        </CardTitle>
        <CardDescription>
          Failed logins, suspicious activity, and security alerts
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading security data...</div>
        ) : (
          <div className="space-y-6">
            {/* Security Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-8 w-8 text-red-500" />
                    <div>
                      <div className="text-2xl font-bold" data-testid="security-failed-logins">{securityData?.failedLoginsToday || 0}</div>
                      <p className="text-xs text-slate-500">Failed Logins Today</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-8 w-8 text-yellow-500" />
                    <div>
                      <div className="text-2xl font-bold" data-testid="security-suspicious-count">{securityData?.suspiciousActivityCount || 0}</div>
                      <p className="text-xs text-slate-500">Suspicious Activities</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Pause className="h-8 w-8 text-orange-500" />
                    <div>
                      <div className="text-2xl font-bold" data-testid="security-suspended-users">{securityData?.suspendedUsers || 0}</div>
                      <p className="text-xs text-slate-500">Suspended Users</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-8 w-8 text-green-500" />
                    <div>
                      <div className="text-2xl font-bold" data-testid="security-active-sessions">{securityData?.activeSessions || 0}</div>
                      <p className="text-xs text-slate-500">Active Sessions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Security Events */}
            {securityData?.recentEvents?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Recent Security Events</h4>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {securityData.recentEvents.slice(0, 10).map((event: any, index: number) => (
                        <TableRow key={index} data-testid={`row-security-event-${index}`}>
                          <TableCell>
                            <Badge variant={event.severity === "high" ? "destructive" : event.severity === "medium" ? "secondary" : "outline"}>
                              {event.type}
                            </Badge>
                          </TableCell>
                          <TableCell>{event.userEmail || "Unknown"}</TableCell>
                          <TableCell>{event.ipAddress || "N/A"}</TableCell>
                          <TableCell className="text-sm text-slate-500">
                            {event.createdAt ? new Date(event.createdAt).toLocaleString() : "N/A"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Tenant Isolation Test Component
function TenantIsolationTest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runIsolationTest = async () => {
    setIsRunning(true);
    try {
      const result = await superAdminFetch("/api/super-admin/security/isolation-test", { method: "POST" });
      setTestResults(result.results || []);
      toast({
        title: result.success ? "All tests passed" : "Some tests failed",
        description: `${result.passedCount}/${result.totalTests} tests passed`,
        variant: result.success ? "default" : "destructive",
      });
    } catch (error: any) {
      toast({ title: "Failed to run isolation test", description: error.message, variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Tenant Isolation Verification
            </CardTitle>
            <CardDescription>
              Verify data isolation between tenants
            </CardDescription>
          </div>
          <Button onClick={runIsolationTest} disabled={isRunning} data-testid="button-run-isolation-test">
            {isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Isolation Tests
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {testResults.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            Click "Run Isolation Tests" to verify tenant data isolation
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold" data-testid="isolation-total-tests">{testResults.length}</div>
                  <p className="text-xs text-slate-500">Total Tests</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-green-600" data-testid="isolation-passed-tests">
                    {testResults.filter(t => t.status === "passed").length}
                  </div>
                  <p className="text-xs text-slate-500">Passed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-red-600" data-testid="isolation-failed-tests">
                    {testResults.filter(t => t.status === "failed").length}
                  </div>
                  <p className="text-xs text-slate-500">Failed</p>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testResults.map((test: any, index: number) => (
                    <TableRow key={index} data-testid={`row-isolation-test-${index}`}>
                      <TableCell className="font-medium">{test.name}</TableCell>
                      <TableCell>
                        {test.status === "passed" ? (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Passed
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">{test.details}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// PHASE 2 COMPONENTS
// ============================================

// Audit Logs Component (FR-SA21)
function AuditLogs() {
  const [actionFilter, setActionFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { toast } = useToast();

  const { data: auditData, isLoading } = useQuery({
    queryKey: ["/api/super-admin/audit-logs", actionFilter, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      return superAdminFetch(`/api/super-admin/audit-logs?${params.toString()}`);
    },
  });

  const [isExporting, setIsExporting] = useState(false);
  
  const exportLogs = async (format: string) => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      
      const response = await fetch(`/api/super-admin/audit-logs/export?${params.toString()}`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }
      
      if (format === "csv") {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "audit-logs.csv";
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "CSV exported successfully" });
      } else {
        const data = await response.json();
        toast({ title: `Exported ${data.logs?.length || 0} audit logs` });
      }
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Platform Audit Logs
            </CardTitle>
            <CardDescription>
              Tamper-proof audit trail with 5-year retention
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportLogs("csv")} disabled={isExporting} data-testid="button-export-csv">
              {isExporting ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportLogs("json")} disabled={isExporting} data-testid="button-export-json">
              {isExporting ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              JSON
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 mb-4">
          <Select value={actionFilter || "all"} onValueChange={(v) => setActionFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[180px]" data-testid="select-audit-action">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {auditData?.actionTypes?.map((action: string) => (
                <SelectItem key={action} value={action}>{action}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-[150px]"
            data-testid="input-audit-start-date"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-[150px]"
            data-testid="input-audit-end-date"
          />
        </div>

        <div className="text-sm text-slate-500 mb-4">
          Total: {auditData?.total || 0} logs | Retention: {auditData?.retentionDays || 1825} days (5 years)
        </div>

        <div className="rounded-md border max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">Loading audit logs...</TableCell>
                </TableRow>
              ) : auditData?.logs?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">No audit logs found</TableCell>
                </TableRow>
              ) : (
                auditData?.logs?.map((log: any) => (
                  <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                    <TableCell className="text-sm">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : "N/A"}
                    </TableCell>
                    <TableCell>{log.adminName || log.adminEmail || "System"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {log.targetType}: {log.targetId || "N/A"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{log.ipAddress || "N/A"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// Platform Health Dashboard (FR-SA22)
function PlatformHealth() {
  const { data: healthData, isLoading, isError, error } = useQuery({
    queryKey: ["/api/super-admin/platform-health"],
    queryFn: () => superAdminFetch("/api/super-admin/platform-health"),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const getStatusColor = (status: string | undefined) => {
    switch (status) {
      case "operational": return "text-green-600";
      case "degraded": return "text-yellow-600";
      case "down": return "text-red-600";
      default: return "text-slate-500";
    }
  };
  
  const formatUptime = (uptime: number | undefined | null) => {
    if (uptime === undefined || uptime === null) return "N/A";
    return `${uptime.toFixed(2)}%`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Platform Health
            </CardTitle>
            <CardDescription>
              Real-time platform status and metrics
            </CardDescription>
          </div>
          <Badge variant={healthData?.overallStatus === "healthy" ? "default" : "destructive"} data-testid="badge-health-status">
            {healthData?.overallStatus?.toUpperCase() || "UNKNOWN"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading health data...</div>
        ) : isError ? (
          <div className="text-center py-8 text-red-500">
            <AlertCircle className="h-12 w-12 mx-auto mb-2" />
            <p>Failed to load health data</p>
            <p className="text-sm text-slate-500">{(error as Error)?.message || "Unknown error"}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Service Status */}
            <div>
              <h4 className="font-medium mb-3">Service Status</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(healthData?.services || {}).map(([name, service]: [string, any]) => (
                  <Card key={name}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">{name}</span>
                        <span className={getStatusColor(service?.status)}>
                          {service?.status === "operational" ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : (
                            <AlertCircle className="h-5 w-5" />
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Uptime: {formatUptime(service?.uptime)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Key Metrics */}
            <div>
              <h4 className="font-medium mb-3">Key Metrics</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold" data-testid="health-total-tenants">
                      {healthData?.metrics?.totalTenants || 0}
                    </div>
                    <p className="text-xs text-slate-500">Total Tenants</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-green-600" data-testid="health-active-24h">
                      {healthData?.metrics?.activeUsers24h || 0}
                    </div>
                    <p className="text-xs text-slate-500">Active (24h)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-blue-600" data-testid="health-active-7d">
                      {healthData?.metrics?.activeUsers7d || 0}
                    </div>
                    <p className="text-xs text-slate-500">Active (7d)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-purple-600" data-testid="health-active-30d">
                      {healthData?.metrics?.activeUsers30d || 0}
                    </div>
                    <p className="text-xs text-slate-500">Active (30d)</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Email Metrics */}
            <div>
              <h4 className="font-medium mb-3">Email Performance</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-xl font-bold" data-testid="health-emails-today">
                      {healthData?.metrics?.emailsToday || 0}
                    </div>
                    <p className="text-xs text-slate-500">Emails Today</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-xl font-bold">
                      {healthData?.metrics?.emailsThisWeek || 0}
                    </div>
                    <p className="text-xs text-slate-500">This Week</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-xl font-bold">
                      {healthData?.metrics?.emailsThisMonth || 0}
                    </div>
                    <p className="text-xs text-slate-500">This Month</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className={`text-xl font-bold ${Number(healthData?.metrics?.errorRate) > 5 ? "text-red-600" : "text-green-600"}`}>
                      {healthData?.metrics?.errorRate || "0.00"}%
                    </div>
                    <p className="text-xs text-slate-500">Error Rate</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Recent Incidents */}
            {healthData?.recentIncidents?.length > 0 && (
              <div>
                <h4 className="font-medium mb-3">Recent Incidents</h4>
                <div className="space-y-2">
                  {healthData.recentIncidents.map((incident: any) => (
                    <div key={incident.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <AlertTriangle className={`h-5 w-5 ${incident.severity === "critical" ? "text-red-500" : "text-orange-500"}`} />
                      <div className="flex-1">
                        <p className="font-medium">{incident.title}</p>
                        <p className="text-sm text-slate-500">{incident.message}</p>
                      </div>
                      <Badge variant={incident.status === "resolved" ? "default" : "destructive"}>
                        {incident.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400 text-right">
              Last updated: {healthData?.lastUpdated ? new Date(healthData.lastUpdated).toLocaleString() : "N/A"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Tenant Usage Analytics (FR-SA23)
function TenantUsageAnalytics() {
  const { data: usageData, isLoading, isError, error } = useQuery({
    queryKey: ["/api/super-admin/tenant-usage"],
    queryFn: () => superAdminFetch("/api/super-admin/tenant-usage"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LineChart className="h-5 w-5" />
          Tenant Usage Analytics
        </CardTitle>
        <CardDescription>
          Usage metrics, churn risk, and upsell opportunities
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading usage analytics...</div>
        ) : isError ? (
          <div className="text-center py-8 text-red-500">
            <AlertCircle className="h-12 w-12 mx-auto mb-2" />
            <p>Failed to load usage data</p>
            <p className="text-sm text-slate-500">{(error as Error)?.message || "Unknown error"}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold" data-testid="usage-total-tenants">
                    {usageData?.summary?.total || 0}
                  </div>
                  <p className="text-xs text-slate-500">Total Tenants</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-green-600" data-testid="usage-high-usage">
                    {usageData?.summary?.highUsage || 0}
                  </div>
                  <p className="text-xs text-slate-500">High Usage</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-red-600" data-testid="usage-at-risk">
                    {usageData?.summary?.atRisk || 0}
                  </div>
                  <p className="text-xs text-slate-500">At Risk (Churn)</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-purple-600" data-testid="usage-upsell">
                    {usageData?.summary?.upsellCandidates || 0}
                  </div>
                  <p className="text-xs text-slate-500">Upsell Candidates</p>
                </CardContent>
              </Card>
            </div>

            {/* Tenant Table */}
            <div className="rounded-md border max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Emails Sent</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Last Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageData?.tenants?.map((tenant: any) => (
                    <TableRow key={tenant.organizationId} data-testid={`row-usage-${tenant.organizationId}`}>
                      <TableCell className="font-medium">{tenant.organizationName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{tenant.plan || "trial"}</Badge>
                      </TableCell>
                      <TableCell>{tenant.currentUserCount || 0}</TableCell>
                      <TableCell>{tenant.totalEmailsSent || 0}</TableCell>
                      <TableCell>
                        <Badge variant={tenant.usageLevel === "high" ? "default" : tenant.usageLevel === "medium" ? "secondary" : "outline"}>
                          {tenant.usageLevel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={tenant.churnRisk === "high" ? "destructive" : tenant.churnRisk === "medium" ? "secondary" : "outline"}>
                          {tenant.churnRisk}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {tenant.lastActivityAt ? new Date(tenant.lastActivityAt).toLocaleDateString() : "Never"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Alerts Panel (FR-SA26)
function AlertsPanel() {
  const [statusFilter, setStatusFilter] = useState("active");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: alertsData, isLoading, isError, error } = useQuery({
    queryKey: ["/api/super-admin/alerts", statusFilter],
    queryFn: () => superAdminFetch(`/api/super-admin/alerts?status=${statusFilter}`),
  });

  const updateAlertMutation = useMutation({
    mutationFn: ({ alertId, status, resolutionNotes }: { alertId: string; status: string; resolutionNotes?: string }) =>
      superAdminFetch(`/api/super-admin/alerts/${alertId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, resolutionNotes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/alerts"] });
      toast({ title: "Alert updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update alert", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Platform Alerts
            </CardTitle>
            <CardDescription>
              System alerts and incident management
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="destructive">Active: {alertsData?.counts?.active || 0}</Badge>
            <Badge variant="secondary">Acknowledged: {alertsData?.counts?.acknowledged || 0}</Badge>
            <Badge variant="outline">Resolved: {alertsData?.counts?.resolved || 0}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-alert-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-8">Loading alerts...</div>
        ) : isError ? (
          <div className="text-center py-8 text-red-500">
            <AlertCircle className="h-12 w-12 mx-auto mb-2" />
            <p>Failed to load alerts</p>
            <p className="text-sm text-slate-500">{(error as Error)?.message || "Unknown error"}</p>
          </div>
        ) : alertsData?.alerts?.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Bell className="h-12 w-12 mx-auto mb-2 opacity-20" />
            No {statusFilter} alerts
          </div>
        ) : (
          <div className="space-y-3">
            {alertsData?.alerts?.map((alert: any) => (
              <div 
                key={alert.id} 
                className={`p-4 border rounded-lg ${
                  alert.severity === "critical" || alert.severity === "emergency" 
                    ? "border-red-200 bg-red-50" 
                    : alert.severity === "warning" 
                    ? "border-yellow-200 bg-yellow-50" 
                    : "border-slate-200"
                }`}
                data-testid={`alert-${alert.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={alert.severity === "critical" || alert.severity === "emergency" ? "destructive" : "secondary"}>
                        {alert.severity}
                      </Badge>
                      <Badge variant="outline">{alert.alertType}</Badge>
                    </div>
                    <h4 className="font-medium">{alert.title}</h4>
                    <p className="text-sm text-slate-600">{alert.message}</p>
                    <p className="text-xs text-slate-400 mt-2">
                      {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {alert.status === "active" && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => updateAlertMutation.mutate({ alertId: alert.id, status: "acknowledged" })}
                        data-testid={`button-acknowledge-${alert.id}`}
                      >
                        Acknowledge
                      </Button>
                    )}
                    {(alert.status === "active" || alert.status === "acknowledged") && (
                      <Button 
                        size="sm"
                        onClick={() => updateAlertMutation.mutate({ alertId: alert.id, status: "resolved", resolutionNotes: "Resolved by super admin" })}
                        data-testid={`button-resolve-${alert.id}`}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Communications Panel (FR-SA28)
function CommunicationsPanel() {
  const [showCompose, setShowCompose] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: commsData, isLoading, isError, error } = useQuery({
    queryKey: ["/api/super-admin/communications"],
    queryFn: () => superAdminFetch("/api/super-admin/communications"),
  });

  const [newComm, setNewComm] = useState({
    type: "custom",
    subject: "",
    body: "",
    targetAll: true,
    targetPlanTypes: [] as string[],
  });

  const createCommMutation = useMutation({
    mutationFn: (data: any) =>
      superAdminFetch("/api/super-admin/communications", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/communications"] });
      toast({ title: "Communication created" });
      setShowCompose(false);
      setNewComm({ type: "custom", subject: "", body: "", targetAll: true, targetPlanTypes: [] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create communication", description: error.message, variant: "destructive" });
    },
  });

  const sendCommMutation = useMutation({
    mutationFn: (commId: string) =>
      superAdminFetch(`/api/super-admin/communications/${commId}/send`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/communications"] });
      toast({ title: "Communication sent", description: `Sent to ${data.recipientCount} recipients` });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Tenant Communications
            </CardTitle>
            <CardDescription>
              Broadcast messages and targeted announcements
            </CardDescription>
          </div>
          <Button onClick={() => setShowCompose(!showCompose)} data-testid="button-compose-comm">
            <Plus className="h-4 w-4 mr-2" />
            New Communication
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showCompose && (
          <div className="mb-6 p-4 border rounded-lg bg-slate-50">
            <h4 className="font-medium mb-4">Compose Communication</h4>
            <div className="space-y-4">
              <div>
                <Label>Type</Label>
                <Select value={newComm.type} onValueChange={(v) => setNewComm({ ...newComm, type: v })}>
                  <SelectTrigger data-testid="select-comm-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform_update">Platform Update</SelectItem>
                    <SelectItem value="new_feature">New Feature</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="security_alert">Security Alert</SelectItem>
                    <SelectItem value="best_practice">Best Practice</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subject</Label>
                <Input
                  value={newComm.subject}
                  onChange={(e) => setNewComm({ ...newComm, subject: e.target.value })}
                  placeholder="Communication subject..."
                  data-testid="input-comm-subject"
                />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea
                  value={newComm.body}
                  onChange={(e) => setNewComm({ ...newComm, body: e.target.value })}
                  placeholder="Write your message..."
                  rows={5}
                  data-testid="input-comm-body"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => createCommMutation.mutate(newComm)}
                  disabled={!newComm.subject || !newComm.body || createCommMutation.isPending}
                  data-testid="button-save-comm"
                >
                  Save as Draft
                </Button>
                <Button variant="outline" onClick={() => setShowCompose(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8">Loading communications...</div>
        ) : isError ? (
          <div className="text-center py-8 text-red-500">
            <AlertCircle className="h-12 w-12 mx-auto mb-2" />
            <p>Failed to load communications</p>
            <p className="text-sm text-slate-500">{(error as Error)?.message || "Unknown error"}</p>
          </div>
        ) : commsData?.communications?.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
            No communications yet
          </div>
        ) : (
          <div className="space-y-3">
            {commsData?.communications?.map((comm: any) => (
              <div key={comm.id} className="p-4 border rounded-lg" data-testid={`comm-${comm.id}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={comm.status === "sent" ? "default" : "secondary"}>
                        {comm.status}
                      </Badge>
                      <Badge variant="outline">{comm.type}</Badge>
                    </div>
                    <h4 className="font-medium">{comm.subject}</h4>
                    <p className="text-sm text-slate-500 mt-1">
                      {comm.status === "sent" 
                        ? `Sent to ${comm.recipientCount} recipients • ${comm.openCount} opens • ${comm.clickCount} clicks`
                        : `Created by ${comm.createdByName}`}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {comm.sentAt ? `Sent: ${new Date(comm.sentAt).toLocaleString()}` : `Created: ${new Date(comm.createdAt).toLocaleString()}`}
                    </p>
                  </div>
                  {comm.status === "draft" && (
                    <Button 
                      size="sm"
                      onClick={() => sendCommMutation.mutate(comm.id)}
                      disabled={sendCommMutation.isPending}
                      data-testid={`button-send-${comm.id}`}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Send
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Onboarding Panel (FR-SA29)
function OnboardingPanel() {
  const [riskFilter, setRiskFilter] = useState("");
  const { data: onboardingData, isLoading, isError, error } = useQuery({
    queryKey: ["/api/super-admin/onboarding", riskFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (riskFilter) params.set("riskLevel", riskFilter);
      return superAdminFetch(`/api/super-admin/onboarding?${params.toString()}`);
    },
  });

  const getProgressColor = (progress: number | undefined | null) => {
    const p = progress || 0;
    if (p >= 80) return "bg-green-500";
    if (p >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Onboarding & Success
        </CardTitle>
        <CardDescription>
          Track tenant onboarding progress and health scores
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold" data-testid="onboarding-total">
                {onboardingData?.summary?.total || 0}
              </div>
              <p className="text-xs text-slate-500">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600" data-testid="onboarding-completed">
                {onboardingData?.summary?.completed || 0}
              </div>
              <p className="text-xs text-slate-500">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600" data-testid="onboarding-in-progress">
                {onboardingData?.summary?.inProgress || 0}
              </div>
              <p className="text-xs text-slate-500">In Progress</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600" data-testid="onboarding-at-risk">
                {onboardingData?.summary?.atRisk || 0}
              </div>
              <p className="text-xs text-slate-500">At Risk</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-4 mb-4">
          <Select value={riskFilter || "all"} onValueChange={(v) => setRiskFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px]" data-testid="select-risk-filter">
              <SelectValue placeholder="Risk Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="low">Low Risk</SelectItem>
              <SelectItem value="medium">Medium Risk</SelectItem>
              <SelectItem value="high">High Risk</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-8">Loading onboarding data...</div>
        ) : isError ? (
          <div className="text-center py-8 text-red-500">
            <AlertCircle className="h-12 w-12 mx-auto mb-2" />
            <p>Failed to load onboarding data</p>
            <p className="text-sm text-slate-500">{(error as Error)?.message || "Unknown error"}</p>
          </div>
        ) : onboardingData?.onboarding?.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Rocket className="h-12 w-12 mx-auto mb-2 opacity-20" />
            No onboarding records found
          </div>
        ) : (
          <div className="space-y-3">
            {onboardingData?.onboarding?.map((tenant: any) => (
              <div key={tenant.id} className="p-4 border rounded-lg" data-testid={`onboarding-${tenant.organizationId}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium">{tenant.organizationName}</h4>
                    <div className="flex gap-2 mt-1">
                      <Badge variant={tenant.onboardingCompleted ? "default" : "secondary"}>
                        {tenant.onboardingCompleted ? "Completed" : "In Progress"}
                      </Badge>
                      <Badge variant={tenant.healthRiskLevel === "high" ? "destructive" : tenant.healthRiskLevel === "medium" ? "secondary" : "outline"}>
                        {tenant.healthRiskLevel} risk
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{tenant.healthScore || 50}</div>
                    <p className="text-xs text-slate-500">Health Score</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Progress</span>
                    <span>{tenant.onboardingProgress || 0}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${getProgressColor(tenant.onboardingProgress || 0)}`}
                      style={{ width: `${tenant.onboardingProgress || 0}%` }}
                    />
                  </div>
                </div>

                {/* Checklist */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div className={`flex items-center gap-1 ${tenant.managerAccountCreated ? "text-green-600" : "text-slate-400"}`}>
                    {tenant.managerAccountCreated ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    Manager Created
                  </div>
                  <div className={`flex items-center gap-1 ${tenant.initialUsersAdded ? "text-green-600" : "text-slate-400"}`}>
                    {tenant.initialUsersAdded ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    Users Added
                  </div>
                  <div className={`flex items-center gap-1 ${tenant.mailboxConnected ? "text-green-600" : "text-slate-400"}`}>
                    {tenant.mailboxConnected ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    Mailbox Connected
                  </div>
                  <div className={`flex items-center gap-1 ${tenant.firstEmailSent ? "text-green-600" : "text-slate-400"}`}>
                    {tenant.firstEmailSent ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    First Email Sent
                  </div>
                  <div className={`flex items-center gap-1 ${tenant.firstCampaignLaunched ? "text-green-600" : "text-slate-400"}`}>
                    {tenant.firstCampaignLaunched ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    Campaign Launched
                  </div>
                  <div className={`flex items-center gap-1 ${tenant.domainConfigured ? "text-green-600" : "text-slate-400"}`}>
                    {tenant.domainConfigured ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    Domain Configured
                  </div>
                  <div className={`flex items-center gap-1 ${tenant.firstProspectAdded ? "text-green-600" : "text-slate-400"}`}>
                    {tenant.firstProspectAdded ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    Prospect Added
                  </div>
                  <div className={`flex items-center gap-1 ${tenant.firstMeetingBooked ? "text-green-600" : "text-slate-400"}`}>
                    {tenant.firstMeetingBooked ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    Meeting Booked
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
