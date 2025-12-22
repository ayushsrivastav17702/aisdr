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
  ClipboardList
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
      window.location.href = "/super-admin/login";
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
  const [selectedTenant, setSelectedTenant] = useState<TenantWithSettings | null>(null);

  useEffect(() => {
    const storedAdmin = sessionStorage.getItem("super_admin");
    if (storedAdmin) {
      setSuperAdmin(JSON.parse(storedAdmin));
    } else {
      setLocation("/super-admin/login");
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

  const handleLogout = async () => {
    try {
      await superAdminFetch("/api/super-admin/logout", { method: "POST" });
    } catch (e) {
      // Ignore errors
    }
    sessionStorage.removeItem("super_admin");
    setLocation("/super-admin/login");
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* Tenant Management */}
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
                                  onClick={() => updateStatusMutation.mutate({ 
                                    id: tenant.organization.id, 
                                    status: "active" 
                                  })}
                                >
                                  <Play className="h-4 w-4 mr-2" />
                                  Activate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem 
                                  className="text-orange-600"
                                  onClick={() => updateStatusMutation.mutate({ 
                                    id: tenant.organization.id, 
                                    status: "suspended",
                                    reason: "Suspended by super admin"
                                  })}
                                >
                                  <Pause className="h-4 w-4 mr-2" />
                                  Suspend
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-red-600">
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
