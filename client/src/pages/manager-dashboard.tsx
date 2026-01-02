import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Users,
  UserPlus,
  Mail,
  Activity,
  TrendingUp,
  Clock,
  MoreHorizontal,
  Search,
  Shield,
  Edit,
  Trash2,
  Eye,
  BarChart3,
  Target,
  Pause,
  Play,
  CheckCircle,
  XCircle,
  RefreshCw,
  Send,
  Inbox,
  HardDrive,
  MessageSquare,
  FileText,
  Settings,
  Trophy,
  ArrowRightLeft,
  X
} from "lucide-react";

interface TeamMember {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
  onboardingCompleted: boolean;
}

interface TeamStats {
  totalUsers: number;
  activeUsers: number;
  totalEmailsSent: number;
  totalMeetingsBooked: number;
  replyRate: number;
  openRate: number;
  activeCampaigns: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  userId: string;
  totalProspects: number;
  activeProspects: number;
  completedProspects: number;
  createdAt: string;
  updatedAt: string;
  ownerEmail: string;
  ownerName: string;
  stats: {
    totalProspects: number;
    sent: number;
    replies: number;
    replyRate: number;
  };
}

interface Analytics {
  period: string;
  emailStats: {
    sent: number;
    replied: number;
    positiveReplies: number;
    replyRate: number;
  };
  campaignStats: {
    active: number;
    paused: number;
    completed: number;
    draft: number;
  };
  topPerformers: Array<{
    id: string;
    email: string;
    name: string;
    emailsSent: number;
  }>;
}

interface ResourceAllocation {
  teamResources: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    mailboxes: number;
    activeMailboxes: number;
    prospects: number;
  }>;
  totals: {
    totalMailboxes: number;
    totalActiveMailboxes: number;
    totalProspects: number;
  };
}

interface UserPerformance {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    lastLogin: string | null;
    createdAt: string;
  };
  period: string;
  performance: {
    emailsSent: number;
    replies: number;
    positiveReplies: number;
    replyRate: number;
    totalCampaigns: number;
    activeCampaigns: number;
  };
  resources: {
    totalMailboxes: number;
    activeMailboxes: number;
    totalProspects: number;
  };
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    totalProspects: number;
    createdAt: string;
  }>;
}

interface Leaderboard {
  leaderboard: Array<{
    id: string;
    email: string;
    name: string;
    emailsSent: number;
    replies: number;
    positiveReplies: number;
    replyRate: number;
    rank: number;
  }>;
  period: string;
  sortBy: string;
}

