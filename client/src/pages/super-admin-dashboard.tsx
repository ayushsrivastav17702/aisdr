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
  ShieldCheck
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
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 h-auto">
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
      const result = await superAdminFetch("/api/super-admin/isolation-test", { method: "POST" });
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