export default function ManagerDashboard() {
  const [location, setLocation] = useLocation();
  const searchString = useSearch(); // This properly tracks query param changes
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", firstName: "", lastName: "", role: "user" });
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [selectedPeriod, setSelectedPeriod] = useState("30d");
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: string; userId?: string; campaignId?: string }>({ open: false, type: "" });
  const [performanceModal, setPerformanceModal] = useState<{ open: boolean; userId?: string }>({ open: false });
  const [reassignModal, setReassignModal] = useState<{ open: boolean; campaignId?: string; campaignName?: string }>({ open: false });
  const [selectedNewOwner, setSelectedNewOwner] = useState<string>("");
  const { toast } = useToast();
  const { user } = useAuth();

  // Parse tab from URL query parameter using the reactive searchString
  const getTabFromSearch = (search: string) => {
    const urlParams = new URLSearchParams(search);
    const tab = urlParams.get('tab');
    if (tab && ['team', 'campaigns', 'performance', 'settings'].includes(tab)) {
      return tab;
    }
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState(() => getTabFromSearch(searchString));

  // Sync tab with URL search params changes - useSearch hook properly tracks query param changes
  useEffect(() => {
    setActiveTab(getTabFromSearch(searchString));
  }, [searchString]);

  // Update URL when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'overview') {
      setLocation('/manager/dashboard');
    } else {
      setLocation(`/manager/dashboard?tab=${tab}`);
    }
  };

  // Queries
  const { data: teamData, isLoading: teamLoading } = useQuery<{ members: TeamMember[]; total: number; page: number; limit: number; totalPages: number }>({
    queryKey: ["/api/manager/team"],
  });
  const teamMembers = teamData?.members ?? [];

  const { data: stats } = useQuery<TeamStats>({
    queryKey: ["/api/manager/stats"],
  });

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery<{ campaigns: Campaign[]; total: number }>({
    queryKey: ["/api/manager/campaigns", campaignFilter],
    queryFn: async () => {
      const url = campaignFilter === "all" 
        ? "/api/manager/campaigns" 
        : `/api/manager/campaigns?status=${campaignFilter}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const { data: analytics } = useQuery<Analytics>({
    queryKey: ["/api/manager/analytics", selectedPeriod],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/manager/analytics?period=${selectedPeriod}`);
      return res.json();
    },
  });

  const { data: resources } = useQuery<ResourceAllocation>({
    queryKey: ["/api/manager/resources"],
  });

  const { data: userPerformance, isLoading: performanceLoading, refetch: refetchPerformance } = useQuery<UserPerformance>({
    queryKey: ["/api/manager/users", performanceModal.userId, "performance", selectedPeriod],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/manager/users/${performanceModal.userId}/performance?period=${selectedPeriod}`);
      return res.json();
    },
    enabled: !!performanceModal.userId && performanceModal.open,
    staleTime: 0,
  });


  // Mutations
  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      return await apiRequest("POST", "/api/manager/users", userData);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/manager/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager/stats"] });
      setIsCreateDialogOpen(false);
      setNewUser({ email: "", firstName: "", lastName: "", role: "user" });
      
      if (data.emailSent) {
        toast({
          title: "User created",
          description: "An invitation has been sent to the new user.",
        });
      } else if (data.inviteUrl) {
        // Copy invite URL to clipboard if email failed
        navigator.clipboard.writeText(data.inviteUrl);
        toast({
          title: "User created",
          description: "Email sending failed, but the invite link has been copied to your clipboard. Share it manually with the user.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("DELETE", `/api/manager/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manager/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager/stats"] });
      setConfirmDialog({ open: false, type: "" });
      toast({ title: "User deactivated", description: "The user has been deactivated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/manager/users/${userId}/reset-password`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      setConfirmDialog({ open: false, type: "" });
      toast({ 
        title: "Password reset", 
        description: `Temporary password: ${data.tempPassword}. Please share it securely with the user.` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/manager/users/${userId}/resend-invite`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.emailSent) {
        toast({ 
          title: "Invitation sent", 
          description: "The invitation email has been resent to the user." 
        });
      } else {
        // Copy invite URL to clipboard if email failed
        if (data.inviteUrl) {
          navigator.clipboard.writeText(data.inviteUrl);
          toast({ 
            title: "Invitation link copied", 
            description: "Email sending failed, but the invite link has been copied to your clipboard. Share it manually with the user.",
            variant: "default"
          });
        }
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const approveCampaignMutation = useMutation({
    mutationFn: async ({ campaignId, approved }: { campaignId: string; approved: boolean }) => {
      return await apiRequest("POST", `/api/manager/campaigns/${campaignId}/approve`, { approved });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manager/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager/stats"] });
      toast({ title: "Campaign updated", description: "Campaign status has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const pauseCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      return await apiRequest("POST", `/api/manager/campaigns/${campaignId}/pause`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manager/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager/stats"] });
      toast({ title: "Campaign paused", description: "The campaign has been paused." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const reassignCampaignMutation = useMutation({
    mutationFn: async ({ campaignId, newUserId }: { campaignId: string; newUserId: string }) => {
      return await apiRequest("POST", `/api/manager/campaigns/${campaignId}/reassign`, { newUserId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manager/campaigns"] });
      setReassignModal({ open: false });
      setSelectedNewOwner("");
      toast({ title: "Campaign reassigned", description: "The campaign has been reassigned to the new owner." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Refetch performance data when modal opens with a different user
  useEffect(() => {
    if (performanceModal.open && performanceModal.userId) {
      refetchPerformance();
    }
  }, [performanceModal.open, performanceModal.userId]);

  const filteredMembers = teamMembers.filter(member =>
    member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    `${member.firstName} ${member.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      inactive: "secondary",
      suspended: "destructive",
      pending: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const getCampaignStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      active: { variant: "default", label: "Active" },
      paused: { variant: "secondary", label: "Paused" },
      draft: { variant: "outline", label: "Draft" },
      completed: { variant: "default", label: "Completed" },
    };
    const s = config[status] || { variant: "outline", label: status };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  const getRoleBadge = (role: string) => {
    return (
      <Badge variant={role === "admin" ? "default" : "secondary"}>
        {role === "admin" ? "Manager" : "SDR"}
      </Badge>
    );
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="page-title">Manager Dashboard</h1>
            <p className="text-muted-foreground">Manage your team, campaigns, and track performance</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/manager/team"] });
                queryClient.invalidateQueries({ queryKey: ["/api/manager/stats"] });
                queryClient.invalidateQueries({ queryKey: ["/api/manager/campaigns"] });
                queryClient.invalidateQueries({ queryKey: ["/api/manager/analytics"] });
                queryClient.invalidateQueries({ queryKey: ["/api/manager/resources"] });
              }}
              data-testid="btn-refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Team Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-users">
                {stats?.totalUsers || teamMembers.length}
              </div>
              <p className="text-xs text-muted-foreground">{stats?.activeUsers || 0} active</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Target className="w-4 h-4" />
                Active Campaigns
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="stat-campaigns">
                {stats?.activeCampaigns || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Emails Sent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-team-emails">
                {stats?.totalEmailsSent?.toLocaleString() || "0"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Inbox className="w-4 h-4" />
                Reply Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="stat-reply-rate">
                {stats?.replyRate || 0}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Meetings Booked
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600" data-testid="stat-meetings">
                {stats?.totalMeetingsBooked || "0"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs - STRICT per Manager PRD */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="w-4 h-4 mr-2" />
              Team Dashboard
            </TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">
              <Users className="w-4 h-4 mr-2" />
              Team Members
            </TabsTrigger>
            <TabsTrigger value="campaigns" data-testid="tab-campaigns">
              <Target className="w-4 h-4 mr-2" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="performance" data-testid="tab-performance">
              <TrendingUp className="w-4 h-4 mr-2" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab - Team Dashboard per Manager PRD */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Total Active Users
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="overview-active-users">
                    {stats?.activeUsers || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">of {stats?.totalUsers || 0} total</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Active Campaigns
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="overview-active-campaigns">
                    {stats?.activeCampaigns || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Emails Sent (Team)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="overview-emails-sent">
                    {stats?.totalEmailsSent?.toLocaleString() || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Replies (Team)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="overview-replies">
                    {analytics?.emailStats?.replied || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats?.replyRate || 0}% reply rate
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Read-only notice */}
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-muted-foreground">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  This is a read-only dashboard. Use the tabs above to view team members, campaigns, and performance details.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Team Members</CardTitle>
                  <div className="flex items-center gap-4">
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search team members..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                        data-testid="input-search-team"
                      />
                    </div>
                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button data-testid="btn-add-user">
                          <UserPlus className="w-4 h-4 mr-2" />
                          Add User
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add New Team Member</DialogTitle>
                          <DialogDescription>
                            Create a new user account for your team. They will receive an email with login instructions.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                              id="email"
                              type="email"
                              placeholder="user@company.com"
                              value={newUser.email}
                              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                              data-testid="input-new-user-email"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="firstName">First Name</Label>
                              <Input
                                id="firstName"
                                placeholder="John"
                                value={newUser.firstName}
                                onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                                data-testid="input-new-user-firstname"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="lastName">Last Name</Label>
                              <Input
                                id="lastName"
                                placeholder="Doe"
                                value={newUser.lastName}
                                onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                                data-testid="input-new-user-lastname"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="role">Role</Label>
                            <Select
                              value={newUser.role}
                              onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                            >
                              <SelectTrigger data-testid="select-new-user-role">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">SDR (User)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setIsCreateDialogOpen(false)}
                            data-testid="btn-cancel-create-user"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => createUserMutation.mutate(newUser)}
                            disabled={createUserMutation.isPending || !newUser.email}
                            data-testid="btn-submit-create-user"
                          >
                            {createUserMutation.isPending ? "Creating..." : "Create User"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {teamLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading team members...</div>
                ) : filteredMembers.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No team members yet</h3>
                    <p className="text-muted-foreground mb-4">Click the "Add User" button above to create your first team member.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Onboarding</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMembers.map((member) => (
                        <TableRow key={member.id} data-testid={`row-member-${member.id}`}>
                          <TableCell className="font-medium">
                            {member.firstName && member.lastName
                              ? `${member.firstName} ${member.lastName}`
                              : "-"}
                          </TableCell>
                          <TableCell>{member.email}</TableCell>
                          <TableCell>{getRoleBadge(member.role)}</TableCell>
                          <TableCell>{getStatusBadge(member.status)}</TableCell>
                          <TableCell>
                            {member.onboardingCompleted ? (
                              <Badge variant="default" className="bg-green-500">Complete</Badge>
                            ) : (
                              <Badge variant="outline">In Progress</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {member.lastLogin
                              ? new Date(member.lastLogin).toLocaleDateString()
                              : "Never"}
                          </TableCell>
                          <TableCell>{new Date(member.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" data-testid={`btn-actions-${member.id}`}>
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem 
                                  data-testid={`action-view-${member.id}`}
                                  onClick={() => setLocation(`/admin/users`)}
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Profile
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  data-testid={`action-performance-${member.id}`}
                                  onClick={() => setPerformanceModal({ open: true, userId: member.id })}
                                >
                                  <BarChart3 className="w-4 h-4 mr-2" />
                                  View Performance
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {member.status === 'pending' && (
                                  <DropdownMenuItem 
                                    data-testid={`action-resend-invite-${member.id}`}
                                    onClick={() => resendInviteMutation.mutate(member.id)}
                                    disabled={resendInviteMutation.isPending}
                                  >
                                    <Send className="w-4 h-4 mr-2" />
                                    {resendInviteMutation.isPending ? 'Sending...' : 'Resend Invitation'}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  data-testid={`action-reset-${member.id}`}
                                  onClick={() => setConfirmDialog({ open: true, type: "reset", userId: member.id })}
                                >
                                  <Shield className="w-4 h-4 mr-2" />
                                  Reset Password
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-red-600"
                                  data-testid={`action-delete-${member.id}`}
                                  onClick={() => setConfirmDialog({ open: true, type: "delete", userId: member.id })}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Deactivate User
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
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Team Campaigns</CardTitle>
                  <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-campaign-filter">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Campaigns</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {campaignsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading campaigns...</div>
                ) : (campaignsData?.campaigns?.length || 0) === 0 ? (
                  <div className="text-center py-8">
                    <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No campaigns found</h3>
                    <p className="text-muted-foreground">Your team hasn't created any campaigns yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign Name</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Prospects</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Replies</TableHead>
                        <TableHead>Reply Rate</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[80px]">Access</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaignsData?.campaigns?.map((campaign) => (
                        <TableRow key={campaign.id} data-testid={`row-campaign-${campaign.id}`}>
                          <TableCell className="font-medium">{campaign.name}</TableCell>
                          <TableCell>{campaign.ownerName || campaign.ownerEmail}</TableCell>
                          <TableCell>{getCampaignStatusBadge(campaign.status)}</TableCell>
                          <TableCell>{campaign.stats.totalProspects}</TableCell>
                          <TableCell>{campaign.stats.sent}</TableCell>
                          <TableCell>{campaign.stats.replies}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={campaign.stats.replyRate} className="w-16 h-2" />
                              <span className="text-sm">{campaign.stats.replyRate}%</span>
                            </div>
                          </TableCell>
                          <TableCell>{new Date(campaign.createdAt).toLocaleDateString()}</TableCell>
                          {/* Read-only per Manager PRD - no campaign actions allowed */}
                          <TableCell>
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              View Only
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Performance Tab - Team-level performance per Manager PRD */}
          <TabsContent value="performance" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Team Performance</h2>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[150px]" data-testid="select-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Emails Sent</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{analytics?.emailStats?.sent?.toLocaleString() || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Total Replies</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{analytics?.emailStats?.replied || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Positive Replies</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{analytics?.emailStats?.positiveReplies || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Reply Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{analytics?.emailStats?.replyRate || 0}%</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      Active
                    </span>
                    <span className="font-semibold">{analytics?.campaignStats?.active || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      Paused
                    </span>
                    <span className="font-semibold">{analytics?.campaignStats?.paused || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                      Draft
                    </span>
                    <span className="font-semibold">{analytics?.campaignStats?.draft || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      Completed
                    </span>
                    <span className="font-semibold">{analytics?.campaignStats?.completed || 0}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Performers</CardTitle>
                  <CardDescription>By emails sent this period</CardDescription>
                </CardHeader>
                <CardContent>
                  {(analytics?.topPerformers?.length || 0) === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No activity this period</p>
                  ) : (
                    <div className="space-y-3">
                      {analytics?.topPerformers?.map((performer, index) => (
                        <div key={performer.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-bold text-muted-foreground w-6">{index + 1}</span>
                            <div>
                              <p className="font-medium">{performer.name}</p>
                              <p className="text-sm text-muted-foreground">{performer.email}</p>
                            </div>
                          </div>
                          <Badge variant="secondary">{performer.emailsSent} emails</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab - Read-only org info per Manager PRD */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Organization Settings</CardTitle>
                <CardDescription>View your organization information (read-only)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Organization Name</Label>
                    <p className="text-lg font-medium" data-testid="org-name">
                      Your Organization
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Your Role</Label>
                    <Badge variant="secondary" data-testid="user-role">Manager</Badge>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Team Size</Label>
                    <p className="text-lg font-medium" data-testid="team-size">
                      {stats?.activeUsers || 0} active members
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    For billing, plan changes, or other administrative settings, please contact your system administrator.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Confirmation Dialog */}
        <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirmDialog.type === "delete" ? "Deactivate User" : "Reset Password"}
              </DialogTitle>
              <DialogDescription>
                {confirmDialog.type === "delete" 
                  ? "Are you sure you want to deactivate this user? They will no longer be able to access the system."
                  : "Are you sure you want to reset this user's password? A temporary password will be generated."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDialog({ open: false, type: "" })}>
                Cancel
              </Button>
              <Button
                variant={confirmDialog.type === "delete" ? "destructive" : "default"}
                onClick={() => {
                  if (confirmDialog.type === "delete" && confirmDialog.userId) {
                    deleteUserMutation.mutate(confirmDialog.userId);
                  } else if (confirmDialog.type === "reset" && confirmDialog.userId) {
                    resetPasswordMutation.mutate(confirmDialog.userId);
                  }
                }}
                disabled={deleteUserMutation.isPending || resetPasswordMutation.isPending}
              >
                {deleteUserMutation.isPending || resetPasswordMutation.isPending 
                  ? "Processing..." 
                  : confirmDialog.type === "delete" ? "Deactivate" : "Reset Password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Performance Modal */}
        <Dialog open={performanceModal.open} onOpenChange={(open) => setPerformanceModal({ ...performanceModal, open })}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Team Member Performance
              </DialogTitle>
              <DialogDescription>
                Detailed performance metrics and campaign overview
              </DialogDescription>
            </DialogHeader>
            {performanceLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading performance data...</div>
            ) : userPerformance ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{userPerformance.user.name || userPerformance.user.email}</h3>
                    <p className="text-sm text-muted-foreground">{userPerformance.user.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={userPerformance.user.role === "admin" ? "default" : "secondary"}>
                        {userPerformance.user.role === "admin" ? "Manager" : "SDR"}
                      </Badge>
                      <Badge variant={userPerformance.user.status === "active" ? "default" : "outline"}>
                        {userPerformance.user.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>Last login: {userPerformance.user.lastLogin ? new Date(userPerformance.user.lastLogin).toLocaleDateString() : "Never"}</p>
                    <p>Joined: {new Date(userPerformance.user.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{userPerformance.performance?.emailsSent || 0}</div>
                      <p className="text-xs text-muted-foreground">Emails Sent</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{userPerformance.performance?.replies || 0}</div>
                      <p className="text-xs text-muted-foreground">Replies</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-green-600">{userPerformance.performance?.positiveReplies || 0}</div>
                      <p className="text-xs text-muted-foreground">Positive Replies</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{userPerformance.performance?.replyRate || 0}%</div>
                      <p className="text-xs text-muted-foreground">Reply Rate</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Resources</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active Mailboxes</span>
                        <span className="font-medium">{userPerformance.resources?.activeMailboxes || 0} / {userPerformance.resources?.totalMailboxes || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Prospects</span>
                        <span className="font-medium">{(userPerformance.resources?.totalProspects || 0).toLocaleString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Campaigns</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active Campaigns</span>
                        <span className="font-medium text-green-600">{userPerformance.performance?.activeCampaigns || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Campaigns</span>
                        <span className="font-medium">{userPerformance.performance?.totalCampaigns || 0}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {(userPerformance.recentCampaigns?.length || 0) > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Recent Campaigns</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Prospects</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {userPerformance.recentCampaigns.map((campaign) => (
                          <TableRow key={campaign.id}>
                            <TableCell className="font-medium">{campaign.name}</TableCell>
                            <TableCell>
                              <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                                {campaign.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{campaign.totalProspects}</TableCell>
                            <TableCell>{new Date(campaign.createdAt).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No performance data available</div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPerformanceModal({ open: false })}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Campaign Reassign Modal */}
        <Dialog open={reassignModal.open} onOpenChange={(open) => setReassignModal({ ...reassignModal, open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5" />
                Reassign Campaign
              </DialogTitle>
              <DialogDescription>
                Transfer "{reassignModal.campaignName}" to another team member
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Select New Owner</Label>
                <Select value={selectedNewOwner} onValueChange={setSelectedNewOwner}>
                  <SelectTrigger data-testid="select-new-owner">
                    <SelectValue placeholder="Choose a team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers
                      .filter(m => m.isActive && m.status === "active")
                      .map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.firstName && member.lastName 
                            ? `${member.firstName} ${member.lastName} (${member.email})`
                            : member.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setReassignModal({ open: false }); setSelectedNewOwner(""); }}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (reassignModal.campaignId && selectedNewOwner) {
                    reassignCampaignMutation.mutate({ campaignId: reassignModal.campaignId, newUserId: selectedNewOwner });
                  }
                }}
                disabled={!selectedNewOwner || reassignCampaignMutation.isPending}
                data-testid="btn-confirm-reassign"
              >
                {reassignCampaignMutation.isPending ? "Reassigning..." : "Reassign Campaign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
